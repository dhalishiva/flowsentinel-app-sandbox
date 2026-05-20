// deno-lint-ignore-file
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.14';
import { ImapFlow } from 'npm:imapflow@1.0.164';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CONNECTION_ALERT_INTERVAL_MS = 0;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

interface SmtpConfig {
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  from_email: string;
  from_name: string;
}

interface Mailbox {
  id: string;
  email: string;
  imap_host: string;
  imap_port: number;
  tenant_id: string;
  client_id: string;
  refresh_token: string;
  stale_threshold_minutes: number;
  last_stale_alert_at: string | null;
  last_connection_alert_at: string | null;
  alerts_enabled: boolean;
}

interface StaleEmail {
  subject: string;
  from: string;
  date: Date;
  ageMinutes: number;
}

async function getAccessToken(mb: Mailbox): Promise<string> {
  const params = new URLSearchParams({
    client_id: mb.client_id,
    grant_type: 'refresh_token',
    refresh_token: mb.refresh_token,
    scope:
      'offline_access https://outlook.office.com/IMAP.AccessAsUser.All',
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${mb.tenant_id}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  const data = await res.json();

  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
      data.error ||
      'Token exchange failed'
    );
  }

  return data.access_token;
}

async function findStaleEmails(
  mb: Mailbox,
  accessToken: string
): Promise<StaleEmail[]> {
  const client = new ImapFlow({
    host: mb.imap_host,
    port: mb.imap_port,
    secure: true,
    auth: {
      user: mb.email,
      accessToken,
    },
    logger: false,
  });

  const stale: StaleEmail[] = [];

  try {
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');

    try {
      const cutoff = new Date(
        Date.now() - mb.stale_threshold_minutes * 60 * 1000
      );

      const beforeDate = new Date(
        cutoff.getTime() + 24 * 60 * 60 * 1000
      );

      const messages = client.fetch(
        {
          since: '01-Jan-2000',
          before: beforeDate
            .toUTCString()
            .split(' ')
            .slice(1, 4)
            .join('-'),
        },
        {
          envelope: true,
          internalDate: true,
        }
      );

      for await (const msg of messages) {
        const date =
          msg.internalDate ||
          (msg.envelope?.date
            ? new Date(msg.envelope.date)
            : null);

        if (!date) continue;

        const ageMinutes = Math.floor(
          (Date.now() - new Date(date).getTime()) / 60000
        );

        if (ageMinutes >= mb.stale_threshold_minutes) {
          stale.push({
            subject: msg.envelope?.subject || '(no subject)',
            from:
              msg.envelope?.from?.[0]?.address ||
              '(unknown)',
            date: new Date(date),
            ageMinutes,
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return stale;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]!)
  );
}

function emailShell(
  headerColor: string,
  headerLabel: string,
  mailboxEmail: string,
  body: string
): string {
  const now = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr>
<td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">

<tr>
<td style="background:${headerColor};border-radius:8px 8px 0 0;padding:0;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:20px 28px;">
<p style="margin:0;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.7);">
FlowSentinel Alert
</p>

<p style="margin:6px 0 0 0;font-size:20px;font-weight:700;color:#ffffff;">
${headerLabel}
</p>

<p style="margin:4px 0 0 0;font-size:13px;color:rgba(255,255,255,0.85);">
${escapeHtml(mailboxEmail)}
</p>
</td>

<td style="padding:20px 28px 20px 0;text-align:right;vertical-align:top;">
<span style="display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.35);border-radius:20px;padding:4px 14px;font-size:11px;font-weight:700;color:#fff;letter-spacing:1.5px;text-transform:uppercase;">
URGENT
</span>
</td>
</tr>
</table>
</td>
</tr>

<tr>
<td style="background:#ffffff;padding:32px 28px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
${body}
</td>
</tr>

<tr>
<td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:20px 28px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td>
<p style="margin:0;font-size:13px;font-weight:600;color:#1e293b;">
Team FlowSentinel
</p>

<p style="margin:2px 0 0 0;font-size:11px;color:#94a3b8;">
flowsentinel.cloud · Automated Workflow Monitoring
</p>
</td>

<td style="text-align:right;vertical-align:middle;">
<p style="margin:0;font-size:11px;color:#cbd5e1;">
${now}
</p>
</td>
</tr>
</table>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>
`;
}

function buildStaleEmailHtml(
  mb: Mailbox,
  stale: StaleEmail[]
): string {
  const sample = stale[0];

  const arrivedAt = sample.date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });

  const moreNote =
    stale.length > 1
      ? `
<p style="margin:16px 0 0 0;font-size:13px;color:#64748b;line-height:1.6;">
There may be more emails older than the
<strong>${mb.stale_threshold_minutes}-minute threshold</strong>
in this mailbox.
</p>
`
      : '';

  const body = `
<p style="margin:0 0 6px 0;font-size:15px;color:#1e293b;">
Hi Team,
</p>

<p style="margin:0 0 20px 0;font-size:14px;color:#475569;line-height:1.7;">
Stale mail has been detected for the mailbox
<strong>${escapeHtml(mb.email)}</strong>.
Your immediate attention is required.
</p>

<p style="margin:0 0 8px 0;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;">
Example of stale email detected
</p>

<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;border-collapse:collapse;">
<thead>
<tr style="background:#f1f5f9;">
<th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;">
Subject
</th>

<th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;">
Arrived At
</th>

<th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;">
Threshold
</th>
</tr>
</thead>

<tbody>
<tr>
<td style="padding:12px;font-size:13px;color:#1e293b;">
${escapeHtml(sample.subject)}
</td>

<td style="padding:12px;font-size:13px;color:#1e293b;white-space:nowrap;">
${arrivedAt}
</td>

<td style="padding:12px;font-size:13px;color:#1e293b;white-space:nowrap;">
${mb.stale_threshold_minutes} min
</td>
</tr>
</tbody>
</table>

${moreNote}

<p style="margin:20px 0 0 0;font-size:14px;color:#475569;line-height:1.7;">
Kindly check if <strong>Mobile Approval</strong> is working from the ReadSoft side.
</p>

<table cellpadding="0" cellspacing="0" style="margin-top:24px;width:100%;">
<tr>
<td style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:0 6px 6px 0;padding:12px 16px;">
<p style="margin:0;font-size:13px;color:#166534;line-height:1.6;">
<strong>Recommended action:</strong>
Check the ReadSoft Mobile Approval runtime on your Tomcat or NetWeaver server.
If the service appears running but emails are not being processed, a restart may be required.
</p>
</td>
</tr>
</table>
`;

  return emailShell(
    '#dc2626',
    'Stale Mail Detected',
    mb.email,
    body
  );
}

function buildConnectionFailureHtml(
  mb: Mailbox,
  errorMessage: string
): string {
  const looksLikeAuth =
    /invalid_grant|AADSTS|AUTHENTICATE|unauthorized|expired/i.test(
      errorMessage
    );

  const authHighlight = looksLikeAuth
    ? `
<table cellpadding="0" cellspacing="0" style="margin:20px 0;width:100%;">
<tr>
<td style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 6px 6px 0;padding:12px 16px;">
<p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
<strong>Authentication issue detected.</strong>
The OAuth refresh token for this mailbox appears to have expired or been revoked.
The refresh token must be regenerated manually and updated in FlowSentinel.
</p>
</td>
</tr>
</table>
`
    : '';

  const body = `
<p style="margin:0 0 6px 0;font-size:15px;color:#1e293b;">
Hi Team,
</p>

<p style="margin:0 0 24px 0;font-size:14px;color:#475569;line-height:1.7;">
The application failed to connect to mailbox
<strong>${escapeHtml(mb.email)}</strong>.
Immediate action is required.
</p>

${authHighlight}

<p style="margin:0 0 10px 0;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;">
Error Detail
</p>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;">
<code style="font-family:'Courier New',Courier,monospace;font-size:12px;color:#1e293b;word-break:break-all;line-height:1.6;">
${escapeHtml(errorMessage)}
</code>
</div>

<p style="margin:20px 0 0 0;font-size:12px;color:#94a3b8;line-height:1.6;">
This alert is sent on every monitoring check until connection is restored.
</p>
`;

  return emailShell(
    '#b91c1c',
    'Mailbox Connection Failed',
    mb.email,
    body
  );
}

async function buildTransporter(smtp: SmtpConfig) {
  const config: any = {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    requireTLS: smtp.port === 587,
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
  };

  if (smtp.username && smtp.password) {
    config.auth = {
      user: smtp.username,
      pass: smtp.password,
    };
  }

  return nodemailer.createTransport(config);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');

  if (!expectedSecret || cronSecret !== expectedSecret) {
    return jsonResponse(
      {
        success: false,
        error: 'Unauthorized',
      },
      401
    );
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: licConfig } = await adminClient
    .from('license_config')
    .select('expires_at')
    .eq('id', 1)
    .maybeSingle();

  if (!licConfig || new Date(licConfig.expires_at) < new Date()) {
    return jsonResponse({
      success: false,
      error: 'License expired',
    });
  }

  const summary = {
    checked: 0,
    stale_found: 0,
    stale_alerts_sent: 0,
    connection_failures: 0,
    connection_alerts_sent: 0,
    skipped_no_recipients: 0,
    errors: [] as string[],
  };

  try {
    const { data: mailboxes, error: mbErr } = await adminClient
      .from('mailboxes')
      .select('*')
      .eq('alerts_enabled', true);

    if (mbErr) {
      throw new Error(mbErr.message);
    }

    if (!mailboxes?.length) {
      return jsonResponse({
        success: true,
        summary,
      });
    }

    summary.checked = mailboxes.length;

    let smtp: SmtpConfig | null = null;
    let transporter: any = null;

    const ensureTransporter = async () => {
      if (transporter) return;

      const { data } = await adminClient
        .from('smtp_config')
        .select('*')
        .eq('id', 1)
        .single();

      if (!data) {
        throw new Error('SMTP not configured');
      }

      smtp = data;
      transporter = await buildTransporter(smtp);
    };

        for (const mb of mailboxes as Mailbox[]) {
      const updates: any = {
        last_sync_at: new Date().toISOString(),
      };

      try {
        const accessToken = await getAccessToken(mb);
        const stale = await findStaleEmails(mb, accessToken);

        updates.unread_count = stale.length;
        updates.status = stale.length > 0 ? 'error' : 'active';
        updates.last_error = null;

        if (stale.length === 0) {
          await adminClient
            .from('mailboxes')
            .update(updates)
            .eq('id', mb.id);

          continue;
        }

        summary.stale_found++;

        // NO THROTTLING FOR STALE MAIL
        // alert on every cron run if stale emails exist

        const { data: recipients } = await adminClient
          .from('notification_recipients')
          .select('email')
          .eq('mailbox_id', mb.id);

        const emails = (recipients || []).map((r) => r.email);

        if (!emails.length) {
          summary.skipped_no_recipients++;

          await adminClient
            .from('mailboxes')
            .update(updates)
            .eq('id', mb.id);

          continue;
        }

        await ensureTransporter();

        const subject = `[FlowSentinel] Stale Mail Detected - ${mb.email}`;

        await transporter.sendMail({
          from: `"${smtp!.from_name}" <${smtp!.from_email}>`,
          to: emails.join(','),
          subject,
          html: buildStaleEmailHtml(mb, stale),

          priority: 'high',

          headers: {
            'X-Priority': '1',
            'X-MSMail-Priority': 'High',
            Importance: 'high',
          },
        });

        await adminClient.from('alert_history').insert({
          mailbox_id: mb.id,
          alert_type: 'stale_mail',
          recipients: emails,
          subject,
          success: true,
        });

        updates.last_stale_alert_at = new Date().toISOString();

        await adminClient
          .from('mailboxes')
          .update(updates)
          .eq('id', mb.id);

        summary.stale_alerts_sent++;

      } catch (err) {
        const msg = (err as Error).message;

        summary.connection_failures++;
        summary.errors.push(`${mb.email}: ${msg}`);

        updates.status = 'error';
        updates.last_error = msg;

        const lastConnAlert = mb.last_connection_alert_at
          ? new Date(mb.last_connection_alert_at).getTime()
          : 0;

        const shouldAlert =
          Date.now() - lastConnAlert >= CONNECTION_ALERT_INTERVAL_MS;

        if (shouldAlert) {
          try {
            const { data: recipients } = await adminClient
              .from('notification_recipients')
              .select('email')
              .eq('mailbox_id', mb.id);

            const emails = (recipients || []).map((r) => r.email);

            if (emails.length > 0) {
              await ensureTransporter();

              const subject =
                `[FlowSentinel] Immediate Action Required - ${mb.email} connection is not working`;

              await transporter.sendMail({
                from: `"${smtp!.from_name}" <${smtp!.from_email}>`,
                to: emails.join(','),
                subject,
                html: buildConnectionFailureHtml(mb, msg),

                priority: 'high',

                headers: {
                  'X-Priority': '1',
                  'X-MSMail-Priority': 'High',
                  Importance: 'high',
                },
              });

              await adminClient.from('alert_history').insert({
                mailbox_id: mb.id,
                alert_type: 'connection_failure',
                recipients: emails,
                subject,
                success: true,
              });

              updates.last_connection_alert_at =
                new Date().toISOString();

              summary.connection_alerts_sent++;
            }
          } catch (sendErr) {
            await adminClient.from('alert_history').insert({
              mailbox_id: mb.id,
              alert_type: 'connection_failure',
              recipients: [],
              subject: 'connection failure alert send failed',
              success: false,
              error_message: (sendErr as Error).message,
            });
          }
        }

        await adminClient
          .from('mailboxes')
          .update(updates)
          .eq('id', mb.id);
      }
    }

    return jsonResponse({
      success: true,
      summary,
    });

  } catch (err) {
    return jsonResponse(
      {
        success: false,
        error: (err as Error).message,
        summary,
      },
      500
    );
  }
});