import React, { useState, useEffect, useMemo, useRef } from 'react';
import Modal from './Modal.js';
import { Employee, Order, ClosedShift, ActiveShiftSession } from '../types/index.js';
import { posApi, getStoredAdminPin } from '../api/client.js';
import { formatEGP, formatDateTime } from '../utils/formatters.js';
import { clockOutAllActiveEmployees, clockOutSingleCashier } from '../utils/attendanceStorage.js';
import { getStoredShiftOrders, clearStoredShiftOrders, deduplicateOrders } from '../utils/orderStorage.js';
import { appendClosedShift, saveStoredActiveShiftSession, saveLocalCashierSession } from '../utils/shiftStorage.js';
import { notifyShiftClose } from '../utils/telegramNotifications.js';
import { useToast } from './Toast.js';


interface ShiftCloseModalProps {
  isOpen: boolean;
  onClose: () => void;
  cashier: ActiveShiftSession | null;
  employees?: Employee[];
  onShiftClosed: () => void;
}

export const ShiftCloseModal: React.FC<ShiftCloseModalProps> = ({
  isOpen,
  onClose,
  cashier,
  employees = [],
  onShiftClosed,
}) => {
  const toast = useToast();
  const printReceiptRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [actualCash, setActualCash] = useState<string>('');
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [isEndOfDayClose, setIsEndOfDayClose] = useState(false);
  const [authPin, setAuthPin] = useState('');
  const [pinError, setPinError] = useState('');



  // Fetch shift orders
  useEffect(() => {
    if (!isOpen || !cashier) return;

    const fetchShiftOrders = async () => {
      try {
        setLoading(true);
        const cashierId = cashier.cashier_id || cashier.id;
        const shiftId = cashier.shift_id || cashier.id;
        const shiftCode = cashier.shift_code;
        const shiftStartMs = cashier.shift_start ? new Date(cashier.shift_start).getTime() : 0;

        // 1. Get shift orders stored in localStorage strictly filtered by shift_start
        const storedShiftOrders = getStoredShiftOrders(cashier.shift_start, shiftId);

        // 2. Also try posApi.getOrders
        const allOrders = await posApi.getOrders({ limit: 300 }, true).catch(() => []);

        // Combine / deduplicate orders strictly for this shift (Server orders take precedence)
        const combined = deduplicateOrders([
          ...(Array.isArray(allOrders) ? allOrders : []),
          ...storedShiftOrders,
        ]);

        const validShiftOrders = combined.filter((o) => {
          if (o.status === 'cancelled') return false;

          // 1. Direct shift ID or shift code match
          if (o.shift_id && (o.shift_id === shiftId || (shiftCode && o.shift_id === shiftCode))) {
            return true;
          }

          // 2. Created during this cashier's shift
          if (shiftStartMs > 0 && o.created_at) {
            const orderCreatedMs = new Date(o.created_at).getTime();
            if (orderCreatedMs >= shiftStartMs && (!o.cashier_id || o.cashier_id === cashierId)) {
              return true;
            }
          }

          return false;
        });

        setOrders(deduplicateOrders(validShiftOrders));
      } catch (err: any) {
        toast.error(err.message, 'تعذر جلب فواتير الشيفت الحالية');
      } finally {
        setLoading(false);
      }
    };

    fetchShiftOrders();
  }, [isOpen, cashier]);

  // Calculations
  const metrics = useMemo(() => {
    let cashTotal = 0;
    let cardTotal = 0;
    let transferTotal = 0;
    let grossTotal = 0;

    orders.forEach((order) => {
      const amount = Number(order.total_amount) || 0;
      grossTotal += amount;

      if (order.payment_method === 'cash') cashTotal += amount;
      else if (order.payment_method === 'card') cardTotal += amount;
      else if (order.payment_method === 'transfer' || (order.payment_method as any) === 'wallet') transferTotal += amount;
    });

    return {
      cashTotal,
      cardTotal,
      transferTotal,
      grossTotal,
      totalOrders: orders.length,
    };
  }, [orders]);

  // Variance calculation
  const numericActualCash = actualCash === '' ? null : Number(actualCash);
  const variance =
    numericActualCash !== null ? Number((numericActualCash - metrics.cashTotal).toFixed(2)) : null;

  // Elapsed Shift Duration
  const elapsedDuration = useMemo(() => {
    if (!cashier?.shift_start) return '0 دقيقة';
    const diffMs = Math.max(new Date().getTime() - new Date(cashier.shift_start).getTime(), 0);
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} دقيقة`;
    return `${hours} ساعة و ${minutes} دقيقة`;
  }, [cashier?.shift_start]);

  // Handle Print Shift Z-Report
  const handlePrintZReport = () => {
    const printContent = printReceiptRef.current;
    if (!printContent) return;

    const win = window.open('', '', 'width=450,height=700');
    if (!win) {
      toast.error('يرجى السماح بالنوافذ المنبثقة للطباعة');
      return;
    }

    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8" />
          <title>تقرير تقفيل الشيفت (Z-Report)</title>
          <style>
            @page { margin: 0; size: 80mm auto; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif;
              width: 76mm;
              margin: 0 auto;
              padding: 10px 4px;
              color: #000;
              background: #fff;
              font-size: 11px;
              line-height: 1.4;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-top: 1px dashed #000; margin: 6px 0; }
            .flex { display: flex; justify-content: space-between; margin: 3px 0; }
            .title { font-size: 14px; font-weight: 900; margin-bottom: 2px; }
            .subtitle { font-size: 10px; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10px; }
            th, td { padding: 3px 2px; text-align: right; }
            th { border-bottom: 1px solid #000; }
            .variance-box { border: 1px solid #000; padding: 4px; margin-top: 6px; font-weight: bold; text-align: center; }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
          <script>
            window.onload = function() {
              window.focus();
              window.print();
              setTimeout(() => { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  // Dual PIN Verification: Cashier PIN or Owner/Master Admin PIN Override
  const verifyShiftClosePin = (enteredPin: string): { isValid: boolean; approverName: string } => {
    const trimmed = (enteredPin || '').trim();
    if (!trimmed) return { isValid: false, approverName: '' };

    // 1. Check Master Admin PIN from localStorage (default 1234)
    const adminPin = getStoredAdminPin();

    if (trimmed === adminPin.trim()) {
      return { isValid: true, approverName: 'لوحة الإدارة العامة (Admin Override)' };
    }

    // 2. Check Owner PIN (مستر فتحي - pin_code: 1000 or from employee list)
    const ownerEmp = employees.find(
      (e) => e.name.includes('فتحي') || e.role.includes('مالك') || e.role.includes('مدير')
    );
    const ownerPin = ownerEmp?.pin_code || '1000';
    if (trimmed === ownerPin.trim()) {
      return { isValid: true, approverName: ownerEmp?.name || 'مستر فتحي (مالك المنشأة)' };
    }

    // 3. Check Active Cashier PIN
    const cashierId = cashier?.cashier_id || cashier?.id;
    const cashierName = cashier?.cashier_name || cashier?.name;
    const cashierEmp = employees.find(
      (e) => (cashierId && e.id === cashierId) || (cashierName && e.name === cashierName)
    );
    const cashierPin = cashierEmp?.pin_code || '1111';
    if (trimmed === cashierPin.trim()) {
      return { isValid: true, approverName: cashierEmp?.name || cashierName || 'الكاشير المسؤول' };
    }

    // Also check if entered PIN matches any active cashier employee
    const matchingEmp = employees.find((e) => e.pin_code && e.pin_code.trim() === trimmed);
    if (matchingEmp && (matchingEmp.id === cashierId || matchingEmp.name === cashierName)) {
      return { isValid: true, approverName: matchingEmp.name };
    }

    return { isValid: false, approverName: '' };
  };

  // Submit Shift Close with Dual-PIN Verification
  const handleConfirmCloseShift = async () => {
    if (!authPin.trim()) {
      setPinError('يرجى إدخال رمز PIN السري لتأكيد تقفيل الشيفت');
      toast.warning('يرجى إدخال رمز PIN السري لتأكيد تقفيل الشيفت');
      return;
    }

    const { isValid, approverName } = verifyShiftClosePin(authPin);
    if (!isValid) {
      setPinError('رمز PIN غير صحيح! يجب إدخال رمز الكاشير المسؤول عن الشفت أو رمز مالك المنشأة.');
      toast.error(
        'رمز PIN غير صحيح! يجب إدخال رمز الكاشير المسؤول عن الشفت أو رمز مالك المنشأة.',
        'فشل التحقق'
      );
      setAuthPin('');
      return;
    }

    try {
      setClosing(true);
      setPinError('');

      const resolvedCashierId = cashier?.cashier_id || cashier?.id;
      const resolvedCashierName = cashier?.cashier_name || cashier?.name || 'كاشير';
      const resolvedCashierRole = cashier?.cashier_role || cashier?.role || 'كاشير';

      // Construct archived closed shift record
      const shiftRecord: ClosedShift = {
        id: `shift-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        shift_code: `SH-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`,
        cashier_id: resolvedCashierId,
        cashier_name: resolvedCashierName,
        cashier_role: resolvedCashierRole,
        shift_start: cashier?.shift_start || new Date().toISOString(),
        shift_end: new Date().toISOString(),
        duration_formatted: elapsedDuration,
        gross_sales: metrics.grossTotal,
        cash_sales: metrics.cashTotal,
        card_sales: metrics.cardTotal,
        transfer_sales: metrics.transferTotal,
        total_orders: metrics.totalOrders,
        expected_cash: metrics.cashTotal,
        actual_cash: numericActualCash ?? metrics.cashTotal,
        variance: variance ?? 0,
        closing_notes: closingNotes.trim() || undefined,
        approved_by: approverName,
        is_end_of_day: isEndOfDayClose,
        orders: [...orders],
        active_workers_breakdown: [],
        created_at: new Date().toISOString(),
      };

      // Save to archive storage and API
      appendClosedShift(shiftRecord);
      saveStoredActiveShiftSession(null);
      posApi.closeActiveShift(shiftRecord).catch(() => {});

      // Dispatch automated Telegram shift closure notification
      notifyShiftClose(shiftRecord).catch(() => {});

      // Unconditionally clear active shift orders since this shift is now officially closed & archived
      clearStoredShiftOrders();

      if (isEndOfDayClose) {
        // End of Day Mode: Clock out all active workers and reset active headcount to 0
        const { totalClockedOut } = clockOutAllActiveEmployees(employees);
        toast.success(
          `تم تقفيل يوم العمل بالكامل واعتماده بواسطة (${approverName}) وتصفية شفت كافة الموظفين (${totalClockedOut} موظف) بنجاح وجرد الخزينة بمبلغ ${formatEGP(
            numericActualCash ?? metrics.cashTotal
          )}`,
          'تم التقفيل النهائي ليوم العمل'
        );
      } else {
        // Cashier Shift Change Mode: Clock out only the closing cashier
        if (resolvedCashierId) {
          clockOutSingleCashier(resolvedCashierId, employees);
        }
        toast.success(
          `تم تقفيل وردية الكاشير (${resolvedCashierName}) واعتمادها بواسطة (${approverName}) بنجاح وتسليم الشيفت وجرد الخزينة بمبلغ ${formatEGP(
            numericActualCash ?? metrics.cashTotal
          )}`,
          'تم تسليم الشيفت'
        );
      }

      // Remove cashier session from storage
      saveLocalCashierSession(null);
      setAuthPin('');

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('cw_shifts_updated'));
        window.dispatchEvent(new Event('cw_orders_updated'));
        window.dispatchEvent(new Event('storage'));
      }

      onShiftClosed();
      onClose();
    } catch (err: any) {
      toast.error(err.message, 'تعذر اعتماد تقفيل الشيفت');
    } finally {
      setClosing(false);
    }
  };



  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="تقفيل الشيفت وجرد الخزينة (Shift Z-Report)"
      maxWidth="2xl"
    >
      <div className="space-y-5 select-none py-1 max-h-[80vh] overflow-y-auto pr-1">
        {/* Shift Header Meta */}
        <div
          className="p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 backdrop-blur-md"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl border flex items-center justify-center font-bold shadow-inner"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                borderColor: 'var(--border-color)',
                color: 'var(--color-primary)',
              }}
            >
              <span className="font-black text-sm">{cashier?.name ? cashier.name.charAt(0) : 'ك'}</span>
            </div>
            <div>
              <div className="text-sm font-black text-white flex items-center gap-2">
                <span>الكاشير: {cashier?.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30">
                  {cashier?.role || 'كاشير'}
                </span>
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                <span>بداية الشيفت: {cashier?.shift_start ? formatDateTime(cashier.shift_start) : '-'}</span>
              </div>
            </div>
          </div>

          <div
            className="px-3 py-1.5 rounded-xl border text-xs font-mono text-slate-300 text-center sm:text-left shrink-0"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="text-[10px] text-slate-500">مدة الشيفت المنقضية</div>
            <div className="font-bold text-slate-200 mt-0.5">{elapsedDuration}</div>
          </div>
        </div>

        {/* Financial Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div
            className="p-3.5 rounded-2xl border backdrop-blur-md"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="text-slate-400 mb-1 font-bold">
              إجمالي الفواتير
            </div>
            <div className="text-xl font-black text-white font-mono">{metrics.totalOrders}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">سيارة منجزة بالشيفت</div>
          </div>

          <div
            className="p-3.5 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-md"
          >
            <div className="text-emerald-400 mb-1 font-bold">
              النقدية (الكاش المتوقع)
            </div>
            <div className="text-xl font-black text-emerald-400 font-mono">
              {formatEGP(metrics.cashTotal)}
            </div>
            <div className="text-[10px] text-emerald-500/80 mt-0.5">مبيعات نقدية بالدرج</div>
          </div>

          <div
            className="p-3.5 rounded-2xl border border-sky-500/30 bg-sky-950/20 backdrop-blur-md"
          >
            <div className="text-sky-400 mb-1 font-bold">
              فيزا وبطاقات
            </div>
            <div className="text-xl font-black text-sky-300 font-mono">
              {formatEGP(metrics.cardTotal)}
            </div>
            <div className="text-[10px] text-sky-500/80 mt-0.5">مدفوعات POS بنكية</div>
          </div>

          <div
            className="p-3.5 rounded-2xl border border-purple-500/30 bg-purple-950/20 backdrop-blur-md"
          >
            <div className="text-purple-400 mb-1 font-bold">
              محافظ إلكترونية
            </div>
            <div className="text-xl font-black text-purple-300 font-mono">
              {formatEGP(metrics.transferTotal)}
            </div>
            <div className="text-[10px] text-purple-500/80 mt-0.5">فودافون كاش / تحويل</div>
          </div>
        </div>

        {/* Cash Drawer Count & Reconciliation */}
        <div
          className="p-4 rounded-2xl border space-y-3"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="pb-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <h4 className="text-xs font-black text-white">جرد النقدية ومطابقة الدرج (Cash Reconciliation)</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                المبلغ الفعلي الموجود بالدرج (ج.م) *
              </label>
              <input
                type="number"
                step="any"
                min={0}
                placeholder="أدخل المبلغ بعد عد النقود في الدرج..."
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                className="w-full border rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none font-bold text-slate-100"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>

            {/* Live Variance Status Pill */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                حالة المطابقة والعجز/الزيادة
              </label>
              <div
                className={`w-full py-2.5 px-3 rounded-xl border text-xs font-bold font-mono flex items-center justify-between ${
                  variance === null
                    ? 'bg-slate-900/60 border-slate-800 text-slate-500'
                    : variance === 0
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : variance < 0
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                    : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                }`}
              >
                <span>
                  {variance === null
                    ? 'في انتظار إدخال جرد الدرج'
                    : variance === 0
                    ? 'الدرج مطابق تماماً (0.00)'
                    : variance < 0
                    ? `عجز في النقدية (${formatEGP(Math.abs(variance))})`
                    : `زيادة في النقدية (+${formatEGP(variance)})`}
                </span>
                {variance !== null && (
                  <span>{variance > 0 ? `+${formatEGP(variance)}` : formatEGP(variance)}</span>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              ملاحظات تقفيل الشيفت والتسليم للكاشير التالي (اختياري)
            </label>
            <input
              type="text"
              placeholder="مثال: تم تسليم العهدة النقدية ومفتاح الدرج للكاشير المناوب..."
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              className="w-full border rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            />
          </div>

          {/* End of Day Closure Toggle */}
          <div
            onClick={() => setIsEndOfDayClose(!isEndOfDayClose)}
            className={`cursor-pointer p-4 rounded-2xl border transition-all flex items-start gap-3 select-none ${
              isEndOfDayClose
                ? 'bg-rose-950/40 border-rose-500/50 shadow-lg shadow-rose-950/20'
                : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
            }`}
          >
            <input
              type="checkbox"
              id="endOfDayCloseCheckbox"
              checked={isEndOfDayClose}
              onChange={(e) => setIsEndOfDayClose(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-700 text-rose-600 focus:ring-rose-500 cursor-pointer"
            />
            <div className="flex-1">
              <label
                htmlFor="endOfDayCloseCheckbox"
                className="text-xs font-black text-slate-100 cursor-pointer flex items-center gap-1.5"
              >
                <span>تقفيل نهائي ليوم العمل (إنهاء وتصفية شيفت كافة الموظفين تلقائياً)</span>
                {isEndOfDayClose && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                    نهاية اليوم
                  </span>
                )}
              </label>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                {isEndOfDayClose
                  ? 'سيتم تسجيل انصراف وتصفية دوام كافة الفنيين والكاشير النشطين وتصفير الحضور لليوم.'
                  : 'تسليم وردية لكاشير جديد فقط: سيتم تسجيل انصراف الكاشير الحالي مع الإبقاء على الفنيين وعمال الغسيل على رأس العمل.'}
              </p>
            </div>
          </div>

          {/* Dual-PIN Authorization Section */}
          <div
            className="p-4 rounded-2xl border backdrop-blur-md space-y-3"
            style={{
              backgroundColor: 'rgba(2, 6, 23, 0.65)',
              borderColor: pinError ? 'rgba(244, 63, 94, 0.6)' : 'var(--border-color)',
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                  <span>التحقق الأمني واعتماد الإغلاق (رمز PIN)</span>
                  <span className="text-rose-400">*</span>
                </h4>
                <p className="text-[10px] text-slate-400">
                  أدخل رمز PIN للكاشير المسؤول ({cashier?.name || 'الكاشير'}) أو رمز مالك المنشأة (مستر فتحي)
                </p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                Dual PIN
              </span>
            </div>

            <div className="relative">
              <input
                type="password"
                maxLength={6}
                placeholder="أدخل رمز PIN المكون من 4 أرقام..."
                value={authPin}
                onChange={(e) => {
                  setAuthPin(e.target.value);
                  if (pinError) setPinError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirmCloseShift();
                  }
                }}
                className={`w-full border rounded-xl px-4 py-2.5 text-center text-sm font-mono tracking-widest font-bold text-white focus:outline-none transition-all placeholder:font-sans placeholder:tracking-normal placeholder:text-xs placeholder:text-slate-500 ${
                  pinError
                    ? 'border-rose-500 bg-rose-950/20 focus:border-rose-400 ring-1 ring-rose-500/50'
                    : 'focus:border-primary'
                }`}
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderColor: pinError ? undefined : 'var(--border-color)',
                }}
              />
              {authPin && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthPin('');
                    setPinError('');
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {pinError && (
              <div className="text-[11px] font-bold text-rose-400 animate-fadeIn">
                <span>{pinError}</span>
              </div>
            )}
          </div>
        </div>


        {/* Action Buttons */}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={handlePrintZReport}
            className="flex items-center justify-center gap-2 py-3 border text-slate-200 rounded-xl text-xs font-bold transition-all hover:bg-white/5"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'var(--border-color)',
            }}
          >
            <span>طباعة تقرير Z-Report للشيفت</span>
          </button>

          <button
            type="button"
            onClick={handleConfirmCloseShift}
            disabled={closing}
            className="flex items-center justify-center gap-2 py-3 text-white rounded-xl text-xs font-bold shadow-lg transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-primary)',
            }}
          >
            {closing && (
              <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />
            )}
            <span>اعتماد وقفل الشيفت والخروج</span>
          </button>
        </div>

        {/* Hidden Printable Thermal Z-Report */}
        <div className="hidden">
          <div ref={printReceiptRef}>
            <div className="center">
              <div className="title">مغسلة السيارات الذكية</div>
              <div className="subtitle">تقرير تقفيل الشيفت اليومي (Z-Report)</div>
            </div>

            <div className="divider"></div>

            <div className="flex">
              <span>الكاشير:</span>
              <span className="bold">{cashier?.name}</span>
            </div>
            <div className="flex">
              <span>بداية الشيفت:</span>
              <span>{cashier?.shift_start ? formatDateTime(cashier.shift_start) : '-'}</span>
            </div>
            <div className="flex">
              <span>وقت الإغلاق:</span>
              <span>{formatDateTime(new Date().toISOString())}</span>
            </div>
            <div className="flex">
              <span>مدة الشيفت:</span>
              <span>{elapsedDuration}</span>
            </div>

            <div className="divider"></div>

            <div className="center bold" style={{ fontSize: '12px', margin: '4px 0' }}>ملخص مبيعات الشيفت</div>
            <div className="flex">
              <span>إجمالي الفواتير:</span>
              <span className="bold">{metrics.totalOrders} سيارة</span>
            </div>
            <div className="flex">
              <span>النقدية المتوقعة (كاش):</span>
              <span className="bold">{formatEGP(metrics.cashTotal)}</span>
            </div>
            <div className="flex">
              <span>بطاقات وفيزا:</span>
              <span>{formatEGP(metrics.cardTotal)}</span>
            </div>
            <div className="flex">
              <span>محافظ إلكترونية:</span>
              <span>{formatEGP(metrics.transferTotal)}</span>
            </div>
            <div className="flex bold" style={{ fontSize: '12px', marginTop: '4px' }}>
              <span>إجمالي المبيعات:</span>
              <span>{formatEGP(metrics.grossTotal)}</span>
            </div>

            <div className="divider"></div>

            <div className="center bold" style={{ fontSize: '11px', margin: '4px 0' }}>جرد ومطابقة الخزينة</div>
            <div className="flex">
              <span>الكاش الفعلي بالدرج:</span>
              <span className="bold">{formatEGP(numericActualCash ?? metrics.cashTotal)}</span>
            </div>
            <div className="flex">
              <span>الكاش المسجل بالنظام:</span>
              <span>{formatEGP(metrics.cashTotal)}</span>
            </div>
            <div className="variance-box">
              {variance === null || variance === 0
                ? 'الدرج مطابق تماماً (لا يوجد عجز أو زيادة)'
                : variance < 0
                ? `عجز في النقدية: ${formatEGP(Math.abs(variance))}`
                : `زيادة في النقدية: +${formatEGP(variance)}`}
            </div>

            {closingNotes && (
              <div style={{ marginTop: '6px', fontSize: '10px' }}>
                <span className="bold">ملاحظات:</span> {closingNotes}
              </div>
            )}

            <div className="divider"></div>
            <div className="center" style={{ fontSize: '9px', color: '#666', marginTop: '6px' }}>
              تم استخراج التقرير آلياً من نظام المغسلة الذكية
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ShiftCloseModal;
