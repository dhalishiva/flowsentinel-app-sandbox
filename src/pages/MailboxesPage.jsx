import { useEffect, useState } from 'react';
import {
  Plus, Mail, Bell, Key, Trash2,
  RefreshCw, CheckCircle, Edit2, AlertTriangle, X,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import Badge from '../components/Badge';
import TokenHealthBar from '../components/TokenHealthBar';
import AddMailboxModal from '../components/AddMailboxModal';
import RegenerateTokenModal from '../components/RegenerateTokenModal';
import AlertConfigModal from '../components/AlertConfigModal';
import { validateMailbox } from '../lib/edgeFunctions';

export default function MailboxesPage() {
  const { supabase } = useAuth();
  const [mailboxes, setMailboxes] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [editFor, setEditFor]     = useState(null);
  const [regenFor, setRegenFor]   = useState(null);
  const [alertFor, setAlertFor]   = useState(null);

  // Confirm modals
  const [deleteTarget, setDeleteTarget]     = useState(null);
  const [markDoneTarget, setMarkDoneTarget] = useState(null);
  const [deleting, setDeleting]             = useState(false);
  const [markingDone, setMarkingDone]       = useState(false);

  // Mark complete modal state
  const [newRefreshToken, setNewRefreshToken] = useState('');
  const [markDoneError, setMarkDoneError]     = useState('');
  // 'idle' | 'validating' | 'saving' | 'done' | 'error'
  const [markDoneStep, setMarkDoneStep]       = useState('idle');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('mailboxes').select('*').order('created_at', { ascending: false });
    setMailboxes(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateMailbox = (id, changes) => {
    setMailboxes(prev => prev.map(mb => mb.id === id ? { ...mb, ...changes } : mb));
  };

  const handleDelete = async () => {
    setDeleting(true);
    await supabase.from('mailboxes').delete().eq('id', deleteTarget.id);
    setMailboxes(prev => prev.filter(mb => mb.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
  };

  // ── Mark as regenerated ───────────────────────────────────────────────────
  // Step 1: validate new token against Microsoft using existing tenant_id + client_id
  // Step 2: only if valid, save to DB and reset the 90-day timer
  const handleMarkRegenerated = async () => {
    setMarkDoneError('');

    const token = newRefreshToken.trim();
    if (!token) {
      setMarkDoneError('Please paste the new refresh token before confirming.');
      return;
    }

    setMarkingDone(true);

    // ── Step 1: Validate with Microsoft ──────────────────────────────────
    setMarkDoneStep('validating');
    try {
      await validateMailbox(
        supabase,
        markDoneTarget.tenant_id,
        markDoneTarget.client_id,
        token,
      );
    } catch (err) {
      setMarkDoneError(`Token validation failed: ${err.message}`);
      setMarkDoneStep('error');
      setMarkingDone(false);
      return;
    }

    // ── Step 2: Save to DB ────────────────────────────────────────────────
    setMarkDoneStep('saving');
    const now = new Date().toISOString();

    const { error: dbErr } = await supabase.from('mailboxes').update({
      refresh_token:      token,
      token_generated_at: now,
      trigger_completed:  true,
      token_expires_at:   null,
      token_expiry_type:  'auto',
      status:             'active',
      last_error:         null,
    }).eq('id', markDoneTarget.id);

    if (dbErr) {
      setMarkDoneError(`Failed to save: ${dbErr.message}`);
      setMarkDoneStep('error');
      setMarkingDone(false);
      return;
    }

    updateMailbox(markDoneTarget.id, {
      refresh_token:      token,
      token_generated_at: now,
      trigger_completed:  true,
      token_expires_at:   null,
      token_expiry_type:  'auto',
      status:             'active',
      last_error:         null,
    });

    setMarkDoneStep('done');
    setMarkingDone(false);
  };

  const handleMarkDoneClose = () => {
    setMarkDoneTarget(null);
    setNewRefreshToken('');
    setMarkDoneError('');
    setMarkDoneStep('idle');
  };

  // Step label for the button
  const markDoneButtonLabel = () => {
    switch (markDoneStep) {
      case 'validating': return <><RefreshCw className="animate-spin" size={14} /> Validating token...</>;
      case 'saving':     return <><RefreshCw className="animate-spin" size={14} /> Saving...</>;
      default:           return <><CheckCircle size={14} /> Confirm</>;
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Mailboxes</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            Manage ReadSoft approval mailboxes and token health.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
          <Plus size={16} /> Add Mailbox
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <RefreshCw className="animate-spin mx-auto mb-2" size={20} /> Loading...
        </div>
      ) : mailboxes.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-12 text-center">
          <Mail size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-600 dark:text-slate-300 font-medium mb-1">No mailboxes connected</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Add your first mailbox to start monitoring.</p>
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
            Add Mailbox
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {mailboxes.map(mb => (
            <div key={mb.id}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 hover:shadow-md transition">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Mail size={18} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 dark:text-white truncate text-sm">{mb.email}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{mb.client_id.slice(0, 8)}...</p>
                  </div>
                </div>
                <Badge status={mb.status} />
              </div>

              {mb.last_error && (
                <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex gap-2">
                  <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600 dark:text-red-400 line-clamp-2">{mb.last_error}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  ['Stale threshold', `${mb.stale_threshold_minutes} min`],
                  ['Last sync', mb.last_sync_at
                    ? new Date(mb.last_sync_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                    : '—'
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
                  </div>
                ))}
              </div>

              <TokenHealthBar mailbox={mb} />

              <div className="flex gap-1 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
                <button onClick={() => setAlertFor(mb)}
                  className="flex-1 px-2 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xs flex items-center justify-center gap-1.5 text-slate-700 dark:text-slate-300"
                  title="Configure alerts">
                  <Bell size={13} /> Alerts
                </button>
                <button onClick={() => setRegenFor(mb)}
                  className="flex-1 px-2 py-2 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 rounded-lg text-xs flex items-center justify-center gap-1.5"
                  title="Regenerate token">
                  <Key size={13} /> Regen
                </button>
                <button onClick={() => setEditFor(mb)}
                  className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg"
                  title="Edit mailbox">
                  <Edit2 size={15} />
                </button>
                <button onClick={() => {
                  setMarkDoneTarget(mb);
                  setNewRefreshToken('');
                  setMarkDoneError('');
                  setMarkDoneStep('idle');
                }}
                  className="px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg"
                  title="Mark token as regenerated">
                  <CheckCircle size={15} />
                </button>
                <button onClick={() => setDeleteTarget(mb)}
                  className="px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg"
                  title="Remove mailbox">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 mx-auto mb-4">
              <Trash2 size={20} className="text-red-600 dark:text-red-400" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-center mb-2">Remove mailbox?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-1">
              This will permanently remove
            </p>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 text-center mb-4 break-all">
              {deleteTarget.email}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 text-center mb-5">
              All alert history for this mailbox will also be deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="flex-1 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2">
                {deleting ? <RefreshCw className="animate-spin" size={14} /> : <Trash2 size={14} />}
                {deleting ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mark as regenerated modal ── */}
      {markDoneTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">

            {/* Success state */}
            {markDoneStep === 'done' ? (
              <>
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mx-auto mb-4">
                  <CheckCircle size={20} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-white text-center mb-2">
                  Token updated successfully
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">
                  The new refresh token has been validated and saved.
                  The 90-day timer has been reset.
                </p>
                <button onClick={handleMarkDoneClose}
                  className="w-full py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
                  Done
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mx-auto mb-4">
                  <CheckCircle size={20} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-white text-center mb-2">
                  Mark token as regenerated
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-4">
                  Paste the new refresh token for{' '}
                  <strong className="text-slate-700 dark:text-slate-300">
                    {markDoneTarget.email}
                  </strong>.
                  We'll verify it with Microsoft before saving.
                </p>

                {/* Token input */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    New refresh token
                  </label>
                  <textarea
                    rows={3}
                    value={newRefreshToken}
                    onChange={e => { setNewRefreshToken(e.target.value); setMarkDoneError(''); }}
                    placeholder="Paste new refresh token here..."
                    disabled={markingDone}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-mono resize-none disabled:opacity-50"
                  />
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
                  <p className="text-xs text-amber-800 dark:text-amber-300 text-center">
                    Only confirm if you have already updated the token in
                    ReadSoft's backend config and restarted Tomcat.
                  </p>
                </div>

                {markDoneError && (
                  <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400 text-center">
                      {markDoneError}
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={handleMarkDoneClose} disabled={markingDone}
                    className="flex-1 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium disabled:opacity-50">
                    Cancel
                  </button>
                  <button
                    onClick={handleMarkRegenerated}
                    disabled={markingDone || !newRefreshToken.trim()}
                    className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2">
                    {markDoneButtonLabel()}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showAdd  && <AddMailboxModal onClose={() => setShowAdd(false)} onCreated={load} />}
      {editFor  && <AddMailboxModal existing={editFor} onClose={() => setEditFor(null)} onCreated={load} />}
      {regenFor && <RegenerateTokenModal mailbox={regenFor} onClose={() => setRegenFor(null)} onSuccess={load} />}
      {alertFor && <AlertConfigModal mailbox={alertFor} onClose={() => setAlertFor(null)} onSaved={load} />}
    </div>
  );
}