// deno-lint-ignore-file
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ImapFlow }     from 'npm:imapflow@1.0.164';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── Auth check ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ success: false, error: 'Not authenticated' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ success: false, error: 'Invalid session' }, 401);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: adminRow } = await adminClient
      .from('admins')
      .select('is_active, approval_status')
      .eq('id', user.id)
      .single();

    if (!adminRow?.is_active || adminRow.approval_status !== 'approved') {
      return json({ success: false, error: 'Not authorized' }, 403);
    }

    // ── Get mailbox ──────────────────────────────────────────────────────────
    const { mailbox_id } = await req.json();
    if (!mailbox_id) return json({ success: false, error: 'mailbox_id is required' }, 400);

    const { data: mb, error: mbErr } = await adminClient
      .from('mailboxes')
      .select('*')
      .eq('id', mailbox_id)
      .single();

    if (mbErr || !mb) return json({ success: false, error: 'Mailbox not found' }, 404);

    // ── Get OAuth access token from Microsoft ────────────────────────────────
    const params = new URLSearchParams({
      client_id:     mb.client_id,
      grant_type:    'refresh_token',
      refresh_token: mb.refresh_token,
      scope:         'offline_access https://outlook.office.com/IMAP.AccessAsUser.All',
    });

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${mb.tenant_id}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      }
    );

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
    }

    // ── Connect to IMAP and fetch all inbox emails ───────────────────────────
    const client = new ImapFlow({
      host:   mb.imap_host,
      port:   mb.imap_port,
      secure: true,
      auth:   { user: mb.email, accessToken: tokenData.access_token },
      logger: false,
    });

    const emails: {
      subject: string;
      from: string;
      arrivedAt: string;
      ageMinutes: number;
      isStale: boolean;
    }[] = [];

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        // Get total message count first
        const status = await client.status('INBOX', { messages: true });
        const total  = status.messages ?? 0;

        if (total > 0) {
          const messages = client.fetch('1:*', { envelope: true, internalDate: true });

          for await (const msg of messages) {
            const date = msg.internalDate
              || (msg.envelope?.date ? new Date(msg.envelope.date) : null);

            if (!date) continue;

            const ageMinutes = Math.floor(
              (Date.now() - new Date(date).getTime()) / 60000
            );

            emails.push({
              subject:    msg.envelope?.subject   || '(no subject)',
              from:       msg.envelope?.from?.[0]?.address || '(unknown)',
              arrivedAt:  new Date(date).toISOString(),
              ageMinutes,
              isStale:    ageMinutes >= mb.stale_threshold_minutes,
            });
          }

          // Sort oldest first so stale emails appear at top
          emails.sort((a, b) => a.ageMinutes - b.ageMinutes);
          emails.reverse();
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }

    return json({
      success:    true,
      total:      emails.length,
      staleCount: emails.filter(e => e.isStale).length,
      threshold:  mb.stale_threshold_minutes,
      emails,
    });

  } catch (err) {
    console.error('fetch-inbox error:', (err as Error).message);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});