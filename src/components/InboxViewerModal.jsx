import { useState } from 'react';
import { X, RefreshCw, Mail, AlertTriangle, CheckCircle, Inbox } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { fetchInbox } from '../lib/edgeFunctions';

export default function InboxViewerModal({ mailbox, onClose }) {
  const { supabase } = useAuth();

  // 'idle' | 'loading' | 'done' | 'error'
  const [state, setState]   = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError]   = useState('');

  const handleFetch = async () => {
    setState('loading');
    setError('');
    try {
      const data = await fetchInbox(supabase, mailbox.id);
      setResult(data);
      setState('done');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  };

  const formatAge = (minutes) => {
    if (minutes < 60)   return `${minutes} min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
  };

  const formatArrival = (iso) =>
    new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    }) + ' UTC';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <Inbox size={16} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                Inbox Viewer
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {mailbox.email}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5">

          {/* Idle state */}
          {state === 'idle' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-14 w-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                <Inbox size={24} className="text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Check what's in the inbox
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 max-w-xs">
                Fetches all emails currently in the mailbox inbox and shows
                their arrival time and age. Emails beyond the{' '}
                <strong>{mailbox.stale_threshold_minutes}-minute</strong> threshold
                are highlighted.
              </p>
              <button
                onClick={handleFetch}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 text-sm font-medium flex items-center gap-2"
              >
                <RefreshCw size={14} /> Fetch Inbox
              </button>
            </div>
          )}

          {/* Loading state */}
          {state === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12">
              <RefreshCw size={28} className="animate-spin text-indigo-600 mb-4" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Connecting to mailbox...
              </p>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
              </div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">
                Failed to fetch inbox
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-sm mb-6">
                {error}
              </p>
              <button
                onClick={handleFetch}
                className="px-5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <RefreshCw size={13} /> Try again
              </button>
            </div>
          )}

          {/* Results state */}
          {state === 'done' && result && (
            <>
              {/* Summary row */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <Mail size={13} className="text-slate-500" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {result.total} email{result.total !== 1 ? 's' : ''} in inbox
                  </span>
                </div>
                {result.staleCount > 0 ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-full">
                    <AlertTriangle size={13} className="text-red-600 dark:text-red-400" />
                    <span className="text-xs font-medium text-red-700 dark:text-red-400">
                      {result.staleCount} stale (beyond {result.threshold} min threshold)
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-full">
                    <CheckCircle size={13} className="text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      No stale emails — inbox looks healthy
                    </span>
                  </div>
                )}
                <button
                  onClick={handleFetch}
                  className="ml-auto text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>

              {/* Empty inbox */}
              {result.total === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CheckCircle size={32} className="text-emerald-500 mb-3" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Inbox is empty
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No emails in the inbox. Mobile Approval is processing correctly.
                  </p>
                </div>
              ) : (
                /* Email table */
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800">
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
                        Subject
                      </th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700 hidden sm:table-cell">
                        From
                      </th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700 hidden md:table-cell">
                        Arrived
                      </th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
                        Age
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.emails.map((email, i) => (
                      <tr
                        key={i}
                        className={`border-b border-slate-100 dark:border-slate-800 ${
                          email.isStale
                            ? 'bg-red-50 dark:bg-red-900/10'
                            : i % 2 === 0
                              ? 'bg-white dark:bg-slate-900'
                              : 'bg-slate-50/50 dark:bg-slate-800/30'
                        }`}
                      >
                        <td className="px-3 py-2.5 max-w-[200px]">
                          <div className="flex items-center gap-2">
                            {email.isStale && (
                              <AlertTriangle
                                size={12}
                                className="text-red-500 shrink-0"
                              />
                            )}
                            <span className={`text-xs truncate ${
                              email.isStale
                                ? 'text-red-700 dark:text-red-400 font-medium'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}>
                              {email.subject}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[140px] block">
                            {email.from}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell">
                          <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {formatArrival(email.arrivedAt)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`text-xs font-semibold whitespace-nowrap ${
                            email.isStale
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}>
                            {formatAge(email.ageMinutes)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}