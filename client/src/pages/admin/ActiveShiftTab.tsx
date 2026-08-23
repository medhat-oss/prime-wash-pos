import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  UserCheck,
  User,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  Car,
  Coins,
  CreditCard,
  Smartphone,
  Printer,
  RotateCcw,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { posApi, hrApi } from '../../api/client.js';
import { Order, Employee } from '../../types/index.js';
import { FALLBACK_EMPLOYEES } from '../../api/mockFallbacks.js';
import { useToast } from '../../components/Toast.js';
import ThermalReceipt from '../../components/ThermalReceipt.js';
import ShiftCloseModal from '../../components/ShiftCloseModal.js';
import Modal from '../../components/Modal.js';
import { formatEGP, formatDateTime } from '../../utils/formatters.js';
import { getStoredShiftOrders, getStoredAllOrders } from '../../utils/orderStorage.js';
import { EmptyState } from '../../components/ui/EmptyState.js';


export const ActiveShiftTab: React.FC = () => {
  const toast = useToast();

  // Active Cashier Session (reads from localStorage, with switcher capability)
  const [activeCashier, setActiveCashier] = useState<{
    id: string;
    name: string;
    role: string;
    shift_start: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('pos_active_cashier');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [employees, setEmployees] = useState<Employee[]>(FALLBACK_EMPLOYEES);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');

  // Modals
  const [selectedOrderToPrint, setSelectedOrderToPrint] = useState<Order | null>(null);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [isShiftCloseOpen, setIsShiftCloseOpen] = useState(false);

  // Fetch employees and shift orders
  const fetchData = async () => {
    try {
      setLoading(true);
      const [empList, apiOrders] = await Promise.all([
        hrApi.getEmployees('active').catch(() => FALLBACK_EMPLOYEES),
        posApi.getOrders({ limit: 500 }, true).catch(() => []),
      ]);
      const validEmp = Array.isArray(empList) && empList.length > 0 ? empList : FALLBACK_EMPLOYEES;
      setEmployees(validEmp);

      // Get stored shift orders from local storage
      const storedShiftOrders = getStoredShiftOrders(activeCashier?.shift_start);

      // Combine / deduplicate orders
      const combined = [...storedShiftOrders];
      (Array.isArray(apiOrders) ? apiOrders : []).forEach((o) => {
        if (!combined.some((c) => c.id === o.id || c.order_code === o.order_code)) {
          if (activeCashier?.shift_start) {
            const shiftStart = new Date(activeCashier.shift_start);
            if (new Date(o.created_at) >= shiftStart) combined.push(o);
          } else {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            if (new Date(o.created_at) >= todayStart) combined.push(o);
          }
        }
      });

      setOrders(combined);
    } catch (err: any) {
      toast.error(err.message, 'تعذر تحميل بيانات الوردية الحالية');
      setEmployees(FALLBACK_EMPLOYEES);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };



  useEffect(() => {
    fetchData();
  }, [activeCashier?.shift_start]);

  // Elapsed Shift Duration Timer
  const elapsedDuration = useMemo(() => {
    if (!activeCashier?.shift_start) return '0 دقيقة';
    const diffMs = Math.max(new Date().getTime() - new Date(activeCashier.shift_start).getTime(), 0);
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} دقيقة`;
    return `${hours} ساعة و ${minutes} دقيقة`;
  }, [activeCashier?.shift_start]);

  // Shift KPI Metrics
  const metrics = useMemo(() => {
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
      else if (o.payment_method === 'transfer') transferTotal += amt;
    });

    return {
      grossTotal,
      cashTotal,
      cardTotal,
      transferTotal,
      validCount,
      cancelledCount,
      totalOrders: orders.length,
    };
  }, [orders]);

  // Handle Cancel / Refund Order
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
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'تعذر إلغاء الفاتورة', 'فشل الاسترجاع');
    } finally {
      setIsCancelling(false);
    }
  };

  // Filtered Orders for Table
  const filteredOrders = orders.filter((o) => {
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
          fetchData();
        }}
      />

      {/* Order Cancel & Refund Modal */}
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
            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
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
                className="flex items-center justify-center gap-1.5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
              >
                {isCancelling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                <span>تأكيد الإلغاء والاسترجاع</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Header & Active Cashier Profile Banner */}
      <div
        className="p-5 rounded-3xl border shadow-xl backdrop-blur-md flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex items-center gap-3.5">
          <div
            className="w-12 h-12 rounded-2xl border flex items-center justify-center shadow-inner shrink-0"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderColor: 'var(--border-color)',
              color: 'var(--color-primary)',
            }}
          >
            <Clock className="w-6 h-6" />
          </div>

          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>وردية الكاشير الحالية (Active Cashier Shift)</span>
              </h2>

              {activeCashier ? (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>الوردية نشطة: {activeCashier.name}</span>
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
                'لا توجد جلسة كاشير مسجلة حالياً في هذا المتصفح - يتم عرض كافة فواتير اليوم'
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
              <Coins className="w-4 h-4" />
              <span>تقفيل الوردية وجرد الخزينة (Z-Report)</span>
            </button>
          )}

          <button
            onClick={fetchData}
            title="تحديث مبيعات الوردية"
            className="flex items-center gap-1.5 px-3 py-2.5 border text-slate-300 rounded-xl text-xs font-semibold backdrop-blur-md transition-all hover:bg-white/5"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'var(--border-color)',
            }}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              style={{ color: 'var(--color-primary)' }}
            />
            <span>تحديث</span>
          </button>
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
            <DollarSign className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
          </div>
          <div className="text-2xl font-black font-mono mt-1" style={{ color: 'var(--color-primary)' }}>
            {formatEGP(metrics.grossTotal)}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {metrics.validCount} فاتورة مؤكدة
          </div>
        </div>

        <div className="p-4 rounded-3xl border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-md">
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="font-bold">النقدية بالدرج (كاش)</span>
            <Coins className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
            {formatEGP(metrics.cashTotal)}
          </div>
          <div className="text-[10px] text-emerald-500/80 mt-1">المبلغ الفعلي المفترض بالخزينة</div>
        </div>

        <div className="p-4 rounded-3xl border border-sky-500/30 bg-sky-950/20 backdrop-blur-md">
          <div className="flex items-center justify-between text-sky-400 mb-1">
            <span className="font-bold">بطاقات وفيزا POS</span>
            <CreditCard className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-black text-sky-300 font-mono mt-1">
            {formatEGP(metrics.cardTotal)}
          </div>
          <div className="text-[10px] text-sky-500/80 mt-1">المدفوعات الإلكترونية البنكية</div>
        </div>

        <div className="p-4 rounded-3xl border border-purple-500/30 bg-purple-950/20 backdrop-blur-md">
          <div className="flex items-center justify-between text-purple-400 mb-1">
            <span className="font-bold">محافظ إلكترونية / تحويل</span>
            <Smartphone className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-purple-300 font-mono mt-1">
            {formatEGP(metrics.transferTotal)}
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
          <Search className="w-4 h-4 text-slate-500 absolute right-3 top-3" />
          <input
            type="text"
            placeholder="بحث في وردية اليوم برقم الفاتورة، العميل، نوع الغسيل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded-xl pr-9 pl-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
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
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                      {order.order_code}
                    </td>

                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(order.created_at).toLocaleTimeString('ar-EG', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
                          className="p-1.5 border text-slate-300 rounded-lg transition-colors hover:bg-white/10"
                          style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            borderColor: 'var(--border-color)',
                          }}
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        {/* Cancel / Refund Order Button */}
                        {order.status !== 'cancelled' && (
                          <button
                            onClick={() => setOrderToCancel(order)}
                            title="إلغاء واسترجاع الفاتورة وإعادة المواد للمخزن فورياً"
                            className="p-1.5 border border-rose-500/30 text-rose-400 bg-rose-950/30 hover:bg-rose-900/50 rounded-lg transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
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
                      icon={<Clock className="w-6 h-6 opacity-70" />}
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
  );
};

export default ActiveShiftTab;
