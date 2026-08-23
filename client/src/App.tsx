import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar.js';
import PosPage from './pages/pos/PosPage.js';
import AdminDashboard from './pages/admin/AdminDashboard.js';
import { ToastProvider, useToast } from './components/Toast.js';
import ClockInOutModal from './components/ClockInOutModal.js';
import AdminLockModal from './components/AdminLockModal.js';
import ChangeAdminPinModal from './components/ChangeAdminPinModal.js';
import { hrApi, settingsApi, setAdminPin } from './api/client.js';
import { Employee } from './types/index.js';
import { loadStoredTheme, applyThemeToRoot } from './utils/theme.js';
import useAdminIdleTimer from './hooks/useAdminIdleTimer.js';
import { ShieldCheck, Lock, ShoppingCart } from 'lucide-react';

function AppContent() {
  const toast = useToast();

  // Detect if user opened the app via direct Owner URL link (e.g. /?mode=owner, /?view=admin, #admin, /admin)
  const isDirectOwnerRoute =
    window.location.search.includes('mode=owner') ||
    window.location.search.includes('view=admin') ||
    window.location.pathname.startsWith('/admin') ||
    window.location.hash === '#admin';

  // 1. Initial State strictly locked
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'pos' | 'admin'>('pos');
  const [isAdminLockModalOpen, setIsAdminLockModalOpen] = useState(false);
  const [isChangePinModalOpen, setIsChangePinModalOpen] = useState(false);
  const [isClockModalOpen, setIsClockModalOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isOwnerDirectMode] = useState<boolean>(isDirectOwnerRoute);

  // 3-Minute Inactivity Auto-Lock for Admin Session
  useAdminIdleTimer({
    timeoutMs: 3 * 60 * 1000, // 3 continuous minutes (180s)
    enabled: activeTab === 'admin' && isAdminUnlocked,
    onTimeout: () => {
      setAdminPin(null);
      setIsAdminUnlocked(false);
      setIsAdminLockModalOpen(false);
      setIsChangePinModalOpen(false);
      setActiveTab('pos');
      toast.warning(
        'تم قفل جلسة الإدارة تلقائياً لعدم النشاط (3 دقائق) لحماية وسرية البيانات',
        'تم قفل الجلسة'
      );
      if (isOwnerDirectMode) {
        setIsAdminLockModalOpen(true);
      }
    },
  });

  useEffect(() => {
    // Purge any stale admin authentication tokens on app startup
    setAdminPin(null);
    setIsAdminUnlocked(false);

    // If accessed directly via owner deep-link, immediately prompt PIN lock
    if (isDirectOwnerRoute) {
      setIsAdminLockModalOpen(true);
    } else {
      setActiveTab('pos');
    }

    // 1. Apply cached theme immediately for 0 flash
    loadStoredTheme();

    // 2. Fetch fresh theme settings from backend
    settingsApi
      .getPosSettings(true)
      .then((settings) => {
        if (settings) {
          applyThemeToRoot(settings);
        }
      })
      .catch(() => {});

    // 3. Listen to live theme updates across tabs/events
    const handleThemeUpdate = (e: any) => {
      if (e.detail) {
        applyThemeToRoot(e.detail);
      }
    };
    window.addEventListener('pos-settings-updated', handleThemeUpdate);

    // 4. Fetch active employees for clock-in modal
    hrApi
      .getEmployees('active')
      .then((data) => setEmployees(data))
      .catch(() => {});

    return () => {
      window.removeEventListener('pos-settings-updated', handleThemeUpdate);
    };
  }, [isDirectOwnerRoute]);

  const handleAdminUnlockSuccess = (pin: string) => {
    setAdminPin(pin);
    setIsAdminUnlocked(true);
    setIsAdminLockModalOpen(false);
    setActiveTab('admin');
    toast.success('تم إلغاء القفل والتحقق من رمز PIN للإدارة بنجاح', 'مرحباً بك');
  };

  const handleAdminLock = () => {
    setAdminPin(null);
    setIsAdminUnlocked(false);
    setIsAdminLockModalOpen(false);
    setIsChangePinModalOpen(false);
    setActiveTab('pos');
    toast.info('تم قفل جلسة الإدارة والعودة لشاشة الكاشير', 'تم تسجيل الخروج');
  };

  const handleOpenAdminLock = () => {
    if (isAdminUnlocked) {
      setActiveTab('admin');
    } else {
      setIsAdminLockModalOpen(true);
    }
  };

  const handleTabChange = (targetTab: 'pos' | 'admin') => {
    if (targetTab === 'admin') {
      if (isAdminUnlocked) {
        setActiveTab('admin');
      } else {
        setIsAdminLockModalOpen(true);
      }
    } else {
      setActiveTab('pos');
    }
  };

  return (
    <div
      className="min-h-screen text-slate-100 font-tajawal antialiased flex flex-col selection:bg-primary selection:text-white transition-colors duration-300"
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
      <main className="flex-1 bg-transparent">
        {activeTab === 'admin' && isAdminUnlocked ? (
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
            <AdminDashboard />
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
              <div
                className="w-16 h-16 rounded-2xl text-white flex items-center justify-center mx-auto shadow-xl"
                style={{
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                }}
              >
                <ShieldCheck className="w-8 h-8" />
              </div>

              <div>
                <h2 className="text-xl font-black text-white">بوابة مالك المغسلة (Owner Portal)</h2>
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
                <Lock className="w-4 h-4" />
                <span>إدخال رمز PIN للدخول</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('pos')}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5 mx-auto transition-colors"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>الذهاب إلى شاشة الكاشير (POS)</span>
              </button>
            </div>
          </div>
        ) : (
          <PosPage />
        )}
      </main>

      {/* Footer */}
      <footer
        className="py-4 border-t text-center text-xs text-slate-500 transition-colors duration-300"
        style={{ borderColor: 'var(--border-color)' }}
      >
        نظام إدارة مغسلة سيارات ذكي &copy; 2026 | السوق المصري (EGP) - إدارة المخزون بالجرام ونقاط البيع والرواتب
      </footer>
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
