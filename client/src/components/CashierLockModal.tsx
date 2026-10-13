import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal.js';
import { Employee, ActiveShiftSession } from '../types/index.js';
import { hrApi, posApi, getStoredAdminPin, verifyAdminPin, setAdminPin, setStoredAdminPin, getStoredEmployees } from '../api/client.js';
import { safeSessionStorage } from '../utils/safeStorage.js';
import { FALLBACK_EMPLOYEES } from '../api/mockFallbacks.js';
import { useToast } from './Toast.js';
import { isOwnerEmployee } from '../utils/attendanceStorage.js';
import { debounce } from '../utils/eventBus.js';
import {
  saveStoredActiveShiftSession,
  getStoredActiveShiftSession,
  saveLocalCashierSession,
  purgeZombieShifts,
} from '../utils/shiftStorage.js';
import { getOrCreateDeviceId } from '../utils/deviceStorage.js';

interface CashierLockModalProps {
  isOpen: boolean;
  employees: Employee[];
  onSuccess: (cashier: ActiveShiftSession) => void;
  onOwnerLogin?: (pin: string) => void;
}

export const CashierLockModal: React.FC<CashierLockModalProps> = ({
  isOpen,
  employees,
  onSuccess,
  onOwnerLogin,
}) => {
  const toast = useToast();

  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeShiftNotice, setActiveShiftNotice] = useState<{
    cashier_id?: string;
    cashier_name: string;
  } | null>(null);

  const isCheckingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    const checkActiveShift = async () => {
      if (isCheckingRef.current) return;
      isCheckingRef.current = true;
      try {
        const active = await posApi.getActiveShiftAuthoritative(false);
        if (active && active.status !== 'closed' && (active.cashier_id || active.id)) {
          setActiveShiftNotice({
            cashier_id: active.cashier_id || active.id,
            cashier_name: active.cashier_name || active.name || 'الكاشير',
          });
        } else {
          setActiveShiftNotice(null);
        }
      } catch {
        const local = getStoredActiveShiftSession();
        if (local && local.status !== 'closed' && (local.cashier_id || local.id)) {
          setActiveShiftNotice({
            cashier_id: local.cashier_id || local.id,
            cashier_name: local.cashier_name || local.name || 'الكاشير',
          });
        } else {
          setActiveShiftNotice(null);
        }
      } finally {
        isCheckingRef.current = false;
      }
    };

    checkActiveShift();

    const debouncedCheck = debounce(() => {
      if (loading) return;
      checkActiveShift();
    }, 300);

    const handleShiftEvents = () => {
      if (loading) return;
      debouncedCheck();
    };

    window.addEventListener('cw_shifts_updated', handleShiftEvents);
    window.addEventListener('storage', handleShiftEvents);

    return () => {
      debouncedCheck.cancel();
      window.removeEventListener('cw_shifts_updated', handleShiftEvents);
      window.removeEventListener('storage', handleShiftEvents);
    };
  }, [isOpen, loading]);

  const handleKeyPress = (num: string) => {
    if (loading) return;
    if (pin.length < 6) {
      const newPin = pin + num;
      setPin(newPin);

      const selectedEmp = employees.find((emp) => emp.id === selectedEmpId);
      const isOwner = selectedEmp ? (selectedEmp.system_role === 'owner' || isOwnerEmployee(selectedEmp)) : false;
      const isManager = selectedEmp ? (selectedEmp.system_role === 'manager' || (selectedEmp.role && (selectedEmp.role.includes('مشرف') || selectedEmp.role.includes('مدير')))) : false;
      
      // Auto trigger for owner or manager when 6 digits are reached
      if ((isOwner || isManager) && newPin.length === 6) {
        setTimeout(() => {
          handleUnlockShift(undefined, newPin);
        }, 50);
      } else if (!isOwner && !isManager && newPin.length === 4) {
        // Auto trigger for regular cashiers when 4 digits are reached
        setTimeout(() => {
          handleUnlockShift(undefined, newPin);
        }, 50);
      }
    }
  };

  const handleBackspace = () => {
    if (loading) return;
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (loading) return;
    setPin('');
  };

  const handleUnlockShift = async (e?: React.FormEvent, overridePin?: string) => {
    if (e) e.preventDefault();

    const currentPin = (overridePin || pin).trim();
    if (!currentPin || currentPin.length < 4) {
      toast.warning('يرجى إدخال رمز PIN السري (4 أرقام على الأقل)');
      return;
    }

    if (!selectedEmpId) {
      toast.warning('يرجى اختيار اسم الكاشير أو المستخدم أولاً من القائمة');
      return;
    }

    const employee = employees.find((emp) => String(emp.id) === String(selectedEmpId));
    if (!employee) {
      toast.warning('الموظف المحدد غير موجود، يرجى إعادة اختياره من القائمة');
      return;
    }

    const isOwner = employee.system_role === 'owner' || isOwnerEmployee(employee);
    const isManager = employee.system_role === 'manager' || (employee.role && (employee.role.includes('مشرف') || employee.role.includes('مدير')));
    const isWorker = employee.system_role === 'worker';

    if (isWorker) {
      toast.warning(
        `عفواً، حساب (${employee.name}) مسجل كـ "فني تشغيل / صنايعي" ولا يملك صلاحية فتح الكاشير. يرجى مراجعة إدارة المنشأة.`,
        'صلاحيات محدودة'
      );
      setPin('');
      return;
    }

    if (isDifferentCashierActive) {
      toast.warning(
        `يوجد وردية نشطة حالياً للموظف: (${activeShiftNotice?.cashier_name}). يجب إنهاء وتقفيل الوردية الحالية أولاً قبل تسجيل الدخول بحساب كاشير آخر.`,
        'تعارض في الوردية'
      );
      setPin('');
      return;
    }

    try {
      setLoading(true);

      // 1. DEDICATED AUTHENTICATION & ROUTING FOR OWNER
      if (isOwner) {
        console.log('[Owner Login Attempt]', { employeeId: employee.id, employeeName: employee.name, pinLength: currentPin.length });
        const isValid = await verifyAdminPin(currentPin);
        if (!isValid) {
          console.error('[Owner Login Failed - Invalid PIN]', { employeeName: employee.name, pinLength: currentPin.length });
          throw new Error('رمز PIN السري غير صحيح لمالك المنشأة (مستر فتحي)');
        }

        setAdminPin(currentPin);
        setStoredAdminPin(currentPin);
        safeSessionStorage.setItem('cw_admin_pin', currentPin);
        safeSessionStorage.setItem('cw_admin_unlocked', 'true');
        safeSessionStorage.setItem('cw_active_tab', 'admin');

        toast.success(`مرحباً بك ${employee.name}، تم فتح لوحة الإدارة بنجاح!`, 'لوحة الإدارة');
        setPin('');
        if (onOwnerLogin) {
          onOwnerLogin(currentPin);
        }
        return;
      }

      // 2. DEDICATED AUTHENTICATION & ROUTING FOR OPERATIONS MANAGER / SUPERVISOR
      if (isManager) {
        console.log('[Manager Login Attempt]', { employeeId: employee.id, employeeName: employee.name, pinLength: currentPin.length });
        
        const currentAdminPin = getStoredAdminPin();
        const isMasterAdmin = currentPin === currentAdminPin.trim();

        if (!isMasterAdmin) {
          const authResult = await posApi.verifyCashierPin({
            employee_id: employee.id,
            pin: currentPin,
          });
          if (!authResult.valid) {
            throw new Error(`رمز PIN السري لمدير / مشرف التشغيل (${employee.name}) غير صحيح`);
          }
          if (authResult.employee?.role) {
            employee.role = authResult.employee.role;
          }
        }

        // Fetch active cashier shift info to display in warning banner
        let activeRemoteShift: any = null;
        try {
          activeRemoteShift = await posApi.getActiveShiftAuthoritative(true);
        } catch {}
        const activeShift = activeRemoteShift || getStoredActiveShiftSession();

        // Unlock Management Portal & Admin Dashboard
        setAdminPin(currentPin);
        setStoredAdminPin(currentPin);
        safeSessionStorage.setItem('cw_admin_pin', currentPin);
        safeSessionStorage.setItem('cw_admin_unlocked', 'true');
        safeSessionStorage.setItem('cw_active_tab', 'admin');

        if (activeShift && (activeShift.cashier_name || activeShift.name) && activeShift.status !== 'closed') {
          const activeCashierName = activeShift.cashier_name || activeShift.name;
          toast.info(
            `⚠️ تنبيه إداري: يوجد شفت كاشير نشط حالياً يديره الكاشير: (${activeCashierName}).`,
            'لوحة الإدارة والإشراف'
          );
        } else {
          toast.success(`مرحباً بك ${employee.name}، تم فتح لوحة الإدارة والإشراف بنجاح!`, 'لوحة الإشراف');
        }

        setPin('');
        if (onOwnerLogin) {
          onOwnerLogin(currentPin);
        }
        return;
      }

      // 3. REGULAR CASHIER SHIFT STRICT IDENTITY AUTHENTICATION
      const currentAdminPin = getStoredAdminPin();
      const isMasterAdmin = currentPin === currentAdminPin.trim();

      if (!isMasterAdmin) {
        const authResult = await posApi.verifyCashierPin({
          employee_id: employee.id,
          pin: currentPin,
        });
        if (!authResult.valid) {
          throw new Error(`رمز PIN السري للموظف (${employee.name}) غير صحيح`);
        }
        if (authResult.employee?.role) {
          employee.role = authResult.employee.role;
        }
      }

      // Query active shift before attendance or shift creation
      let activeRemoteShift: any = null;
      try {
        activeRemoteShift = await posApi.getActiveShiftAuthoritative(true);
      } catch {}
      const existingShift = activeRemoteShift || getStoredActiveShiftSession();

      if (
        existingShift &&
        (existingShift.id || existingShift.shift_id) &&
        existingShift.status !== 'closed'
      ) {
        const activeCashierId = existingShift.cashier_id || existingShift.id;
        const activeCashierName = existingShift.cashier_name || existingShift.name || 'كاشير آخر';

        // CONFLICT: Different cashier is active!
        if (activeCashierId && String(activeCashierId) !== String(employee.id)) {
          console.warn('[Shift Conflict Blocked]', {
            attemptingCashier: employee.name,
            activeCashier: activeCashierName,
          });
          throw new Error(
            `يوجد شفت كاشير نشط بالفعل للموظف: (${activeCashierName}). يجب تقفيل الشفت الحالي أولاً قبل بدء شفت جديد.`
          );
        }

        // SAME Cashier: Restore existing active shift cleanly and claim terminal ownership
        let authoritativeShift = existingShift;
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            // Race terminal takeover with a 5-second timeout to prevent mobile stalls
            const claimPromise = posApi.startActiveShift({
              cashier_id: employee.id,
              cashier_name: employee.name,
              cashier_role: employee.role,
              active_device_id: getOrCreateDeviceId(),
              shift_start: existingShift.shift_start,
              opening_cash: Number(existingShift.opening_cash) || 0,
            });
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('TIMEOUT')), 5000)
            );

            const resumedShift = await Promise.race([claimPromise, timeoutPromise]).catch((e) => {
              if (e?.message === 'TIMEOUT') {
                console.warn('[Terminal Claim Race Timeout] Proceeding with optimistic terminal claim');
                return null;
              }
              throw e;
            });

            if (resumedShift && (resumedShift.id || (resumedShift as any).shift_id)) {
              authoritativeShift = resumedShift;
            }
          } catch (claimErr: any) {
            console.error('[Terminal Claim Failure]', claimErr);
            const msg = claimErr?.message || claimErr?.response?.data?.message || 'فشل السيرفر في نقل ملكية الوردية إلى هذا الجهاز';
            toast.error(`تعذر نقل الجلسة: ${msg}`, 'خطأ في نقل الوردية');
            throw new Error(`تعذر نقل ملكية الوردية إلى هذا الجهاز: ${msg}`);
          }
        }

        const cashierSession: ActiveShiftSession = {
          id: employee.id,
          name: employee.name,
          role: employee.role,
          cashier_id: employee.id,
          cashier_name: employee.name,
          cashier_role: employee.role,
          shift_id: authoritativeShift.shift_id || authoritativeShift.id,
          shift_code: authoritativeShift.shift_code,
          shift_start: authoritativeShift.shift_start || new Date().toISOString(),
          opening_cash: Number(authoritativeShift.opening_cash) || 0,
          status: 'active',
        };

        saveLocalCashierSession(cashierSession);
        saveStoredActiveShiftSession(cashierSession);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cw_attendance_updated'));
          window.dispatchEvent(new Event('cw_attendance_updated'));
          window.dispatchEvent(new Event('cw_shifts_updated'));
          window.dispatchEvent(new Event('cw_orders_updated'));
          window.dispatchEvent(new Event('storage'));
        }

        toast.success(`مرحباً ${employee.name}، تمت استعادة شيفت الكاشير النشط!`, 'استعادة الشيفت');
        setPin('');
        onSuccess(cashierSession);
        return;
      }

      // NO Active Shift -> Start brand new shift
      purgeZombieShifts();
      const freshShiftStart = new Date().toISOString();

      const startRes = await posApi.startActiveShift({
        cashier_id: employee.id,
        cashier_name: employee.name,
        cashier_role: employee.role,
        shift_start: freshShiftStart,
        opening_cash: 0,
      });

      const cashierSession: ActiveShiftSession = {
        id: employee.id,
        name: employee.name,
        role: employee.role,
        cashier_id: employee.id,
        cashier_name: employee.name,
        cashier_role: employee.role,
        shift_id: startRes?.id || startRes?.shift_id || `shift_act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        shift_code: startRes?.shift_code,
        shift_start: startRes?.shift_start || freshShiftStart,
        opening_cash: Number(startRes?.opening_cash) || 0,
        status: 'active',
      };

      saveLocalCashierSession(cashierSession);
      saveStoredActiveShiftSession(cashierSession);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cw_attendance_updated'));
        window.dispatchEvent(new Event('cw_attendance_updated'));
        window.dispatchEvent(new Event('cw_shifts_updated'));
        window.dispatchEvent(new Event('cw_orders_updated'));
        window.dispatchEvent(new Event('storage'));
      }

      toast.success(`مرحباً ${employee.name}، تم فتح شيفت الكاشير بنجاح!`, 'تم بدء الشيفت');
      setPin('');
      onSuccess(cashierSession);
    } catch (err: any) {
      console.error('[Cashier/Owner Lock Error]', err);
      toast.error(err.message || 'رمز PIN السري غير صحيح', 'تعذر تسجيل الدخول');
      setPin('');
    } finally {
      setLoading(false);
    }
  };


  const activeEmployees = (
    employees && employees.length > 0
      ? employees
      : getStoredEmployees().length > 0
      ? getStoredEmployees()
      : FALLBACK_EMPLOYEES
  ).filter((e) => e.status === 'active');

  const selectedEmp = activeEmployees.find((e) => e.id === selectedEmpId);
  const isSelectedOwner = selectedEmp ? (selectedEmp.system_role === 'owner' || isOwnerEmployee(selectedEmp)) : false;
  const isSelectedManager = selectedEmp ? (selectedEmp.system_role === 'manager' || (selectedEmp.role && (selectedEmp.role.includes('مشرف') || selectedEmp.role.includes('مدير')))) : false;
  const isSelectedWorker = selectedEmp?.system_role === 'worker';

  const isDifferentCashierActive = Boolean(
    activeShiftNotice &&
    selectedEmp &&
    !isSelectedOwner &&
    !isSelectedManager &&
    String(activeShiftNotice.cashier_id) !== String(selectedEmp.id) &&
    activeShiftNotice.cashier_name !== selectedEmp.name
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      title="تسجيل دخول الكاشير لفتح الشيفت"
      maxWidth="md"
      showCloseButton={false}
      preventBackdropClose={true}
    >
      <div className="space-y-5 select-none py-1">
        <div className="text-center space-y-1.5 pb-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h3 className="text-base font-black text-white">نظام الدخول الآمن لنقاط البيع</h3>
          <p className="text-xs text-slate-400">
            يرجى تحديد اسم الكاشير المسؤول وإدخال رمز PIN لبدء تسجيل الفواتير
          </p>
        </div>

        {/* Cashier Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            اختر اسم الكاشير أو المستخدم
          </label>
          <select
            value={selectedEmpId}
            onChange={(e) => {
              setSelectedEmpId(e.target.value);
              setPin('');
            }}
            className="w-full border rounded-2xl px-4 py-3 text-sm text-slate-100 focus:outline-none transition-colors cursor-pointer"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            <option value="">-- اضغط لاختيار اسم الكاشير أو المسؤول --</option>
            {activeEmployees.map((emp) => {
              const isOwner = emp.system_role === 'owner' || isOwnerEmployee(emp);
              const isWorker = emp.system_role === 'worker';
              const isManager = emp.system_role === 'manager' || (emp.role && (emp.role.includes('مشرف') || emp.role.includes('مدير')));
              const roleTag = isOwner
                ? 'مالك المنشأة — لوحة الإدارة'
                : isManager
                ? 'مدير / مشرف تشغيل — لوحة الإشراف والإدارة'
                : isWorker
                ? 'فني تشغيل — حضور وانصراف فقط'
                : 'كاشير — نقاط البيع POS';

              return (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({roleTag})
                </option>
              );
            })}
          </select>

          {/* Conflict Warning Banner for Active Shift under another cashier */}
          {isDifferentCashierActive && (
            <div className="mt-2.5 p-3.5 rounded-2xl bg-rose-500/15 border-2 border-rose-500/40 text-rose-300 text-xs font-bold space-y-1 animate-in fade-in duration-200 shadow-lg">
              <div className="flex items-center gap-2 text-rose-200">
                <span className="text-base">⚠️</span>
                <span className="font-black text-sm">تنبيه تعارض الوردية:</span>
              </div>
              <p>
                يوجد وردية نشطة حالياً بواسطة:{' '}
                <span className="text-white underline font-extrabold">{activeShiftNotice?.cashier_name}</span>.
                يجب إنهاء الوردية الحالية أولاً قبل بدء وردية جديدة.
              </p>
            </div>
          )}

          {/* Role Status Banners */}
          {isSelectedOwner && (
            <div className="mt-2.5 p-3 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
              <span>حساب مالك المنشأة: إدخال رمز PIN سيوجهك فوراً للوحة التحكم العامة</span>
            </div>
          )}

          {isSelectedWorker && (
            <div className="mt-2.5 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-rose-300 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
              <span>تنبيه: حساب فني تشغيل / صنايعي مخصص للحضور والانصراف ولا يمتلك صلاحية كاشير</span>
            </div>
          )}

          {isSelectedManager && (
            <div className="mt-2.5 p-3 rounded-2xl bg-purple-500/15 border border-purple-500/35 text-purple-300 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
              <span>حساب مدير / مشرف التشغيل: يتيح متابعة العمليات ودخول لوحة الإدارة مع الحفاظ على شفت الكاشير النشط</span>
            </div>
          )}
        </div>


        {/* PIN Code Dots Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            أدخل رمز PIN السري
          </label>

          <div
            className="flex justify-center items-center gap-3 py-3 rounded-2xl border mb-3"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                  pin.length > i
                    ? 'border-transparent scale-110 shadow-md'
                    : 'border-slate-700 bg-slate-900'
                }`}
                style={{
                  backgroundColor: pin.length > i ? 'var(--color-primary)' : undefined,
                }}
              />
            ))}
          </div>

          {/* Numeric Touch Keypad */}
          <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto mb-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                className="h-11 rounded-xl border text-slate-100 text-lg font-bold font-mono transition-all active:scale-95 shadow-sm hover:bg-white/10"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  borderColor: 'var(--border-color)',
                }}
              >
                {num}
              </button>
            ))}

            <button
              type="button"
              onClick={handleClear}
              className="h-11 rounded-xl border text-slate-400 hover:text-rose-300 text-xs font-bold transition-all active:scale-95"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                borderColor: 'var(--border-color)',
              }}
            >
              مسح
            </button>

            <button
              type="button"
              onClick={() => handleKeyPress('0')}
              className="h-11 rounded-xl border text-slate-100 text-lg font-bold font-mono transition-all active:scale-95 shadow-sm hover:bg-white/10"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                borderColor: 'var(--border-color)',
              }}
            >
              0
            </button>

            <button
              type="button"
              onClick={handleBackspace}
              className="h-11 rounded-xl border text-slate-400 hover:text-slate-200 flex items-center justify-center font-bold text-base transition-all active:scale-95"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                borderColor: 'var(--border-color)',
              }}
            >
              ⌫
            </button>
          </div>
        </div>

        {/* Submit Action */}
        {(() => {
          const selectedEmp = activeEmployees.find((e) => e.id === selectedEmpId);
          const isOwner = selectedEmp ? (selectedEmp.system_role === 'owner' || isOwnerEmployee(selectedEmp)) : false;
          const isManager = selectedEmp ? (selectedEmp.system_role === 'manager' || (selectedEmp.role && (selectedEmp.role.includes('مشرف') || selectedEmp.role.includes('مدير')))) : false;
          const isWorker = selectedEmp?.system_role === 'worker';

          return (
            <button
              type="button"
              onClick={() => {
                if (isWorker) {
                  toast.warning('حسابات فنيي التشغيل والغسيل مخصصة لتسجيل الحضور فقط ولا تملك صلاحية فتح كاشير POS.');
                  return;
                }
                if (isDifferentCashierActive) {
                  toast.warning(
                    `يوجد وردية نشطة حالياً للموظف: (${activeShiftNotice?.cashier_name}). يجب إنهاء وتقفيل الوردية الحالية أولاً قبل تسجيل الدخول بحساب كاشير آخر.`,
                    'تعارض في الوردية'
                  );
                  return;
                }
                handleUnlockShift();
              }}
              disabled={loading || !selectedEmpId || pin.length < 4}
              className={`w-full flex items-center justify-center gap-2 py-4 text-white rounded-2xl font-black text-sm shadow-xl active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 ${
                isWorker || isDifferentCashierActive ? 'bg-amber-600/90 text-white hover:bg-amber-500' : ''
              }`}
              style={{
                backgroundColor: (isWorker || isDifferentCashierActive) ? undefined : 'var(--color-primary)',
              }}
            >
              {loading && (
                <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />
              )}
              <span>
                {isWorker
                  ? 'صلاحيات محدودة — حساب فني تشغيل (حضور فقط)'
                  : isDifferentCashierActive
                  ? `وردية نشطة بالفعل للكاشير (${activeShiftNotice?.cashier_name})`
                  : isOwner
                  ? 'دخول لوحة تحكم الإدارة (Owner Dashboard)'
                  : isManager
                  ? 'دخول لوحة الإدارة والإشراف (Manager Portal)'
                  : 'فتح شيفت الكاشير وبدء العمل'}
              </span>
            </button>
          );
        })()}

        {/* Quick Demo Fill Helper */}
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => {
              const demoCashier =
                activeEmployees.find((e) => e.system_role === 'cashier') ||
                activeEmployees.find((e) => !isOwnerEmployee(e) && e.system_role !== 'worker') ||
                activeEmployees[0];
              if (demoCashier) {
                setSelectedEmpId(demoCashier.id);
                setPin('1234');
              }
            }}
            className="text-[11px] text-slate-400 hover:text-red-400 underline transition-colors"
          >
            تجربة الدخول السريع بحساب كاشير تجريبي (PIN: 1234)
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CashierLockModal;
