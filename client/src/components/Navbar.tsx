import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Clock,
  Lock,
  UserCheck,
  ShieldCheck,
  KeyRound,
  Users,
} from 'lucide-react';
import {
  getActiveAttendedHeadcount,
  getCustomStoredEmployees,
} from '../utils/attendanceStorage.js';

interface NavbarProps {
  activeTab: 'pos' | 'admin';
  setActiveTab: (tab: 'pos' | 'admin') => void;
  isAdminUnlocked: boolean;
  onOpenAdminLock: () => void;
  onOpenChangePin: () => void;
  onAdminLock: () => void;
  onOpenClockModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  isAdminUnlocked,
  onOpenAdminLock,
  onOpenChangePin,
  onAdminLock,
  onOpenClockModal,
}) => {
  const [time, setTime] = useState<string>('');
  const [headcount, setHeadcount] = useState<{ attended: number; total: number }>({
    attended: 0,
    total: 5,
  });

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);

    const updateHeadcount = () => {
      const emps = getCustomStoredEmployees();
      const attended = getActiveAttendedHeadcount(emps);
      setHeadcount({
        attended,
        total: emps.length > 0 ? emps.length : 5,
      });
    };

    updateHeadcount();

    window.addEventListener('cw_attendance_updated', updateHeadcount);
    window.addEventListener('storage', updateHeadcount);

    return () => {
      clearInterval(interval);
      window.removeEventListener('cw_attendance_updated', updateHeadcount);
      window.removeEventListener('storage', updateHeadcount);
    };
  }, []);

  const handleAdminButtonClick = () => {
    if (isAdminUnlocked) {
      setActiveTab('admin');
    } else {
      onOpenAdminLock();
    }
  };

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-md transition-colors duration-300 select-none"
      style={{
        backgroundColor: 'var(--header-bg)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Logo and Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0" dir="ltr">
            <span
              className="font-black tracking-wider text-white text-lg md:text-xl uppercase select-none font-mono"
              style={{
                textShadow: '0 0 8px rgba(239, 68, 68, 0.8), 0 0 16px rgba(220, 38, 38, 0.4)',
              }}
            >
              PRIME WASH
            </span>
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-red-500/40 bg-red-950/40 text-red-400 select-none shadow-[0_0_8px_rgba(239,68,68,0.2)] inline-flex items-center font-mono">
              POS SYSTEM
            </span>
          </div>


          {/* Center Navigation & Role Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Quick Attendance Clock In Button on Navbar with Live Headcount Badge */}
            {onOpenClockModal && (
              <button
                type="button"
                onClick={onOpenClockModal}
                className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-sm hover:brightness-110"
                style={{
                  backgroundColor: 'rgba(2, 6, 23, 0.65)',
                  color: 'var(--color-primary)',
                  borderColor: 'var(--border-color)',
                }}
                title="تسجيل حضور وانصراف الموظفين بالـ PIN"
              >
                <div className="flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-200">تسجيل حضور</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-[11px] font-mono font-bold text-emerald-400 shadow-inner">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{headcount.attended}/{headcount.total} حاضر</span>
                </div>
              </button>
            )}

            {/* Navigation Controls: Clean POS vs Admin Mode */}
            {activeTab === 'pos' ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div
                  className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold text-white shadow-lg border"
                  style={{
                    backgroundColor: 'var(--color-primary)',
                    borderColor: 'var(--color-primary)',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
                  }}
                >
                  <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">شاشة الكاشير (POS)</span>
                  <span className="sm:hidden text-[11px]">POS</span>
                </div>

                {/* Secure Admin Portal Access Button */}
                <button
                  type="button"
                  onClick={handleAdminButtonClick}
                  title="الدخول إلى لوحة تحكم الإدارة والحسابات"
                  className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white border transition-all hover:bg-white/5 active:scale-95"
                  style={{
                    backgroundColor: 'rgba(2, 6, 23, 0.65)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">لوحة الإدارة</span>
                  <span className="sm:hidden text-[11px]">الإدارة</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div
                  className="hidden sm:flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold text-white shadow-lg border"
                  style={{
                    backgroundColor: 'var(--color-primary)',
                    borderColor: 'var(--color-primary)',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
                  }}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>لوحة الإدارة</span>
                </div>

                {/* Change Admin PIN Button */}
                <button
                  type="button"
                  onClick={onOpenChangePin}
                  className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold text-amber-300 border border-amber-500/40 bg-amber-950/40 hover:bg-amber-900/60 transition-all shadow-md active:scale-95"
                  title="تغيير رمز PIN السري للوحة الإدارة"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">تغيير الـ PIN</span>
                  <span className="sm:hidden text-[11px]">PIN</span>
                </button>

                {/* Explicit Admin Session Lock & Return to POS Button */}
                <button
                  type="button"
                  onClick={onAdminLock}
                  className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold bg-rose-950/70 text-rose-300 border border-rose-500/50 hover:bg-rose-900 transition-all shadow-md active:scale-95"
                  title="قفل جلسة الإدارة فورياً والعودة للكاشير"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">قفل وخروج للكاشير</span>
                  <span className="sm:hidden text-[11px]">قفل</span>
                </button>
              </div>
            )}
          </div>

          {/* Status & Clock */}
          <div className="hidden lg:flex items-center gap-3">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono text-slate-300 transition-colors duration-300"
              style={{
                backgroundColor: 'rgba(2, 6, 23, 0.65)',
                borderColor: 'var(--border-color)',
              }}
            >
              <Clock className="w-3.5 h-3.5" style={{ color: 'var(--color-primary)' }} />
              <span>{time}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: 'var(--color-accent)' }}
              />
              <span>متصل</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
