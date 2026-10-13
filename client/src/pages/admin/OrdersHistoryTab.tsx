import React, { useState, useEffect, useMemo } from 'react';
import { posApi, taxApi } from '../../api/client.js';
import { Order } from '../../types/index.js';
import { useToast } from '../../components/Toast.js';
import ThermalReceipt from '../../components/ThermalReceipt.js';
import Modal from '../../components/Modal.js';
import { formatEGP, formatDateTime } from '../../utils/formatters.js';
import { EmptyState, TableSkeletonRows, ErrorState } from '../../components/ui/index.js';


export const OrdersHistoryTab: React.FC = () => {
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOrderToPrint, setSelectedOrderToPrint] = useState<Order | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  // Cancellation Modal State
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const data = await posApi.getOrders({
        status: statusFilter || undefined,
      }, true).catch(() => []);
      setOrders(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.message, 'تعذر تحميل سجل الفواتير');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };


  const handleSyncOrder = async (orderId: string) => {
    try {
      setSyncingOrderId(orderId);
      const res = await taxApi.syncOrder(orderId);
      if (res.success) {
        toast.success('تم إرسال وتوثيق الفاتورة لدى مصلحة الضرائب بنجاح!');
        fetchOrders();
      } else {
        toast.warning(res.message || 'تمت محاولة الإرسال ولكن الإيصال لم يعتمد بعد');
        fetchOrders();
      }
    } catch (err: any) {
      toast.error(err.message, 'تعذر إرسال الفاتورة لمنظومة الضرائب');
    } finally {
      setSyncingOrderId(null);
    }
  };

  const handleConfirmCancelOrder = async () => {
    if (!orderToCancel) return;

    try {
      setIsCancelling(true);
      const res = await posApi.cancelOrder(orderToCancel.id, cancelReason.trim() || undefined);
      toast.success(
        `تم إلغاء الفاتورة (${orderToCancel.order_code}) واسترجاع أرصدة المواد الخام إلى المخزن بنجاح!`,
        'تم استرجاع الطلب'
      );
      setOrderToCancel(null);
      setCancelReason('');
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message || 'تعذر إلغاء واسترجاع الفاتورة', 'فشل الإلغاء');
    } finally {
      setIsCancelling(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    fetchOrders();

    let debounceTimer: any = null;
    const handleUpdates = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchOrders();
      }, 400);
    };

    window.addEventListener('cw_orders_updated', handleUpdates);
    window.addEventListener('cw_tax_settings_updated', handleUpdates);
    window.addEventListener('cw_shifts_updated', handleUpdates);
    window.addEventListener('storage', handleUpdates);

    return () => {
      clearTimeout(debounceTimer);
      window.removeEventListener('cw_orders_updated', handleUpdates);
      window.removeEventListener('cw_tax_settings_updated', handleUpdates);
      window.removeEventListener('cw_shifts_updated', handleUpdates);
      window.removeEventListener('storage', handleUpdates);
    };
  }, [statusFilter]);

  const filteredOrders = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return orders || [];
    return (orders || []).filter((o) => {
      return (
        (o.order_code || '').toLowerCase().includes(s) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(s)) ||
        (o.customer_phone && o.customer_phone.includes(s)) ||
        (o.service_name && o.service_name.toLowerCase().includes(s)) ||
        (o.eta_uuid && o.eta_uuid.toLowerCase().includes(s))
      );
    });
  }, [orders, search]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, currentPage]);


  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Receipt Modal */}
      {selectedOrderToPrint && (
        <ThermalReceipt
          order={selectedOrderToPrint}
          onClose={() => setSelectedOrderToPrint(null)}
        />
      )}

      {/* Cancellation Confirmation Modal */}
      {orderToCancel && (
        <Modal
          isOpen={!!orderToCancel}
          onClose={() => {
            if (!isCancelling) setOrderToCancel(null);
          }}
          title="إلغاء واسترجاع الفاتورة وإعادة المخزون"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200">
              <div className="space-y-1">
                <div className="font-bold text-sm text-rose-300">تأكيد عملية الاسترجاع والإلغاء</div>
                <p>
                  سيتم تغيير حالة الفاتورة إلى <strong>ملغاة</strong>، واسترجاع كافة كميات المواد الخام
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
                <span className="text-slate-500">رقم الفاتورة:</span>
                <span className="font-bold text-slate-100">{orderToCancel.order_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الخدمة المنفذة:</span>
                <span className="font-bold text-slate-100">{orderToCancel.service_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">المبلغ الإجمالي:</span>
                <span className="font-bold text-emerald-400">{formatEGP(orderToCancel.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">اسم العميل:</span>
                <span>{orderToCancel.customer_name || 'عميل نقدي'}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                سبب الإلغاء أو الاسترجاع (اختياري)
              </label>
              <input
                type="text"
                placeholder="مثال: طلب العميل إلغاء الغسلة / خطأ في اختيار الخدمة..."
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
                onClick={handleConfirmCancelOrder}
                disabled={isCancelling}
                className="flex items-center justify-center gap-1.5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
              >
                {isCancelling ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />
                ) : null}
                <span>تأكيد الإلغاء والاسترجاع</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white">
            سجل وأرشيف الفاتورات والطلبات (Orders History)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            استعراض كافة عمليات الغسيل، متابعة حالة التوثيق الضريبي (ETA)، استرجاع وإلغاء الطلبات، وطباعة الإيصالات
          </p>
        </div>

        <button
          onClick={fetchOrders}
          className="px-3.5 py-2 border text-slate-300 rounded-xl text-xs font-semibold backdrop-blur-md transition-all hover:bg-white/5"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          {loading ? 'جاري التحميل...' : 'تحديث السجل'}
        </button>
      </div>

      {/* Filter and Search Bar */}
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
            placeholder="بحث برقم الفاتورة، اسم العميل، رقم الهاتف، نوع الغسيل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            <option value="">جميع الحالات</option>
            <option value="completed">مكتملة</option>
            <option value="in_progress">قيد الغسيل</option>
            <option value="cancelled">ملغاة ومسترجعة</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
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
                <th className="py-3 px-4 font-semibold">التاريخ والوقت</th>
                <th className="py-3 px-4 font-semibold">العميل</th>
                <th className="py-3 px-4 font-semibold">نوع الغسيل</th>
                <th className="py-3 px-4 font-semibold">المبلغ</th>
                <th className="py-3 px-4 font-semibold">طريقة الدفع</th>
                <th className="py-3 px-4 font-semibold">الحالة</th>
                <th className="py-3 px-4 font-semibold">الضرائب (ETA)</th>
                <th className="py-3 px-4 font-semibold text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {loading ? (
                <TableSkeletonRows columns={9} rows={8} />
              ) : paginatedOrders.length > 0 ? (
                paginatedOrders.map((order) => {
                  return (
                    <tr key={order.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                        {order.order_code}
                      </td>

                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {formatDateTime(order.created_at)}
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
                        {order.service_egs_code && (
                          <div className="text-[9px] font-mono text-teal-400/80">
                            {order.service_egs_code}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                        {formatEGP(order.total_amount)}
                      </td>

                      <td className="py-3 px-4 text-slate-300">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                            order.payment_method === 'cash'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : order.payment_method === 'card'
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                              : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                          }`}
                        >
                          {order.payment_method === 'cash'
                            ? 'كاش (نقدي)'
                            : order.payment_method === 'card'
                            ? 'فيزا / بطاقة'
                            : 'تحويل / محفظة'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                            order.status === 'completed'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : order.status === 'in_progress'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {order.status === 'completed'
                            ? 'مكتملة'
                            : order.status === 'in_progress'
                            ? 'قيد الغسيل'
                            : 'ملغاة ومسترجعة'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {order.eta_status === 'valid' || order.eta_status === 'submitted' || (order as any).is_synced || Boolean(order.eta_uuid) ? (
                            <>
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-sans">
                                معتمدة بالضرائب
                              </span>
                              {order.eta_share_url && (
                                <a
                                  href={order.eta_share_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="معاينة إيصال الضرائب الرسمي"
                                  className="px-2 py-0.5 text-[10px] font-bold border border-emerald-500/30 text-emerald-400 rounded hover:bg-emerald-500/10 font-sans"
                                >
                                  عرض
                                </a>
                              )}
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSyncOrder(order.id)}
                              disabled={syncingOrderId === order.id}
                              className="px-2 py-0.5 rounded text-[10px] font-bold border border-amber-500/30 text-amber-300 hover:bg-amber-900/30 transition-colors disabled:opacity-50"
                            >
                              {syncingOrderId === order.id ? 'جاري الإرسال...' : 'إرسال للضرائب'}
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Print Receipt Button */}
                          <button
                            onClick={() => setSelectedOrderToPrint(order)}
                            title="إعادة طباعة الإيصال الحراري"
                            className="px-2.5 py-1 text-xs font-bold border text-slate-300 rounded-lg transition-colors hover:bg-white/10"
                            style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              borderColor: 'var(--border-color)',
                            }}
                          >
                            طباعة
                          </button>

                          {/* Cancel / Refund Order Button */}
                          {order.status !== 'cancelled' && (
                            <button
                              onClick={() => setOrderToCancel(order)}
                              title="إلغاء واسترجاع الفاتورة وإعادة المخزون"
                              className="px-2.5 py-1 text-xs font-bold border border-rose-500/30 text-rose-400 bg-rose-950/30 hover:bg-rose-900/50 rounded-lg transition-colors"
                            >
                              إلغاء
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-8">
                    <EmptyState
                      compact
                      title={search || statusFilter ? 'لا توجد فواتير مطابقة لخيارات البحث' : 'لا توجد فواتير مسجلة في الأرشيف'}
                      description={search || statusFilter ? 'جرب تغيير نص البحث أو اختيار جميع الحالات' : 'تظهر هنا جميع فواتير الغسيل المكتملة وعمليات الدفع'}
                    />
                  </td>
                </tr>
              )}

            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        {totalPages > 1 && (
          <div
            className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t text-xs"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="text-slate-400 font-medium">
              عرض{' '}
              <strong className="text-slate-200 font-bold">
                {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, filteredOrders.length)}
              </strong>{' '}
              من إجمالي <strong className="text-slate-200 font-bold">{filteredOrders.length}</strong> فاتورة
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                &larr; الصفحة السابقة
              </button>

              <span className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-200 font-mono font-bold">
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                الصفحة التالية &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrdersHistoryTab;
