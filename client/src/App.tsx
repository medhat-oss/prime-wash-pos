import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar.js';
import Footer from './components/Footer.js';
import PosPage from './pages/pos/PosPage.js';
import { ToastProvider, useToast } from './components/Toast.js';
import ClockInOutModal from './components/ClockInOutModal.js';
import AdminLockModal from './components/AdminLockModal.js';
import ChangeAdminPinModal from './components/ChangeAdminPinModal.js';
import { hrApi, settingsApi, setAdminPin, getStoredEmployees } from './api/client.js';
import { Employee } from './types/index.js';
import { loadStoredTheme, applyThemeToRoot } from './utils/theme.js';
import { runLocalStorageMigration } from './db/migration.js';
import { startSyncEngine, rehydrateClientState, getPendingSyncCount } from './sync/syncEngine.js';
import { initOrdersFromIndexedDB } from './utils/orderStorage.js';
import { initInventoryFromIndexedDB } from './utils/inventoryStorage.js';
import { bootstrapAdminPinHash } from './utils/adminAuthStorage.js';
import { purgeStaleCachedShifts } from './utils/shiftStorage.js';
import { safeSessionStorage } from './utils/safeStorage.js';
import useAdminIdleTimer from './hooks/useAdminIdleTimer.js';

// Lazy load heavy admin dashboard (SheetJS, jsPDF, reports) and public landing page
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard.js'));
const LandingPage = React.lazy(() => import('./pages/public/LandingPage.js'));

function AppContent() {
  const toast = useToast();

  // Detect if user opened the public offers/showcase landing page
  const isPublicLandingRoute =
    typeof window !== 'undefined' &&
    (window.location.pathname.startsWith('/offers') ||
      window.location.pathname.startsWith('/showcase') ||
      window.location.search.includes('view=offers') ||
      window.location.search.includes('view=landing') ||
      window.location.hash === '#offers' ||
      window.location.hash === '#showcase');

  const [isLandingMode, setIsLandingMode] = useState<boolean>(Boolean(isPublicLandingRoute));

  // Detect if user opened the app via direct Owner URL link (e.g. /?mode=owner, /?view=admin, #admin, /admin, or admin tab hash)
  const isDirectOwnerRoute =
    typeof window !== 'undefined' &&
    (window.location.search.includes('mode=owner') ||
      window.location.search.includes('view=admin') ||
      window.location.pathname.startsWith('/admin') ||
      window.location.hash === '#admin' ||
      ['#overview', '#inventory', '#services', '#pos_appearance', '#hr', '#active_shift', '#landing_cms', '#orders', '#expenses', '#eta'].includes(window.location.hash));

  // 1. Initial State derived from active session in storage (Incognito safe)
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    try {
      const unlocked = safeSessionStorage.getItem('cw_admin_unlocked') === 'true';
      const pin = safeSessionStorage.getItem('cw_admin_pin');
      return Boolean(unlocked && pin);
    } catch {
      return false;
    }
  });
  const [activeTab, setActiveTab] = useState<'pos' | 'admin'>(() => {
    try {
      const savedTab = safeSessionStorage.getItem('cw_active_tab');
      const unlocked = safeSessionStorage.getItem('cw_admin_unlocked') === 'true';
      const pin = safeSessionStorage.getItem('cw_admin_pin');
      if (savedTab === 'admin' && unlocked && pin) {
        return 'admin';
      }
      if (isDirectOwnerRoute && unlocked && pin) {
        return 'admin';
      }
    } catch {}
    return 'pos';
  });
  const [isAdminLockModalOpen, setIsAdminLockModalOpen] = useState(false);
  const [isChangePinModalOpen, setIsChangePinModalOpen] = useState(false);
  const [isClockModalOpen, setIsClockModalOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>(() => getStoredEmployees());
  const [isOwnerDirectMode, setIsOwnerDirectMode] = useState<boolean>(isDirectOwnerRoute);

  // 3-Minute Inactivity Auto-Lock for Admin Session
  useAdminIdleTimer({
    timeoutMs: 3 * 60 * 1000, // 3 continuous minutes (180s)
    enabled: activeTab === 'admin' && isAdminUnlocked,
    onTimeout: () => {
      try {
        setAdminPin(null);
        safeSessionStorage.removeItem('cw_admin_pin');
        safeSessionStorage.removeItem('cw_admin_unlocked');
        safeSessionStorage.removeItem('cw_admin_active_tab');
        safeSessionStorage.setItem('cw_active_tab', 'pos');
      } catch {}
      setIsOwnerDirectMode(false);
      setIsAdminUnlocked(false);
      setIsAdminLockModalOpen(false);
      setIsChangePinModalOpen(false);
      setActiveTab('pos');
      if (typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      toast.warning(
        'تم قفل جلسة الإدارة تلقائياً لعدم النشاط (3 دقائق) لحماية وسرية البيانات',
        'تم قفل الجلسة'
      );
    },
  });

  useEffect(() => {
    try {
      // Check if session is already unlocked in sessionStorage
      const hasValidAdminSession =
        safeSessionStorage.getItem('cw_admin_unlocked') === 'true' &&
        Boolean(safeSessionStorage.getItem('cw_admin_pin'));

      if (hasValidAdminSession) {
        const pin = safeSessionStorage.getItem('cw_admin_pin')!;
        setAdminPin(pin);
        setIsAdminUnlocked(true);
        if (safeSessionStorage.getItem('cw_active_tab') === 'admin' || isDirectOwnerRoute) {
          setActiveTab('admin');
        }
      } else {
        // Purge any stale admin authentication tokens on app startup
        setAdminPin(null);
        setIsAdminUnlocked(false);

        // If accessed directly via owner deep-link, immediately prompt PIN lock
        if (isDirectOwnerRoute) {
          setIsAdminLockModalOpen(true);
        } else {
          setActiveTab('pos');
        }
      }
    } catch (err) {
      console.warn('[App Init Session Check]', err);
    }

    // Apply cached theme immediately for 0 flash
    try {
      loadStoredTheme();
    } catch {}

    // Fetch theme settings from backend (deduplicated)
    settingsApi
      .getPosSettings(false)
      .then((settings) => {
        if (settings) {
          applyThemeToRoot(settings);
        }
      })
      .catch(() => {});

    // Listen to live theme updates across tabs/events
    const handleThemeUpdate = (e: any) => {
      if (e.detail) {
        applyThemeToRoot(e.detail);
      }
    };
    window.addEventListener('pos-settings-updated', handleThemeUpdate);

    // Fetch active employees for modals & pass down to POS (deduplicated)
    hrApi
      .getEmployees('active', false)
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setEmployees(data);
        }
      })
      .catch(() => {});

    let stopSyncEngine = () => {};

    // Post-paint deferred background tasks to give 100% thread priority to POS frame 0
    const deferredTimer = setTimeout(() => {
      // 0a. Boot-time self-healing: purge stale zombie shifts in background
      purgeStaleCachedShifts(24, getPendingSyncCount).catch(() => {});

      // 0b. Initialize Offline-First IndexedDB & run one-time localStorage migration
      try {
        runLocalStorageMigration()
          .then((res) => {
            if (res && res.migrated) {
              console.log('✅ [IndexedDB] One-time migration completed:', res.counts);
            }
            try {
              initOrdersFromIndexedDB();
              initInventoryFromIndexedDB();
              bootstrapAdminPinHash().catch(() => {});
            } catch {}
          })
          .catch(() => {});
      } catch {}

      // 1. Boot background Outbox Sync Engine with FIFO execution & mutex locks
      try {
        stopSyncEngine = startSyncEngine();
      } catch (err) {
        console.warn('[SyncEngine Init Warning]', err);
      }
    }, 400);

    // Throttled focus sync (at most once every 15s)
    let lastFocusSync = Date.now();
    const handleFocusSync = () => {
      const now = Date.now();
      if (now - lastFocusSync > 15000) {
        lastFocusSync = now;
        rehydrateClientState(false).catch(() => {});
      }
    };

    // Listen for session takeover / hijack across devices
    const handleSessionHijacked = (e: any) => {
      const hijackedCashier = e.detail?.cashier_name || 'الكاشير';
      toast.warning(
        `تم تسجيل الدخول لـ (${hijackedCashier}) من جهاز آخر. تم قفل الجلسة على هذا الجهاز لمنع تضارب الفواتير.`,
        'تم نقل الجلسة'
      );
    };
    window.addEventListener('cw_session_hijacked', handleSessionHijacked);

    return () => {
      clearTimeout(deferredTimer);
      window.removeEventListener('pos-settings-updated', handleThemeUpdate);
      window.removeEventListener('focus', handleFocusSync);
      window.removeEventListener('cw_session_hijacked', handleSessionHijacked);
      stopSyncEngine();
    };
  }, [isDirectOwnerRoute]);

  const handleAdminUnlockSuccess = (pin: string) => {
    setAdminPin(pin);
    safeSessionStorage.setItem('cw_admin_pin', pin);
    safeSessionStorage.setItem('cw_admin_unlocked', 'true');
    safeSessionStorage.setItem('cw_active_tab', 'admin');
    setIsAdminUnlocked(true);
    setIsAdminLockModalOpen(false);
    setActiveTab('admin');
    toast.success('تم إلغاء القفل والتحقق من رمز PIN للإدارة بنجاح', 'مرحباً بك');
  };

  const handleAdminLock = () => {
    setAdminPin(null);
    safeSessionStorage.removeItem('cw_admin_pin');
    safeSessionStorage.removeItem('cw_admin_unlocked');
    safeSessionStorage.removeItem('cw_admin_active_tab');
    safeSessionStorage.setItem('cw_active_tab', 'pos');
    setIsOwnerDirectMode(false);
    setIsAdminUnlocked(false);
    setIsAdminLockModalOpen(false);
    setIsChangePinModalOpen(false);
    setActiveTab('pos');
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    toast.info('تم قفل جلسة الإدارة والعودة لشاشة الكاشير', 'تم تسجيل الخروج');
  };

  const handleOpenAdminLock = () => {
    if (isAdminUnlocked) {
      safeSessionStorage.setItem('cw_active_tab', 'admin');
      setActiveTab('admin');
    } else {
      setIsAdminLockModalOpen(true);
    }
  };

  const handleTabChange = (targetTab: 'pos' | 'admin') => {
    if (targetTab === 'admin') {
      if (isAdminUnlocked) {
        safeSessionStorage.setItem('cw_active_tab', 'admin');
        setActiveTab('admin');
      } else {
        setIsAdminLockModalOpen(true);
      }
    } else {
      setIsOwnerDirectMode(false);
      safeSessionStorage.setItem('cw_active_tab', 'pos');
      safeSessionStorage.removeItem('cw_admin_active_tab');
      if (typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      setActiveTab('pos');
    }
  };

  // If in public landing page mode, render standalone luxury showcase directly
  if (isLandingMode) {
    return (
      <React.Suspense
        fallback={
          <div className="min-h-screen bg-black flex items-center justify-center text-white">
            <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        }
      >
        <LandingPage />
      </React.Suspense>
    );
  }

  return (
    <div
      className="min-h-screen text-slate-100 font-tajawal antialiased flex flex-col selection:bg-primary selection:text-white transition-colors duration-300 overflow-x-hidden w-full max-w-full"
      style={{ backgroundColor: 'var(--app-bg)' }}
    >
      {/* Navbar with isolated cashier view and admin lock controls */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        isAdminUnlocked={isAdminUnlocked}
        onOpenAdminLock={handleOpenAdminLock}
        onOpenChangePin={() => setIsChangePinModalOpen(true)}
        onAdminLock={handleAdminLock}
        onOpenClockModal={() => setIsClockModalOpen(true)}
      />

      {/* Admin PIN Lock Modal */}
      <AdminLockModal
        isOpen={isAdminLockModalOpen}
        onClose={() => setIsAdminLockModalOpen(false)}
        onSuccess={handleAdminUnlockSuccess}
      />

      {/* Change Admin PIN Modal */}
      <ChangeAdminPinModal
        isOpen={isChangePinModalOpen}
        onClose={() => setIsChangePinModalOpen(false)}
        onSuccess={(newPin) => {
          setAdminPin(newPin);
        }}
      />

      {/* Global Clock In Modal from Navbar */}
      <ClockInOutModal
        isOpen={isClockModalOpen}
        onClose={() => setIsClockModalOpen(false)}
        employees={employees}
        initialMode="check_in"
      />

      {/* Main Content Body: Strict Role Isolation & Responsive Container */}
      <main className="flex-1 bg-transparent overflow-x-hidden w-full max-w-full">
        {activeTab === 'admin' && isAdminUnlocked ? (
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-x-hidden w-full max-w-full">
            <React.Suspense
              fallback={
                <div className="p-12 text-center text-slate-400">
                  <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-sm font-bold">جاري تحميل لوحة الإدارة...</p>
                </div>
              }
            >
              <AdminDashboard />
            </React.Suspense>
          </div>
        ) : isOwnerDirectMode && !isAdminUnlocked ? (
          /* Direct Owner Login Gate Screen (if opened via ?mode=owner and locked) */
          <div className="max-w-md mx-auto px-4 py-16 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div
              className="p-8 rounded-3xl border shadow-2xl space-y-5"
              style={{
                backgroundColor: 'var(--card-bg)',
                borderColor: 'var(--border-color)',
              }}
            >
              <div>
                <h2 className="text-xl font-black text-white">بوابة مالك المنشأة (Owner Portal)</h2>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  متابعة العمليات والمبيعات، المخزون، الحسابات والرواتب، وتقارير الضرائب لحظياً
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsAdminLockModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-sm shadow-xl transition-all hover:brightness-110 active:scale-95"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                }}
              >
                <span>إدخال رمز PIN للدخول</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsOwnerDirectMode(false);
                  setActiveTab('pos');
                  safeSessionStorage.setItem('cw_active_tab', 'pos');
                  safeSessionStorage.removeItem('cw_admin_active_tab');
                  if (typeof window !== 'undefined' && window.location.hash) {
                    window.history.replaceState(null, '', window.location.pathname + window.location.search);
                  }
                }}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5 mx-auto transition-colors"
              >
                <span>الذهاب إلى شاشة الكاشير (POS)</span>
              </button>
            </div>
          </div>
        ) : (
          <PosPage initialEmployees={employees} onOwnerLogin={handleAdminUnlockSuccess} />
        )}
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
