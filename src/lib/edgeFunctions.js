// // edgeFunctions.js
// // Gets the Supabase client dynamically from localStorage-persisted tenant
// // rather than from the old hardcoded shim.

// import { createClient } from '@supabase/supabase-js';

// function getTenantClient() {
//   try {
//     const raw = localStorage.getItem('fs_tenant');
//     if (!raw) throw new Error('No tenant in storage');
//     const tenant = JSON.parse(raw);
//     if (!tenant?.supabase_url || !tenant?.supabase_anon_key) {
//       throw new Error('Incomplete tenant data');
//     }
//     return createClient(tenant.supabase_url, tenant.supabase_anon_key, {
//       auth: {
//         persistSession: true,
//         storageKey: `fs_auth_${tenant.supabase_url}`,
//       },
//     });
//   } catch (err) {
//     throw new Error(`Could not get tenant client: ${err.message}`);
//   }
// }

// async function callFunction(name, body) {
//   const client = getTenantClient();
//   const { data: { session } } = await client.auth.getSession();

//   const headers = {};
//   if (session) headers.Authorization = `Bearer ${session.access_token}`;

//   const { data, error } = await client.functions.invoke(name, { body, headers });

//   if (error) {
//     let detailMsg = error.message;
//     try {
//       if (error.context && typeof error.context.json === 'function') {
//         const errBody = await error.context.json();
//         if (errBody?.error) detailMsg = errBody.error;
//       }
//     } catch {/* ignore */}
//     throw new Error(detailMsg);
//   }

//   if (data && data.success === false) throw new Error(data.error || 'Function failed');
//   return data;
// }

// export const regenerateToken = (mailbox_id) =>
//   callFunction('regenerate-token', { mailbox_id });

// export const testSmtp = (test_recipient) =>
//   callFunction('test-smtp', { test_recipient });

// export const validateMailbox = (tenant_id, client_id, refresh_token) =>
//   callFunction('validate-mailbox', { tenant_id, client_id, refresh_token });

// export const createAdmin = (email, password, full_name) =>
//   callFunction('create-admin', { email, password, full_name });

// export const requestPasswordReset = (email) =>
//   callFunction('request-password-reset', { email });

// export const verifyPasswordReset = (email, otp, new_password) =>
//   callFunction('verify-password-reset', { email, otp, new_password });

// export const resetOtherPassword = (target_admin_id, new_password) =>
//   callFunction('reset-other-password', { target_admin_id, new_password });

// export const deleteAdmin = (target_admin_id) =>
//   callFunction('delete-admin', { target_admin_id });


// edgeFunctions.js
// Uses the shared Supabase client from AuthContext — never creates its own.
// This prevents multiple GoTrueClient instances in the same browser context.

async function callFunction(supabase, name, body) {
  const { data: { session } } = await supabase.auth.getSession();

  const headers = {};
  if (session) headers.Authorization = `Bearer ${session.access_token}`;

  const { data, error } = await supabase.functions.invoke(name, { body, headers });

  if (error) {
    let detailMsg = error.message;
    try {
      if (error.context && typeof error.context.json === 'function') {
        const errBody = await error.context.json();
        if (errBody?.error) detailMsg = errBody.error;
      }
    } catch {/* ignore */}
    throw new Error(detailMsg);
  }

  if (data && data.success === false) throw new Error(data.error || 'Function failed');
  return data;
}

export const regenerateToken      = (supabase, mailbox_id)                         => callFunction(supabase, 'regenerate-token',        { mailbox_id });
export const testSmtp             = (supabase, test_recipient)                      => callFunction(supabase, 'test-smtp',               { test_recipient });
export const validateMailbox      = (supabase, tenant_id, client_id, refresh_token) => callFunction(supabase, 'validate-mailbox',        { tenant_id, client_id, refresh_token });
export const createAdmin          = (supabase, email, password, full_name)          => callFunction(supabase, 'create-admin',            { email, password, full_name });
export const requestPasswordReset = (supabase, email)                               => callFunction(supabase, 'request-password-reset',  { email });
export const verifyPasswordReset  = (supabase, email, otp, new_password)            => callFunction(supabase, 'verify-password-reset',   { email, otp, new_password });
export const resetOtherPassword   = (supabase, target_admin_id, new_password)       => callFunction(supabase, 'reset-other-password',    { target_admin_id, new_password });
export const deleteAdmin          = (supabase, target_admin_id)                     => callFunction(supabase, 'delete-admin',            { target_admin_id });
export const fetchInbox = (supabase, mailbox_id) => callFunction(supabase, 'fetch-inbox', { mailbox_id });

export const updateLicense = (supabase, expires_at, license_type, max_mailboxes) =>
  callFunction(supabase, 'update-license', { expires_at, license_type, max_mailboxes });
