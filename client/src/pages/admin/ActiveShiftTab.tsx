import React, { useState, useEffect, useMemo } from 'react';
import { posApi, hrApi } from '../../api/client.js';
import { Order, Employee, ClosedShift, ActiveShiftSession } from '../../types/index.js';
import { FALLBACK_EMPLOYEES } from '../../api/mockFallbacks.js';
import { useToast } from '../../components/Toast.js';
import ThermalReceipt from '../../components/ThermalReceipt.js';
import ShiftCloseModal from '../../components/ShiftCloseModal.js';
import ClosedShiftDetailsModal from '../../components/ClosedShiftDetailsModal.js';
import Modal from '../../components/Modal.js';
import { formatEGP, formatDateTime, formatDate, formatTime } from '../../utils/formatters.js';
import { getStoredShiftOrders, getStoredAllOrders, deduplicateOrders } from '../../utils/orderStorage.js';
import {
  getStoredClosedShifts,
  printClosedShiftZReport,
  deleteClosedShift,
  getStoredActiveShiftSession,
  saveStoredActiveShiftSession,
} from '../../utils/shiftStorage.js';
import { autoClockInCashier, isOwnerEmployee } from '../../utils/attendanceStorage.js';
import { debounce } from '../../utils/eventBus.js';
import { EmptyState, TableSkeletonRows, ErrorState } from '../../components/ui/index.js';

export const ActiveShiftTab: React.FC = () => {
  const toast = useToast();

  // Sub-Navigation Tab: 'active' | 'history'
  const [activeSubTab, setActiveSubTab] = useState<'active' | 'history'>('active');

  // ==========================================
  // Active Cashier Shift State
  // ==========================================
  const [activeCashier, setActiveCashier] = useState<ActiveShiftSession | null>(() => {
    try {
      const saved = localStorage.getItem('pos_active_cashier');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && !isOwnerEmployee(parsed)) return parsed;
      }
      const synced = getStoredActiveShiftSession();
      if (synced && !isOwnerEmployee(synced)) return synced;
      return null;
    } catch {
      return null;
    }
  });

  const [employees, setEmployees] = useState<Employee[]>(FALLBACK_EMPLOYEES);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');

  // Modals for Active Shift
  const [selectedOrderToPrint, setSelectedOrderToPrint] = useState<Order | null>(null);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [isShiftCloseOpen, setIsShiftCloseOpen] = useState(false);

  // ==========================================
  // Past Closed Shifts Archive State
  // ==========================================
  const [closedShifts, setClosedShifts] = useState<ClosedShift[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyCashierFilter, setHistoryCashierFilter] = useState('');
  const [historyDatePreset, setHistoryDatePreset] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');

  // Modals for Past Shifts Archive
  const [selectedShiftForDetails, setSelectedShiftForDetails] = useState<ClosedShift | null>(null);
  const [shiftToDelete, setShiftToDelete] = useState<ClosedShift | null>(null);
  const [isDeletingShift, setIsDeletingShift] = useState(false);

  // Fetch active shift orders and employees
  const fetchActiveShiftData = async (isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
      }
      const [empList, apiOrders, serverActiveShift] = await Promise.all([
        hrApi.getEmployees('active').catch(() => FALLBACK_EMPLOYEES),
        posApi.getOrders({ limit: 500 }, true).catch(() => []),
        posApi.getActiveShift(true).catch(() => null),
      ]);
      const validEmp = Array.isArray(empList) && empList.length > 0 ? empList : FALLBACK_EMPLOYEES;
      setEmployees(validEmp);

      // Resolve current active cashier (remote/synced central active shift takes precedence, then valid local session)
      let currentCashier: ActiveShiftSession | null = null;
      try {
        if (serverActiveShift && !isOwnerEmployee(serverActiveShift) && serverActiveShift.status !== 'closed') {
          currentCashier = serverActiveShift;
        } else {
          const localSaved = localStorage.getItem('pos_active_cashier');
          if (localSaved) {
            const parsed = JSON.parse(localSaved);
            if (parsed && !isOwnerEmployee(parsed) && parsed.status !== 'closed') {
              currentCashier = parsed;
            }
          }
          if (!currentCashier) {
            const synced = getStoredActiveShiftSession();
            if (synced && !isOwnerEmployee(synced) && synced.status !== 'closed') {
              currentCashier = synced;
            }
          }
        }
      } catch {}

      setActiveCashier((prev) => {
        if (!prev && !currentCashier) return prev;
        if (
          prev &&
          currentCashier &&
          (prev.shift_id === currentCashier.shift_id || prev.id === currentCashier.id) &&
          prev.status === currentCashier.status &&
          prev.shift_start === currentCashier.shift_start &&
          (prev.cashier_id === currentCashier.cashier_id || prev.cashier_name === currentCashier.cashier_name)
        ) {
          return prev;
        }
        return currentCashier;
      });

      // Guarantee attendance and central session storage for current cashier (idempotent write)
      if (serverActiveShift && !isOwnerEmployee(serverActiveShift)) {
        saveStoredActiveShiftSession(serverActiveShift);
      }
      if (currentCashier && !isOwnerEmployee(currentCashier)) {
        autoClockInCashier(currentCashier, validEmp);
      }

      // If active cashier is logged in:
      if (currentCashier?.shift_start) {
        const cashierId = currentCashier.cashier_id || currentCashier.id;
        const shiftId = currentCashier.shift_id || currentCashier.id;
        const shiftCode = currentCashier.shift_code;
        const shiftStartMs = new Date(currentCashier.shift_start).getTime();

        const storedShiftOrders = getStoredShiftOrders(currentCashier.shift_start, shiftId);
        const storedAll = getStoredAllOrders();

        const combined = deduplicateOrders([
          ...(Array.isArray(apiOrders) ? apiOrders : []),
          ...storedShiftOrders,
          ...storedAll,
        ]);

        // Filter orders belonging to this active shift strictly matching ShiftCloseModal & DB
        const validShiftOrders = combined.filter((o) => {
          if (o.status === 'cancelled') return false;

          // 1. Direct shift ID or shift code match
          if (
            o.shift_id &&
            (o.shift_id === shiftId ||
              (shiftCode && o.shift_id === shiftCode) ||
              (shiftCode && String(o.shift_id).includes(shiftCode)))
          ) {
            return true;
          }

          // 2. Direct cashier identity match
          if (
            (cashierId && o.cashier_id === cashierId) ||
            (currentCashier.cashier_name && o.cashier_name === currentCashier.cashier_name)
          ) {
            if (shiftStartMs > 0 && o.created_at) {
              const orderCreatedMs = new Date(o.created_at).getTime();
              if (orderCreatedMs >= shiftStartMs - 15 * 60 * 1000) {
                return true;
              }
            } else {
              return true;
            }
          }

          // 3. Created during this cashier's shift (with 15 min tolerance)
          if (shiftStartMs > 0 && o.created_at) {
            const orderCreatedMs = new Date(o.created_at).getTime();
            if (orderCreatedMs >= shiftStartMs - 15 * 60 * 1000) {
              if (!o.cashier_id || o.cashier_id === cashierId || o.cashier_name === currentCashier.cashier_name) {
                return true;
              }
            }
          }

          return false;
        });

        setOrders(deduplicateOrders(validShiftOrders));
      } else {
        setOrders([]);
      }
    } catch (err: any) {
      if (isInitial) {
        toast.error(err.message, 'تعذر تحميل بيانات الوردية الحالية');
      }
      setEmployees(FALLBACK_EMPLOYEES);
      setOrders([]);
    } finally {
      if (isInitial) {
        setLoading(false);
      }
    }
  };

  // Fetch Closed Shifts Archive
  const fetchClosedShiftsData = async (isInitial = false) => {
    try {
      if (isInitial) {
        setHistoryLoading(true);
      }
      const shifts = await posApi.getClosedShifts(
        {
          startDate: historyStartDate || undefined,
          endDate: historyEndDate || undefined,
          cashierId: historyCashierFilter || undefined,
          search: historySearch || undefined,
        },
        true
      );
      setClosedShifts(shifts);
    } catch (err: any) {
      const fallback = getStoredClosedShifts();
      setClosedShifts(fallback);
    } finally {
      if (isInitial) {
        setHistoryLoading(false);
      }
    }
  };

  // Listen to external events (Shift close, attendance changes, storage)
  useEffect(() => {
    const debouncedShiftEvents = debounce(() => {
      fetchClosedShiftsData(false);
      try {
        const saved = localStorage.getItem('pos_active_cashier');
        if (saved) {
          const parsed = JSON.parse(saved);
          setActiveCashier((prev) => {
            if (
              prev &&
              parsed &&
              (prev.shift_id === parsed.shift_id || prev.id === parsed.id) &&
              prev.status === parsed.status &&
              prev.shift_start === parsed.shift_start
            ) {
              return prev;
            }
            return parsed;
          });
        } else {
          const synced = getStoredActiveShiftSession();
          setActiveCashier((prev) => {
            if (
              prev &&
              synced &&
              (prev.shift_id === synced.shift_id || prev.id === synced.id) &&
              prev.status === synced.status &&
              prev.shift_start === synced.shift_start
            ) {
              return prev;
            }
            return synced;
          });
        }
      } catch {}
      fetchActiveShiftData(false);
    }, 500);

    window.addEventListener('cw_shifts_updated', debouncedShiftEvents);
    window.addEventListener('cw_orders_updated', debouncedShiftEvents);
    window.addEventListener('cw_attendance_updated', debouncedShiftEvents);
    window.addEventListener('storage', debouncedShiftEvents);
    return () => {
      debouncedShiftEvents.cancel();
      window.removeEventListener('cw_shifts_updated', debouncedShiftEvents);
      window.removeEventListener('cw_orders_updated', debouncedShiftEvents);
      window.removeEventListener('cw_attendance_updated', debouncedShiftEvents);
      window.removeEventListener('storage', debouncedShiftEvents);
    };
  }, []);

  // Sync date preset changes
  useEffect(() => {
    const now = new Date();
    if (historyDatePreset === 'all') {
      setHistoryStartDate('');
      setHistoryEndDate('');
    } else if (historyDatePreset === 'today') {
      const todayStr = now.toISOString().slice(0, 10);
      setHistoryStartDate(todayStr);
      setHistoryEndDate(todayStr);
    } else if (historyDatePreset === 'week') {
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setHistoryStartDate(lastWeek.toISOString().slice(0, 10));
      setHistoryEndDate(now.toISOString().slice(0, 10));
    } else if (historyDatePreset === 'month') {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setHistoryStartDate(firstOfMonth.toISOString().slice(0, 10));
      setHistoryEndDate(now.toISOString().slice(0, 10));
    }
  }, [historyDatePreset]);

  // Initial load on mount
  useEffect(() => {
    fetchActiveShiftData(true);
  }, []);

  // Live polling for real-time mobile manager monitoring
  useEffect(() => {
    if (activeSubTab !== 'active') return;

    const intervalId = setInterval(() => {
      fetchActiveShiftData(false);
    }, 15000);

    const handleFocus = () => {
      fetchActiveShiftData(false);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [activeSubTab]);

  // Trigger history data fetch on filter changes
  useEffect(() => {
    fetchClosedShiftsData(true);
  }, [historyStartDate, historyEndDate, historyCashierFilter, historySearch]);

  // Elapsed Shift Duration Timer for Active Shift
  const elapsedDuration = useMemo(() => {
    if (!activeCashier?.shift_start) return '0 دقيقة';
    const diffMs = Math.max(new Date().getTime() - new Date(activeCashier.shift_start).getTime(), 0);
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} دقيقة`;
    return `${hours} ساعة و ${minutes} دقيقة`;
  }, [activeCashier?.shift_start]);

  // Active Shift KPI Metrics
  const activeMetrics = useMemo(() => {
    let grossTotal = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let transferTotal = 0;
    let validCount = 0;
    let cancelledCount = 0;

    orders.forEach((o) => {
      if (o.status === 'cancelled') {
        cancelledCount += 1;
        return;
      }
      validCount += 1;
      const amt = Number(o.total_amount) || 0;
      grossTotal += amt;
      if (o.payment_method === 'cash') cashTotal += amt;
      else if (o.payment_method === 'card') cardTotal += amt;
      else if (o.payment_method === 'transfer' || (o.payment_method as any) === 'wallet') transferTotal += amt;
    });

    // Remote Manager Fallback: If local orders list is empty or smaller than server aggregate
    const serverGross = Number(activeCashier?.gross_sales) || 0;
    const serverOrders = Number(activeCashier?.total_orders) || 0;

    if (grossTotal === 0 && serverGross > 0) {
      grossTotal = serverGross;
      cashTotal = Number(activeCashier?.cash_sales) || 0;
      cardTotal = Number(activeCashier?.card_sales) || 0;
      transferTotal = Number(activeCashier?.transfer_sales) || 0;
      validCount = serverOrders;
    }

    return {
      grossTotal,
      cashTotal,
      cardTotal,
      transferTotal,
      validCount,
      cancelledCount,
      totalOrders: Math.max(orders.length, serverOrders),
    };
  }, [orders, activeCashier]);

  // Past Shifts Summary Metrics (Filtered)
  const historyMetrics = useMemo(() => {
    let totalGross = 0;
    let totalCash = 0;
    let totalCard = 0;
    let totalTransfer = 0;
    let totalOrdersCount = 0;
    let totalVarianceNet = 0;
    let exactCount = 0;
    let shortageCount = 0;
    let surplusCount = 0;

    closedShifts.forEach((s) => {
      totalGross += Number(s.gross_sales) || 0;
      totalCash += Number(s.cash_sales) || 0;
      totalCard += Number(s.card_sales) || 0;
      totalTransfer += Number(s.transfer_sales) || 0;
      totalOrdersCount += Number(s.total_orders) || 0;
      const v = Number(s.variance) || 0;
      totalVarianceNet += v;
      if (v === 0) exactCount++;
      else if (v < 0) shortageCount++;
      else surplusCount++;
    });

    return {
      totalShifts: closedShifts.length,
      totalGross,
      totalCash,
      totalCard,
      totalTransfer,
      totalCardAndTransfer: totalCard + totalTransfer,
      totalOrdersCount,
      totalVarianceNet,
      exactCount,
      shortageCount,
      surplusCount,
    };
  }, [closedShifts]);

  // Handle Cancel / Refund Order in Active Shift
  const handleConfirmCancel = async () => {
    if (!orderToCancel) return;

    try {
      setIsCancelling(true);
      await posApi.cancelOrder(orderToCancel.id, cancelReason.trim() || undefined);
      toast.success(
        `تم إلغاء الفاتورة (${orderToCancel.order_code}) وإعادة المواد للمخزن بنجاح!`,
        'تم استرجاع الطلب'
      );
      setOrderToCancel(null);
      setCancelReason('');
      fetchActiveShiftData();
    } catch (err: any) {
      toast.error(err.message || 'تعذر إلغاء الفاتورة', 'فشل الاسترجاع');
    } finally {
      setIsCancelling(false);
    }
  };

  // Handle Delete Shift from Archive
  const handleConfirmDeleteShift = async () => {
    if (!shiftToDelete) return;

    try {
      setIsDeletingShift(true);
      await posApi.deleteClosedShift(shiftToDelete.id);
      toast.success(`تم حذف سجل الوردية (${shiftToDelete.shift_code}) وفواتيرها غير المربوطة ضريبياً بنجاح`);
      setShiftToDelete(null);
      fetchClosedShiftsData();
    } catch (err: any) {
      toast.error(err.message || 'تعذر حذف سجل الوردية', 'فشل الحذف');
    } finally {
      setIsDeletingShift(false);
    }
  };

  // Filtered Orders for Active Shift Table
  const filteredActiveOrders = orders.filter((o) => {
    const s = search.toLowerCase();
    const matchesSearch =
      o.order_code.toLowerCase().includes(s) ||
      (o.customer_name && o.customer_name.toLowerCase().includes(s)) ||
      (o.customer_phone && o.customer_phone.includes(s)) ||
      (o.service_name && o.service_name.toLowerCase().includes(s));

    const matchesPayment = !paymentFilter || o.payment_method === paymentFilter;
    return matchesSearch && matchesPayment;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Thermal Receipt Preview Modal */}
      {selectedOrderToPrint && (
        <ThermalReceipt
          order={selectedOrderToPrint}
          onClose={() => setSelectedOrderToPrint(null)}
        />
      )}

      {/* Shift Close / Z-Report Modal */}
      <ShiftCloseModal
        isOpen={isShiftCloseOpen}
        onClose={() => setIsShiftCloseOpen(false)}
        cashier={activeCashier}
        employees={employees}
        onShiftClosed={() => {
          setActiveCashier(null);
          fetchActiveShiftData();
          fetchClosedShiftsData();
        }}
      />

      {/* Closed Shift Details Modal */}
      {selectedShiftForDetails && (
        <ClosedShiftDetailsModal
          shift={selectedShiftForDetails}
          onClose={() => setSelectedShiftForDetails(null)}
        />
      )}

      {/* Delete Shift Confirmation Modal */}
      {shiftToDelete && (
        <Modal
          isOpen={!!shiftToDelete}
          onClose={() => {
            if (!isDeletingShift) setShiftToDelete(null);
          }}
          title="حذف سجل الوردية من الأرشيف"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 space-y-2">
              <div className="font-bold text-sm text-rose-300">تحذير: حذف نهائي لسجل الوردية وفواتيرها</div>
              <p className="leading-relaxed">
                هل أنت متأكد من حذف الوردية رقم ({shiftToDelete.shift_code}) للكاشير ({shiftToDelete.cashier_name})؟
              </p>
              <div className="pt-2 border-t border-rose-500/20 text-amber-200 text-[11px] leading-relaxed">
                سيتم حذف الوردية وكافة فواتيرها غير المربوطة بالضرائب. الفواتير المعتمدة ضريبياً (ETA) ستبقى محفوظة قانونياً.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShiftToDelete(null)}
                disabled={isDeletingShift}
                className="py-2.5 border rounded-xl text-slate-400 hover:text-slate-200 font-bold transition-all"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderColor: 'var(--border-color)',
                }}
              >
                تراجع
              </button>

              <button
                type="button"
                onClick={handleConfirmDeleteShift}
                disabled={isDeletingShift}
                className="flex items-center justify-center py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
              >
                {isDeletingShift ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin ml-2" />
                ) : null}
                <span>تأكيد الحذف</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Order Cancel & Refund Modal for Active Shift */}
      {orderToCancel && (
        <Modal
          isOpen={!!orderToCancel}
          onClose={() => {
            if (!isCancelling) setOrderToCancel(null);
          }}
          title="إلغاء واسترجاع الفاتورة في الوردية الحالية"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200">
              <div className="space-y-1">
                <div className="font-bold text-sm text-rose-300">تأكيد استرجاع الفاتورة وإعادة المخزون</div>
                <p>
                  سيتم خصم قيمة الفاتورة من مبيعات الوردية الحالية، وإعادة كافة كميات المواد الخام
                  المستهلكة (BOM) آلياً إلى رصيد المخزن.
                </p>
              </div>
            </div>

            <div
              className="p-3.5 rounded-2xl border space-y-2 font-mono text-slate-300"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            >
              <div className="flex justify-between">
                <span className="text-slate-500">كود الفاتورة:</span>
                <span className="font-bold text-slate-100">{orderToCancel.order_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">نوع الخدمة:</span>
                <span className="font-bold text-slate-100">{orderToCancel.service_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">المبلغ الإجمالي:</span>
                <span className="font-bold text-emerald-400">{formatEGP(orderToCancel.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">طريقة الدفع:</span>
                <span>
                  {orderToCancel.payment_method === 'cash'
                    ? 'كاش'
                    : orderToCancel.payment_method === 'card'
                    ? 'فيزا / بطاقة'
                    : 'محفظة إلكترونية'}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                سبب الإلغاء أو حل النزاع (اختياري)
              </label>
              <input
                type="text"
                placeholder="مثال: رغبة العميل في إلغاء الباقة / خطأ في اختيار الخدمة..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full border rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setOrderToCancel(null)}
                disabled={isCancelling}
                className="py-2.5 border rounded-xl text-slate-400 hover:text-slate-200 font-bold transition-all"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderColor: 'var(--border-color)',
                }}
              >
                تراجع
              </button>

              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isCancelling}
                className="flex items-center justify-center py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
              >
                {isCancelling ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin ml-2" />
                ) : null}
                <span>تأكيد الإلغاء والاسترجاع</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================== */}
      {/* Sub-Navigation Navigation Header Bar       */}
      {/* ========================================== */}
      <div
        className="p-2 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 backdrop-blur-md shadow-lg"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-color)',
        }}
      >
        {/* Tab Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('active')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${
              activeSubTab === 'active'
                ? 'text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
            style={
              activeSubTab === 'active'
                ? { backgroundColor: 'var(--color-primary)' }
                : undefined
            }
          >
            <span>الوردية الحالية (النشطة)</span>
            {orders.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/20 text-white font-mono font-bold">
                {orders.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSubTab('history');
              fetchClosedShiftsData();
            }}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${
              activeSubTab === 'history'
                ? 'text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
            style={
              activeSubTab === 'history'
                ? { backgroundColor: 'var(--color-primary)' }
                : undefined
            }
          >
            <span>أرشيف الورديات السابقة</span>
            {closedShifts.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/20 text-white font-mono font-bold">
                {closedShifts.length}
              </span>
            )}
          </button>
        </div>

        {/* Global Action Refresh */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (activeSubTab === 'active') fetchActiveShiftData();
              else fetchClosedShiftsData();
            }}
            title="تحديث البيانات"
            className="flex items-center gap-1.5 px-3 py-2 border text-slate-300 rounded-xl text-xs font-semibold backdrop-blur-md transition-all hover:bg-white/5"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'var(--border-color)',
            }}
          >
            {(activeSubTab === 'active' ? loading : historyLoading) && (
              <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin ml-1" />
            )}
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* ========================================== */}
      {/* VIEW 1: ACTIVE CASHIER SHIFT               */}
      {/* ========================================== */}
      {activeSubTab === 'active' && (
        <div className="space-y-6">
          {/* Header & Active Cashier Profile Banner */}
          <div
            className="p-5 rounded-3xl border shadow-xl backdrop-blur-md flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex items-center gap-3.5">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <span>مراقبة الوردية النشطة (شاشة المالك/الإدارة)</span>
                  </h2>

                  {activeCashier ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      <span>الوردية نشطة: {activeCashier.cashier_name || activeCashier.name}</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      عرض مبيعات اليوم الشاملة
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400 mt-1 font-mono">
                  {activeCashier?.shift_start ? (
                    <>
                      بداية الشيفت:{' '}
                      <span className="text-slate-200">{formatDateTime(activeCashier.shift_start)}</span> | المدة
                      المنقضية: <span className="text-emerald-400 font-bold">{elapsedDuration}</span>
                    </>
                  ) : (
                    'لا توجد وردية كاشير نشطة مسجلة حالياً - بانتظار تسجيل دخول الكاشير لبدء الوردية'
                  )}
                </p>
              </div>
            </div>

            {/* Action Controls */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {activeCashier && (
                <button
                  type="button"
                  onClick={() => setIsShiftCloseOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-white rounded-xl text-xs font-bold shadow-lg transition-all hover:brightness-110 active:scale-95"
                  style={{
                    backgroundColor: 'var(--color-primary)',
                  }}
                >
                  <span>تقفيل الوردية وجرد الخزينة (Z-Report)</span>
                </button>
              )}
            </div>
          </div>

          {/* 4 Shift KPI Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div
              className="p-4 rounded-3xl border backdrop-blur-md"
              style={{
                backgroundColor: 'var(--card-bg)',
                borderColor: 'var(--border-color)',
              }}
            >
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="font-bold">إجمالي مبيعات الوردية</span>
              </div>
              <div className="text-2xl font-black font-mono mt-1" style={{ color: 'var(--color-primary)' }}>
                {formatEGP(activeMetrics.grossTotal)}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {activeMetrics.validCount} فاتورة مؤكدة
              </div>
            </div>

            <div className="p-4 rounded-3xl border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-md">
              <div className="flex items-center justify-between text-emerald-400 mb-1">
                <span className="font-bold">النقدية بالدرج (كاش)</span>
              </div>
              <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                {formatEGP(activeMetrics.cashTotal)}
              </div>
              <div className="text-[10px] text-emerald-500/80 mt-1">المبلغ الفعلي المفترض بالخزينة</div>
            </div>

            <div className="p-4 rounded-3xl border border-sky-500/30 bg-sky-950/20 backdrop-blur-md">
              <div className="flex items-center justify-between text-sky-400 mb-1">
                <span className="font-bold">بطاقات وفيزا POS</span>
              </div>
              <div className="text-2xl font-black text-sky-300 font-mono mt-1">
                {formatEGP(activeMetrics.cardTotal)}
              </div>
              <div className="text-[10px] text-sky-500/80 mt-1">المدفوعات الإلكترونية البنكية</div>
            </div>

            <div className="p-4 rounded-3xl border border-purple-500/30 bg-purple-950/20 backdrop-blur-md">
              <div className="flex items-center justify-between text-purple-400 mb-1">
                <span className="font-bold">محافظ إلكترونية / تحويل</span>
              </div>
              <div className="text-2xl font-black text-purple-300 font-mono mt-1">
                {formatEGP(activeMetrics.transferTotal)}
              </div>
              <div className="text-[10px] text-purple-500/80 mt-1">فودافون كاش / إنستاباي</div>
            </div>
          </div>

          {/* Filter and Search Controls */}
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border p-3 rounded-2xl backdrop-blur-md"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="بحث في وردية اليوم برقم الفاتورة، العميل، نوع الغسيل..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="border rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <option value="">جميع طرق الدفع</option>
                <option value="cash">كاش فقط</option>
                <option value="card">فيزا وبطاقات</option>
                <option value="transfer">محافظ إلكترونية</option>
              </select>
            </div>
          </div>

          {/* Orders Table of Current Shift */}
          <div
            className="border rounded-3xl overflow-hidden shadow-xl backdrop-blur-md"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead
                  className="text-slate-400 border-b"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.35)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <tr>
                    <th className="py-3 px-4 font-semibold">رقم الفاتورة</th>
                    <th className="py-3 px-4 font-semibold">الوقت</th>
                    <th className="py-3 px-4 font-semibold">العميل</th>
                    <th className="py-3 px-4 font-semibold">نوع الغسيل / الباقة</th>
                    <th className="py-3 px-4 font-semibold">المبلغ</th>
                    <th className="py-3 px-4 font-semibold">طريقة الدفع</th>
                    <th className="py-3 px-4 font-semibold">الحالة</th>
                    <th className="py-3 px-4 font-semibold text-center">إجراءات وإلغاء</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                  {loading ? (
                    <TableSkeletonRows columns={9} rows={4} />
                  ) : filteredActiveOrders.length > 0 ? (
                    filteredActiveOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                          {order.order_code}
                        </td>

                        <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                          {formatTime(order.created_at)}
                        </td>

                        <td className="py-3 px-4 text-slate-300">
                          <div className="font-semibold">{order.customer_name || 'عميل نقدي'}</div>
                          {order.customer_phone && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              {order.customer_phone}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 text-slate-200 font-medium">
                          <div>{order.service_name}</div>
                        </td>

                        <td className="py-3 px-4 font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                          {formatEGP(order.total_amount)}
                        </td>

                        <td className="py-3 px-4 text-slate-400">
                          {order.payment_method === 'cash'
                            ? 'كاش'
                            : order.payment_method === 'card'
                            ? 'فيزا / بطاقة'
                            : 'محفظة / تحويل'}
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              order.status === 'completed'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : order.status === 'in_progress'
                                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {order.status === 'completed'
                              ? 'مكتمل'
                              : order.status === 'in_progress'
                              ? 'قيد الغسيل'
                              : 'ملغي ومسترجع'}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Print Receipt Button */}
                            <button
                              onClick={() => setSelectedOrderToPrint(order)}
                              title="طباعة إيصال حراري"
                              className="px-2.5 py-1 border text-slate-300 rounded-lg text-xs font-bold transition-colors hover:bg-white/10"
                              style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                borderColor: 'var(--border-color)',
                              }}
                            >
                              <span>طباعة</span>
                            </button>

                            {/* Cancel / Refund Order Button */}
                            {order.status !== 'cancelled' && (
                              <button
                                onClick={() => setOrderToCancel(order)}
                                title="إلغاء واسترجاع الفاتورة وإعادة المواد للمخزن فورياً"
                                className="px-2.5 py-1 border border-rose-500/30 text-rose-400 bg-rose-950/30 hover:bg-rose-900/50 rounded-lg text-xs font-bold transition-colors"
                              >
                                <span>إلغاء</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8">
                        <EmptyState
                          compact
                          title="لا توجد فواتير مسجلة في هذه الوردية حتى الآن"
                          description="تبدأ الفواتير بالظهور هنا فور إصدارها من شاشة الكاشير (POS)"
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* VIEW 2: PAST SHIFTS HISTORY ARCHIVE        */}
      {/* ========================================== */}
      {activeSubTab === 'history' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div
            className="p-5 rounded-3xl border shadow-xl backdrop-blur-md flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex items-center gap-3.5">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <span>سجل وأرشيف الورديات السابقة (Closed Shifts Archive)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  أرشيف تفصيلي وتقارير Z-Report لكافة ورديات الكاشير المقفلة مع جرد الخزينة وتدقيق الفوارق
                </p>
              </div>
            </div>

            {/* Quick Stats Pill */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-slate-200">
                إجمالي الورديات المؤرشفة: <strong className="text-emerald-400">{closedShifts.length}</strong>
              </span>
            </div>
          </div>

          {/* 5 KPI Summary Cards for Past Shifts */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <div
              className="p-3.5 rounded-3xl border backdrop-blur-md"
              style={{
                backgroundColor: 'var(--card-bg)',
                borderColor: 'var(--border-color)',
              }}
            >
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="font-bold">عدد الورديات المغلقة</span>
              </div>
              <div className="text-2xl font-black font-mono mt-1 text-slate-100">
                {historyMetrics.totalShifts}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{historyMetrics.totalOrdersCount} فاتورة إجمالية</div>
            </div>

            <div
              className="p-3.5 rounded-3xl border backdrop-blur-md"
              style={{
                backgroundColor: 'var(--card-bg)',
                borderColor: 'var(--border-color)',
              }}
            >
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="font-bold">إجمالي المبيعات (Gross)</span>
              </div>
              <div className="text-2xl font-black font-mono mt-1" style={{ color: 'var(--color-primary)' }}>
                {formatEGP(historyMetrics.totalGross)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">شامل الضرائب والخدمات</div>
            </div>

            <div className="p-3.5 rounded-3xl border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-md">
              <div className="flex items-center justify-between text-emerald-400 mb-1">
                <span className="font-bold">إجمالي النقدية المحصلة</span>
              </div>
              <div className="text-2xl font-black text-emerald-300 font-mono mt-1">
                {formatEGP(historyMetrics.totalCash)}
              </div>
              <div className="text-[10px] text-emerald-500/80 mt-0.5">مقبوضات نقدية بالخزينة</div>
            </div>

            <div className="p-3.5 rounded-3xl border border-sky-500/30 bg-sky-950/20 backdrop-blur-md">
              <div className="flex items-center justify-between text-sky-400 mb-1">
                <span className="font-bold">بطاقات ومحافظ</span>
              </div>
              <div className="text-2xl font-black text-sky-300 font-mono mt-1">
                {formatEGP(historyMetrics.totalCardAndTransfer)}
              </div>
              <div className="text-[10px] text-sky-500/80 mt-0.5">
                {formatEGP(historyMetrics.totalCard)} فيزا / {formatEGP(historyMetrics.totalTransfer)} محفظة
              </div>
            </div>

            <div
              className={`p-3.5 rounded-3xl border backdrop-blur-md col-span-2 lg:col-span-1 ${
                historyMetrics.totalVarianceNet === 0
                  ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                  : historyMetrics.totalVarianceNet < 0
                  ? 'border-rose-500/30 bg-rose-950/20 text-rose-300'
                  : 'border-blue-500/30 bg-blue-950/20 text-blue-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1 opacity-90">
                <span className="font-bold">صافي الفارق (عجز/زيادة)</span>
              </div>
              <div className="text-2xl font-black font-mono mt-1">
                {historyMetrics.totalVarianceNet === 0 ? (
                  '0 ج.م'
                ) : historyMetrics.totalVarianceNet < 0 ? (
                  `-${formatEGP(Math.abs(historyMetrics.totalVarianceNet))}`
                ) : (
                  `+${formatEGP(historyMetrics.totalVarianceNet)}`
                )}
              </div>
              <div className="text-[10px] opacity-80 mt-0.5">
                {historyMetrics.exactCount} مطابق / {historyMetrics.shortageCount} به عجز
              </div>
            </div>
          </div>

          {/* Filter Bar: Date Presets, Dates, Cashier, Search */}
          <div
            className="p-4 rounded-2xl border space-y-3 backdrop-blur-md"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--border-color)',
            }}
          >
            {/* Row 1: Date Quick Presets */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-slate-400 font-bold ml-1">تحديد الفترة:</span>
                {[
                  { id: 'all', label: 'كافة الفترات' },
                  { id: 'today', label: 'اليوم' },
                  { id: 'week', label: 'آخر 7 أيام' },
                  { id: 'month', label: 'هذا الشهر' },
                  { id: 'custom', label: 'مخصص' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setHistoryDatePreset(p.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      historyDatePreset === p.id
                        ? 'text-white shadow-md'
                        : 'border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                    style={
                      historyDatePreset === p.id
                        ? { backgroundColor: 'var(--color-primary)' }
                        : undefined
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Custom Date Pickers */}
              {(historyDatePreset === 'custom' || historyStartDate || historyEndDate) && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-400">من:</span>
                    <input
                      type="date"
                      value={historyStartDate}
                      onChange={(e) => {
                        setHistoryDatePreset('custom');
                        setHistoryStartDate(e.target.value);
                      }}
                      className="border rounded-xl px-2 py-1 text-xs text-slate-200 focus:outline-none"
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        borderColor: 'var(--border-color)',
                      }}
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-400">إلى:</span>
                    <input
                      type="date"
                      value={historyEndDate}
                      onChange={(e) => {
                        setHistoryDatePreset('custom');
                        setHistoryEndDate(e.target.value);
                      }}
                      className="border rounded-xl px-2 py-1 text-xs text-slate-200 focus:outline-none"
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        borderColor: 'var(--border-color)',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Row 2: Search & Cashier Filter */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 border-t border-white/5">
              <div className="relative flex-1 w-full max-w-md">
                <input
                  type="text"
                  placeholder="بحث برقم الوردية (SH-...)، اسم الكاشير، ملاحظات الإغلاق..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderColor: 'var(--border-color)',
                  }}
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={historyCashierFilter}
                  onChange={(e) => setHistoryCashierFilter(e.target.value)}
                  className="border rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none w-full sm:w-auto"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <option value="">جميع الكاشيرين</option>
                  {employees
                    .filter((e) => e.role.includes('كاشير') || e.role.includes('مدير') || e.role.includes('مالك'))
                    .map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.role})
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          {/* Past Shifts Audit Trail Table */}
          <div
            className="border rounded-3xl overflow-hidden shadow-xl backdrop-blur-md"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead
                  className="text-slate-400 border-b"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.35)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <tr>
                    <th className="py-3 px-4 font-semibold">رقم الوردية</th>
                    <th className="py-3 px-4 font-semibold">الكاشير</th>
                    <th className="py-3 px-4 font-semibold">التوقيت والمدة</th>
                    <th className="py-3 px-4 font-semibold text-center">الفواتير</th>
                    <th className="py-3 px-4 font-semibold">إجمالي المبيعات</th>
                    <th className="py-3 px-4 font-semibold">النقدية بالدرج</th>
                    <th className="py-3 px-4 font-semibold">الفارق (عجز/زيادة)</th>
                    <th className="py-3 px-4 font-semibold">نوع الإغلاق</th>
                    <th className="py-3 px-4 font-semibold">الاعتماد</th>
                    <th className="py-3 px-4 font-semibold text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                  {historyLoading ? (
                    <TableSkeletonRows columns={9} rows={5} />
                  ) : closedShifts.length > 0 ? (
                    closedShifts.map((shift) => {
                      const isShortage = shift.variance < 0;
                      const isSurplus = shift.variance > 0;
                      const isExact = shift.variance === 0;

                      return (
                        <tr key={shift.id} className="hover:bg-white/5 transition-colors">
                          {/* Shift Code */}
                          <td className="py-3 px-4 font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                            <div>{shift.shift_code}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {formatDate(shift.shift_end || shift.created_at)}
                            </div>
                          </td>

                          {/* Cashier */}
                          <td className="py-3 px-4 text-slate-200">
                            <div className="font-bold">
                              <span>{shift.cashier_name}</span>
                            </div>
                            <div className="text-[10px] text-slate-400">{shift.cashier_role || 'كاشير'}</div>
                          </td>

                          {/* Timing & Duration */}
                          <td className="py-3 px-4 text-slate-300 font-mono text-[11px]">
                            <div>
                              من: {formatTime(shift.shift_start)}
                            </div>
                            <div>
                              إلى: {formatTime(shift.shift_end)}
                            </div>
                            {shift.duration_formatted && (
                              <div className="text-[10px] text-emerald-400 font-bold">
                                {shift.duration_formatted}
                              </div>
                            )}
                          </td>

                          {/* Invoices Count */}
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-100">
                            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
                              {shift.total_orders}
                            </span>
                          </td>

                          {/* Gross Sales */}
                          <td className="py-3 px-4 font-mono">
                            <div className="font-bold text-sm" style={{ color: 'var(--color-primary)' }}>
                              {formatEGP(shift.gross_sales)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              كاش: {formatEGP(shift.cash_sales)} | إلكتروني: {formatEGP(shift.card_sales + shift.transfer_sales)}
                            </div>
                          </td>

                          {/* Expected vs Actual Cash */}
                          <td className="py-3 px-4 font-mono text-xs">
                            <div className="font-bold text-emerald-400">
                              الفعلي: {formatEGP(shift.actual_cash)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              المتوقع: {formatEGP(shift.expected_cash)}
                            </div>
                          </td>

                          {/* Variance Badge */}
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold font-mono border ${
                                isExact
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                    : isShortage
                                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                    : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                              }`}
                            >
                              {isExact ? (
                                <span>مطابق (0)</span>
                              ) : isShortage ? (
                                <span>عجز {formatEGP(Math.abs(shift.variance))}</span>
                              ) : (
                                <span>زيادة +{formatEGP(shift.variance)}</span>
                              )}
                            </span>
                          </td>

                          {/* End of Day Badge */}
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                shift.is_end_of_day
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                  : 'bg-slate-500/20 text-slate-300 border-slate-500/30'
                              }`}
                            >
                              {shift.is_end_of_day ? 'نهاية اليوم' : 'تسليم وردية'}
                            </span>
                          </td>

                          {/* Approved By */}
                          <td className="py-3 px-4 text-slate-400 text-[11px]">
                            <div className="font-semibold text-slate-200">{shift.approved_by || 'الإدارة'}</div>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* View Details Button */}
                              <button
                                type="button"
                                onClick={() => setSelectedShiftForDetails(shift)}
                                title="عرض تفاصيل الوردية والفواتير والعمال"
                                className="px-2.5 py-1 border text-slate-200 rounded-lg text-xs font-bold transition-colors hover:bg-white/10"
                                style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                  borderColor: 'var(--border-color)',
                                }}
                              >
                                <span>تفاصيل</span>
                              </button>

                              {/* Print Thermal Z-Report Button */}
                              <button
                                type="button"
                                onClick={() => printClosedShiftZReport(shift)}
                                title="إعادة طباعة إيصال Z-Report حراري"
                                className="px-2.5 py-1 border text-slate-300 rounded-lg text-xs font-bold transition-colors hover:bg-white/10"
                                style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                  borderColor: 'var(--border-color)',
                                }}
                              >
                                <span>طباعة</span>
                              </button>

                              {/* Delete Shift Button */}
                              <button
                                type="button"
                                onClick={() => setShiftToDelete(shift)}
                                title="حذف الوردية من الأرشيف"
                                className="px-2.5 py-1 border border-rose-500/20 text-rose-400 bg-rose-950/20 hover:bg-rose-900/40 rounded-lg text-xs font-bold transition-colors"
                              >
                                <span>حذف</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-10">
                        <EmptyState
                          compact
                          title="لا توجد ورديات سابقة مطابقة للفلاتر المحددة"
                          description="تظهر الورديات المقفلة هنا فور إغلاق الكاشير للوردية واعتماد جرد الخزينة (Z-Report)"
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActiveShiftTab;
