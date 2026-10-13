import React, { useState, useEffect } from 'react';
import {
  getActiveAttendedHeadcount,
  getCustomStoredEmployees,
  isOwnerEmployee,
} from '../utils/attendanceStorage.js';
import { hrApi, posApi } from '../api/client.js';
import { debounce } from '../utils/eventBus.js';
import LiveClock from './LiveClock.js';
import CloudSyncBadge from './CloudSyncBadge.js';

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
  const [headcount, setHeadcount] = useState<{ attended: number; total: number }>({
    attended: 0,
    total: 4,
  });

  useEffect(() => {
    const updateHeadcount = () => {
      const allEmps = getCustomStoredEmployees();
      const staffEmps = allEmps.filter((e) => !isOwnerEmployee(e));
      const attended = getActiveAttendedHeadcount(staffEmps);
      const total = staffEmps.length > 0 ? Math.max(staffEmps.length, attended) : Math.max(4, attended);
      setHeadcount({
        attended,
        total,
      });
    };

    let lastSync = Date.now();
    const syncCentralAndRefresh = async (force: boolean = false) => {
      const now = Date.now();
      if (!force && now - lastSync < 30000) {
        updateHeadcount();
        return;
      }
      lastSync = now;
      try {
        await Promise.all([
          hrApi.getTodayAttendanceStatus(force).catch(() => null),
          posApi.getActiveShift(force).catch(() => null),
        ]);
      } catch {}
      updateHeadcount();
    };

    updateHeadcount();
    syncCentralAndRefresh(false);

    const debouncedUpdate = debounce(updateHeadcount, 200);
    const debouncedSync = debounce(() => syncCentralAndRefresh(false), 500);

    window.addEventListener('cw_attendance_updated', debouncedUpdate);
    window.addEventListener('cw_shifts_updated', debouncedUpdate);
    window.addEventListener('storage', debouncedUpdate);
    window.addEventListener('focus', debouncedSync);

    return () => {
      debouncedUpdate.cancel();
      debouncedSync.cancel();
      window.removeEventListener('cw_attendance_updated', debouncedUpdate);
      window.removeEventListener('cw_shifts_updated', debouncedUpdate);
      window.removeEventListener('storage', debouncedUpdate);
      window.removeEventListener('focus', debouncedSync);
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
      className="sticky top-0 z-40 border-b backdrop-blur-md transition-colors duration-300 select-none overflow-x-hidden w-full max-w-full"
      style={{
        backgroundColor: 'var(--header-bg)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-1.5 sm:gap-2 w-full">
          {/* Logo and Brand */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0" dir="ltr">
            <span
              className="font-black tracking-wider text-white text-base sm:text-lg md:text-xl uppercase select-none font-mono whitespace-nowrap"
              style={{
                textShadow: '0 0 8px rgba(239, 68, 68, 0.8), 0 0 16px rgba(220, 38, 38, 0.4)',
              }}
            >
              PRIME WASH
            </span>
            <span className="hidden min-[380px]:inline-flex text-[9px] sm:text-[10px] md:text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-red-500/40 bg-red-950/40 text-red-400 select-none shadow-[0_0_8px_rgba(239,68,68,0.2)] items-center font-mono whitespace-nowrap">
              POS SYSTEM
            </span>
          </div>

          {/* Center Navigation & Role Actions */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Quick Attendance Clock In Button on Navbar with Live Headcount Badge */}
            {onOpenClockModal && (
              <button
                type="button"
                onClick={onOpenClockModal}
                className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all shadow-sm hover:brightness-110"
                style={{
                  backgroundColor: 'rgba(2, 6, 23, 0.65)',
                  color: 'var(--color-primary)',
                  borderColor: 'var(--border-color)',
                }}
                title="تسجيل حضور وانصراف الموظفين بالـ PIN"
              >
                <span className="text-slate-200">تسجيل حضور</span>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-[11px] font-mono font-bold text-emerald-400 shadow-inner">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{headcount.attended}/{headcount.total} حاضر</span>
                </div>
              </button>
            )}

            {/* Navigation Controls: Clean POS vs Admin Mode */}
            {activeTab === 'pos' ? (
              <div className="flex items-center gap-1 sm:gap-2">
                <div
                  className="flex items-center justify-center px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold text-white shadow-lg border whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--color-primary)',
                    borderColor: 'var(--color-primary)',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
                  }}
                >
                  <span className="hidden sm:inline">شاشة الكاشير (POS)</span>
                  <span className="sm:hidden text-[11px]">POS</span>
                </div>

                {/* Secure Admin Portal Access Button */}
                <button
                  type="button"
                  onClick={handleAdminButtonClick}
                  title="الدخول إلى لوحة تحكم الإدارة والحسابات"
                  className="flex items-center justify-center px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white border transition-all hover:bg-white/5 active:scale-95 whitespace-nowrap"
                  style={{
                    backgroundColor: 'rgba(2, 6, 23, 0.65)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <span className="hidden sm:inline">لوحة الإدارة</span>
                  <span className="sm:hidden text-[11px]">الإدارة</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 sm:gap-2">
                <div
                  className="hidden sm:flex items-center justify-center px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold text-white shadow-lg border whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--color-primary)',
                    borderColor: 'var(--color-primary)',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
                  }}
                >
                  <span>لوحة الإدارة</span>
                </div>

                {/* Change Admin PIN Button */}
                <button
                  type="button"
                  onClick={onOpenChangePin}
                  className="flex items-center justify-center px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold text-amber-300 border border-amber-500/40 bg-amber-950/40 hover:bg-amber-900/60 transition-all shadow-md active:scale-95 whitespace-nowrap"
                  title="تغيير رمز PIN السري للوحة الإدارة"
                >
                  <span className="hidden sm:inline">تغيير PIN الإدارة</span>
                  <span className="sm:hidden text-[11px]">PIN</span>
                </button>

                {/* Explicit Admin Session Lock & Return to POS Button */}
                <button
                  type="button"
                  onClick={onAdminLock}
                  className="flex items-center justify-center px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold bg-rose-950/70 text-rose-300 border border-rose-500/50 hover:bg-rose-900 transition-all shadow-md active:scale-95 whitespace-nowrap"
                  title="قفل جلسة الإدارة فورياً والعودة للكاشير"
                >
                  <span className="hidden sm:inline">قفل وخروج للكاشير</span>
                  <span className="sm:hidden text-[11px]">قفل</span>
                </button>
              </div>
            )}
          </div>

          {/* Status & Clock */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div className="hidden md:block">
              <LiveClock />
            </div>
            <CloudSyncBadge />
          </div>
        </div>
      </div>
    </header>
  );
};

export default React.memo(Navbar);
