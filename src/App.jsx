import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Users, LogOut, Activity, RefreshCw, 
  Moon, Sun, History, User, Menu, Ticket, X, Clock,
  AlertTriangle, AlertOctagon,
} from 'lucide-react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import LoginPage        from './pages/LoginPage';
import AdminsPage       from './pages/AdminsPage';
import MailboxesPage    from './pages/MailboxesPage';
import SmtpSettingsPage from './pages/SmtpSettingsPage';
import AlertHistoryPage from './pages/AlertHistoryPage';
import ProfilePage      from './pages/ProfilePage';
import SupportPage      from './pages/Supportpage';

// ── Auto logout config ────────────────────────────────────────────────────────
const IDLE_TIMEOUT_MS  = 30 * 60 * 1000; // 30 minutes idle → logout
const WARN_BEFORE_MS   =  5 * 60 * 1000; // show warning 5 min before logout
const ACTIVITY_EVENTS  = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

// ── License banner config ─────────────────────────────────────────────────────
const LICENSE_WARN_DAYS = 30; // amber banner starts showing this many days before expiry

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*"     element={<ProtectedShell />} />
      </Routes>
    </AuthProvider>
  );
}

function ProtectedShell() {
  const { session, admin, tenant, loading, signOut, darkMode, toggleDarkMode } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Auto logout state ─────────────────────────────────────────────────────
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [countdown, setCountdown]             = useState(WARN_BEFORE_MS / 1000);
  const idleTimerRef    = useRef(null);
  const warnTimerRef    = useRef(null);
  const countdownRef    = useRef(null);
  const isLoggedIn      = !!session && !!admin;

  const doLogout = useCallback(async () => {
    setShowIdleWarning(false);
    await signOut();
    navigate('/login');
  }, [signOut, navigate]);

  const resetIdleTimer = useCallback(() => {
    if (!isLoggedIn) return;
    setShowIdleWarning(false);
    setCountdown(WARN_BEFORE_MS / 1000);
    clearTimeout(idleTimerRef.current);
    clearTimeout(warnTimerRef.current);
    clearInterval(countdownRef.current);

    // Show warning at (IDLE_TIMEOUT_MS - WARN_BEFORE_MS)
    warnTimerRef.current = setTimeout(() => {
      setShowIdleWarning(true);
      setCountdown(WARN_BEFORE_MS / 1000);
      countdownRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) {
            clearInterval(countdownRef.current);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }, IDLE_TIMEOUT_MS - WARN_BEFORE_MS);

    // Auto logout after full idle timeout
    idleTimerRef.current = setTimeout(doLogout, IDLE_TIMEOUT_MS);
  }, [isLoggedIn, doLogout]);

  // Set up activity listeners when logged in
  useEffect(() => {
    if (!isLoggedIn) return;
    resetIdleTimer();
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, resetIdleTimer, { passive: true }));
    return () => {
      clearTimeout(idleTimerRef.current);
      clearTimeout(warnTimerRef.current);
      clearInterval(countdownRef.current);
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, resetIdleTimer));
    };
  }, [isLoggedIn, resetIdleTimer]);

  // ── License banner status ─────────────────────────────────────────────────
  // Reads display value from tenant.license.expires_at (the *display* copy in
  // localStorage). The enforcement copy lives in license_config on the tenant
  // Supabase and is invisible to authenticated users. The two are written
  // together on activation and renewal — see LoginPage.handleActivate and the
  // renewal modal on ProfilePage.
  const licenseStatus = useMemo(() => {
    const expiresAt = tenant?.license?.expires_at;
    if (!expiresAt) return { kind: 'none', days: 0 };

    const expiry = new Date(expiresAt);
    if (Number.isNaN(expiry.getTime())) return { kind: 'none', days: 0 };

    const now      = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const days     = Math.floor((expiry.getTime() - now.getTime()) / msPerDay);

    if (days < 0)                  return { kind: 'expired',  days: Math.abs(days) };
    if (days <= LICENSE_WARN_DAYS) return { kind: 'expiring', days };
    return { kind: 'ok', days };
  }, [tenant?.license?.expires_at]);

  // ── Gate 1: Loading ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <RefreshCw className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  // ── Gate 2: No session ────────────────────────────────────────────────────
  if (!session) return <Navigate to="/login" replace />;

  // ── Gate 3: Session exists but admin not loaded yet ───────────────────────
  // Show spinner — never show an error here because this is a timing issue,
  // not a real "account not found" situation. The error would flash briefly
  // while loadAdmin is still in flight.
  if (!admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <RefreshCw className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  // ── Gate 4: Pending approval ──────────────────────────────────────────────
  // if (admin.approval_status !== 'approved') {
  //   return (
  //     <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
  //       <div className="text-center max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-800">
  //         <div className="mx-auto h-12 w-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
  //           <span className="text-2xl">⏳</span>
  //         </div>
  //         <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Pending Approval</h2>
  //         <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm">
  //           Your access request has been received. An administrator will review it shortly.
  //         </p>
  //         <button onClick={signOut} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
  //           Sign out
  //         </button>
  //       </div>
  //     </div>
  //   );
  // }

  // ── Gate 5: Account disabled ──────────────────────────────────────────────
  if (!admin.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
        <div className="text-center max-w-md">
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            Your account has been disabled. Contact an administrator.
          </p>
          <button onClick={signOut} className="text-indigo-600 dark:text-indigo-400 underline">Sign out</button>
        </div>
      </div>
    );
  }

  // ── Render app ────────────────────────────────────────────────────────────
  const navItems = [
    { path: '/',        label: 'Mailboxes',     icon: Activity },
    { path: '/alerts',  label: 'Alert History', icon: History  },
    // { path: '/smtp',    label: 'SMTP',          icon: Send     },
    { path: '/admins',  label: 'Admin Users',   icon: Users    },
    { path: '/profile', label: 'My Profile',    icon: User     },
    { path: '/support', label: 'Support',       icon: Ticket   },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  // Profile page is where the renewal modal lives. Banner CTA + sidebar avatar
  // both route there. When the user clicks the Renew button we also pass a
  // hash so the Profile page can auto-open the renewal modal.
  const goRenew = () => {
    closeSidebar();
    navigate('/profile#renew');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-3 text-white">
          <img src="/icon.svg" alt="FlowSentinel" className="h-12 w-12" />
          <span className="font-bold text-lg leading-tight">FlowSentinel</span>
        </div>
        <button onClick={closeSidebar} className="md:hidden text-slate-400 hover:text-white p-1">
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map(item => {
          const active = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path} onClick={closeSidebar}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition text-sm ${
                active
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}>
              <item.icon size={18} className="shrink-0" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-3">
        <button onClick={toggleDarkMode}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white text-sm transition">
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>
        </button>
      </div>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-2">
          <Link to="/profile" onClick={closeSidebar}
            className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-sm hover:bg-indigo-400 shrink-0 text-white"
            title="My Profile">
            {admin.email[0].toUpperCase()}
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{admin.full_name || admin.email}</p>
            <p className="text-xs text-slate-500 truncate">{admin.role}</p>
          </div>
          <button onClick={handleSignOut} className="text-slate-400 hover:text-white shrink-0" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  const formatCountdown = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={closeSidebar} />
      )}

      {/* Mobile sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-slate-900 dark:bg-black transform transition-transform duration-200 ease-in-out md:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 bg-slate-900 dark:bg-black shrink-0">
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <button onClick={() => setSidebarOpen(true)}
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 -ml-1">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <img src="/logo_login.svg" alt="FlowSentinel" className="h-10" />
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
            {navItems.find(n => n.path === location.pathname)?.label ?? ''}
          </span>
        </header>

        {/* ── License banner ── */}
        <LicenseBanner status={licenseStatus} onRenew={goRenew} />

        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/"        element={<MailboxesPage />}    />
            <Route path="/alerts"  element={<AlertHistoryPage />} />
            <Route path="/smtp"    element={<SmtpSettingsPage />} />
            <Route path="/support" element={<SupportPage />}      />
            <Route path="/admins"  element={<AdminsPage />}       />
            <Route path="/profile" element={<ProfilePage />}      />
          </Routes>
        </main>
      </div>

      {/* ── Idle warning modal ── */}
      {showIdleWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="h-14 w-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
              <Clock size={24} className="text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              Still there?
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
              You've been inactive for a while. You'll be logged out automatically in:
            </p>
            <p className="text-4xl font-bold text-amber-500 mb-6 font-mono">
              {formatCountdown(countdown)}
            </p>
            <div className="flex gap-3">
              <button onClick={handleSignOut}
                className="flex-1 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium">
                Sign out now
              </button>
              <button onClick={resetIdleTimer}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 text-sm font-medium">
                Stay logged in
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── License banner component ────────────────────────────────────────────────
// Shows a red banner when expired, amber when ≤30 days remaining, nothing
// otherwise. No dismiss control by design — this is a kill-switch indicator.
function LicenseBanner({ status, onRenew }) {
  if (status.kind === 'ok' || status.kind === 'none') return null;

  const expired  = status.kind === 'expired';
  const days     = status.days;

  const headline = expired
    ? (days === 0
        ? 'Your license expired today. Monitoring has been paused.'
        : `Your license expired ${days} day${days === 1 ? '' : 's'} ago. Monitoring has been paused.`)
    : (days === 0
        ? 'Your license expires today. Renew now to avoid interruption.'
        : `Your license expires in ${days} day${days === 1 ? '' : 's'}. Renew now to avoid interruption.`);

  return (
    <div
      className={`shrink-0 border-b ${
        expired
          ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200'
          : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'
      }`}
      role={expired ? 'alert' : 'status'}
    >
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {expired
            ? <AlertOctagon size={18} className="shrink-0 text-red-600 dark:text-red-400" />
            : <AlertTriangle size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />}
          <p className="text-sm font-medium truncate">{headline}</p>
        </div>
        <button
          onClick={onRenew}
          className={`text-xs font-semibold px-3 py-1.5 rounded-md shrink-0 transition-colors ${
            expired
              ? 'bg-red-600 text-white hover:bg-red-500'
              : 'bg-amber-600 text-white hover:bg-amber-500'
          }`}
        >
          Renew license
        </button>
      </div>
    </div>
  );
}