import React, { useState, useEffect } from 'react';
import Modal from './Modal.js';
import { ClosedShift, Order } from '../types/index.js';
import { formatEGP, formatDateTime } from '../utils/formatters.js';
import { printClosedShiftZReport } from '../utils/shiftStorage.js';
import { posApi } from '../api/client.js';
import { useToast } from './Toast.js';
import ThermalReceipt from './ThermalReceipt.js';

interface ClosedShiftDetailsModalProps {
  shift: ClosedShift | null;
  onClose: () => void;
  onShiftUpdated?: (updatedShift: ClosedShift) => void;
}

export const ClosedShiftDetailsModal: React.FC<ClosedShiftDetailsModalProps> = ({
  shift: initialShift,
  onClose,
  onShiftUpdated,
}) => {
  const toast = useToast();
  const [currentShift, setCurrentShift] = useState<ClosedShift | null>(initialShift);
  const [selectedOrderToPrint, setSelectedOrderToPrint] = useState<Order | null>(null);

  // Edit actual cash state
  const [isEditingCash, setIsEditingCash] = useState(false);
  const [editedCashAmount, setEditedCashAmount] = useState<string>('');
  const [editedCashNotes, setEditedCashNotes] = useState<string>('');
  const [isSavingCash, setIsSavingCash] = useState(false);

  useEffect(() => {
    setCurrentShift(initialShift);
    if (initialShift) {
      setEditedCashAmount(String(initialShift.actual_cash ?? ''));
      setEditedCashNotes('');
      setIsEditingCash(false);
    }
  }, [initialShift]);

  if (!currentShift) return null;

  const isShortage = currentShift.variance < 0;
  const isSurplus = currentShift.variance > 0;
  const isExact = currentShift.variance === 0;

  // Real-time preview of variance when typing in edit mode
  const previewActual = editedCashAmount === '' ? null : Number(editedCashAmount);
  const previewVariance =
    previewActual !== null
      ? Number((previewActual - Number(currentShift.expected_cash || 0)).toFixed(2))
      : null;

  const handleSaveActualCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editedCashAmount === '' || isNaN(Number(editedCashAmount))) {
      toast.warning('يرجى إدخال مبلغ النقدية الفعلي بدقة');
      return;
    }

    try {
      setIsSavingCash(true);
      const updated = await posApi.updateShiftActualCash(
        currentShift.id,
        Number(editedCashAmount),
        editedCashNotes.trim() || undefined
      );

      // Preserve existing loaded orders inside the updated shift object
      const mergedShift: ClosedShift = {
        ...updated,
        orders: currentShift.orders || updated.orders || [],
      };

      setCurrentShift(mergedShift);
      setIsEditingCash(false);
      toast.success('تم تعديل النقدية الفعلية وإعادة احتساب الفارق بنجاح!', 'تم الحفظ');

      if (onShiftUpdated) {
        onShiftUpdated(mergedShift);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cw_shifts_updated', { detail: mergedShift }));
        window.dispatchEvent(new Event('cw_shifts_updated'));
        window.dispatchEvent(new Event('storage'));
      }
    } catch (err: any) {
      toast.error(err.message || 'تعذر حفظ تعديل النقدية');
    } finally {
      setIsSavingCash(false);
    }
  };

  return (
    <>
      {selectedOrderToPrint && (
        <ThermalReceipt
          order={selectedOrderToPrint}
          onClose={() => setSelectedOrderToPrint(null)}
        />
      )}

      <Modal
        isOpen={!!currentShift}
        onClose={onClose}
        title={`سجل وتفاصيل الوردية: ${currentShift.shift_code}`}
        maxWidth="3xl"
      >
        <div className="space-y-5 text-xs max-h-[82vh] overflow-y-auto pr-1">
          {/* Header Banner */}
          <div
            className="p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 backdrop-blur-md"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-2xl border flex items-center justify-center font-black shrink-0 shadow-inner text-sm"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--color-primary)',
                }}
              >
                {currentShift.cashier_name ? currentShift.cashier_name.charAt(0) : 'ك'}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-black text-white">{currentShift.cashier_name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30">
                    {currentShift.cashier_role || 'كاشير'}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${
                      currentShift.is_end_of_day
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    {currentShift.is_end_of_day ? 'تقفيل نهاية اليوم بالكامل' : 'تسليم وردية كاشير'}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 mt-1 font-mono flex items-center gap-2 flex-wrap">
                  <span>
                    بداية: <strong className="text-slate-200">{formatDateTime(currentShift.shift_start)}</strong>
                  </span>
                  <span>|</span>
                  <span>
                    نهاية: <strong className="text-slate-200">{formatDateTime(currentShift.shift_end)}</strong>
                  </span>
                  {currentShift.duration_formatted && (
                    <>
                      <span>|</span>
                      <span>
                        المدة: <strong className="text-emerald-400">{currentShift.duration_formatted}</strong>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => printClosedShiftZReport(currentShift)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-white rounded-xl text-xs font-bold shadow-lg transition-all hover:brightness-110 active:scale-95"
                style={{
                  backgroundColor: 'var(--color-primary)',
                }}
              >
                <span>طباعة تقرير Z-Report</span>
              </button>
            </div>
          </div>

          {/* Financial Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div
              className="p-3 rounded-2xl border"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                borderColor: 'var(--border-color)',
              }}
            >
              <div className="text-[10px] text-slate-400 font-bold">
                إجمالي المبيعات
              </div>
              <div className="text-lg font-black font-mono mt-1" style={{ color: 'var(--color-primary)' }}>
                {formatEGP(currentShift.gross_sales)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{currentShift.total_orders} فاتورة</div>
            </div>

            <div className="p-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/20">
              <div className="text-[10px] text-emerald-400 font-bold">
                مبيعات نقدي (كاش)
              </div>
              <div className="text-lg font-black font-mono text-emerald-300 mt-1">
                {formatEGP(currentShift.cash_sales)}
              </div>
              <div className="text-[10px] text-emerald-500/80 mt-0.5">المتوقع بالدرج</div>
            </div>

            <div className="p-3 rounded-2xl border border-sky-500/30 bg-sky-950/20">
              <div className="text-[10px] text-sky-400 font-bold">
                فيزا وبطاقات
              </div>
              <div className="text-lg font-black font-mono text-sky-300 mt-1">
                {formatEGP(currentShift.card_sales)}
              </div>
              <div className="text-[10px] text-sky-500/80 mt-0.5">مدفوعات بنكية</div>
            </div>

            <div className="p-3 rounded-2xl border border-purple-500/30 bg-purple-950/20">
              <div className="text-[10px] text-purple-400 font-bold">
                محافظ إلكترونية
              </div>
              <div className="text-lg font-black font-mono text-purple-300 mt-1">
                {formatEGP(currentShift.transfer_sales)}
              </div>
              <div className="text-[10px] text-purple-500/80 mt-0.5">إنستاباي / فودافون</div>
            </div>
          </div>

          {/* Drawer Audit & Variance Details Box */}
          <div
            className="p-4 rounded-2xl border space-y-3"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-200">
                جرد الخزينة والنقدية عند الإغلاق
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400">
                  معتمد بواسطة: <strong className="text-slate-200">{currentShift.approved_by || 'الإدارة'}</strong>
                </span>
                {!isEditingCash && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditedCashAmount(String(currentShift.actual_cash ?? ''));
                      setEditedCashNotes(currentShift.closing_notes || '');
                      setIsEditingCash(true);
                    }}
                    className="mr-2 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-all flex items-center gap-1"
                    title="تعديل النقدية الفعلية للوردية"
                  >
                    <span>✏️ تعديل النقدية</span>
                  </button>
                )}
              </div>
            </div>

            {isEditingCash ? (
              <form onSubmit={handleSaveActualCash} className="p-3 rounded-xl border border-amber-500/30 bg-amber-950/20 space-y-3 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300">
                    تعديل النقدية الفعلية المحصورة بالدرج
                  </span>
                  <span className="text-[10px] text-slate-400">
                    المتوقع: <strong className="font-mono text-slate-200">{formatEGP(currentShift.expected_cash)}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1">
                      النقدية الفعلية (ج.م) *
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      required
                      value={editedCashAmount}
                      onChange={(e) => setEditedCashAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-lg bg-black/40 border border-slate-700 text-white font-mono text-sm focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1">
                      ملاحظات أو سبب التعديل
                    </label>
                    <input
                      type="text"
                      value={editedCashNotes}
                      onChange={(e) => setEditedCashNotes(e.target.value)}
                      placeholder="مثال: تصحيح عجز الإغلاق التلقائي"
                      className="w-full px-3 py-2 rounded-lg bg-black/40 border border-slate-700 text-white text-xs focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {previewVariance !== null && (
                  <div className="text-[11px] p-2 rounded-lg bg-black/30 border border-white/5 flex items-center justify-between font-mono">
                    <span className="text-slate-400">الفارق المحتسب فورياً:</span>
                    <span className={previewVariance === 0 ? 'text-emerald-400 font-bold' : previewVariance < 0 ? 'text-rose-400 font-bold' : 'text-blue-400 font-bold'}>
                      {previewVariance === 0 ? 'مطابق تماماً (0 ج.م)' : previewVariance < 0 ? `عجز ${formatEGP(Math.abs(previewVariance))}` : `زيادة +${formatEGP(previewVariance)}`}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isSavingCash}
                    onClick={() => setIsEditingCash(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-white/5 text-xs font-bold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCash}
                    className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-black shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSavingCash ? 'جارٍ الحفظ...' : 'حفظ التعديل'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono">
                <div className="p-2.5 rounded-xl border border-white/5 bg-white/5">
                  <div className="text-[10px] text-slate-400">النقدية المتوقعة بالدرج</div>
                  <div className="text-sm font-bold text-slate-200 mt-0.5">{formatEGP(currentShift.expected_cash)}</div>
                </div>

                <div className="p-2.5 rounded-xl border border-white/5 bg-white/5">
                  <div className="text-[10px] text-slate-400">النقدية الفعلية المحصورة</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">{formatEGP(currentShift.actual_cash)}</div>
                </div>

                <div
                  className={`p-2.5 rounded-xl border ${
                    isExact
                      ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
                      : isShortage
                      ? 'border-rose-500/30 bg-rose-950/30 text-rose-300'
                      : 'border-blue-500/30 bg-blue-950/30 text-blue-300'
                  }`}
                >
                  <div className="text-[10px] opacity-80">الفارق (عجز / زيادة)</div>
                  <div className="text-sm font-black mt-0.5">
                    {isExact ? (
                      <span>مطابق تماماً (0 ج.م)</span>
                    ) : isShortage ? (
                      <span>عجز {formatEGP(Math.abs(currentShift.variance))}</span>
                    ) : (
                      <span>زيادة +{formatEGP(currentShift.variance)}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {currentShift.closing_notes && (
              <div className="p-2.5 rounded-xl border border-white/5 bg-white/5 text-[11px] text-slate-300">
                <span className="font-bold text-amber-400">ملاحظات الإغلاق: </span>
                <span>{currentShift.closing_notes}</span>
              </div>
            )}
          </div>

          {/* Shift Invoices Table */}
          <div
            className="border rounded-2xl overflow-hidden"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
              <div className="font-bold text-slate-200 text-xs">
                كشف فواتير الوردية ({currentShift.orders?.length || 0} فاتورة)
              </div>
            </div>

            <div className="overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-right text-[11px]">
                <thead
                  className="text-slate-400 border-b sticky top-0 bg-slate-900"
                  style={{
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <tr>
                    <th className="py-2 px-3 font-semibold">رقم الفاتورة</th>
                    <th className="py-2 px-3 font-semibold">الوقت</th>
                    <th className="py-2 px-3 font-semibold">العميل</th>
                    <th className="py-2 px-3 font-semibold">الخدمة</th>
                    <th className="py-2 px-3 font-semibold">طريقة الدفع</th>
                    <th className="py-2 px-3 font-semibold">الفني المسؤول</th>
                    <th className="py-2 px-3 font-semibold">المبلغ</th>
                    <th className="py-2 px-3 font-semibold text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                  {currentShift.orders && currentShift.orders.length > 0 ? (
                    currentShift.orders.map((o) => (
                      <tr key={o.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-2 px-3 font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                          {o.order_code}
                        </td>
                        <td className="py-2 px-3 text-slate-400 font-mono text-[10px]">
                          {new Date(o.created_at).toLocaleTimeString('ar-EG', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-2 px-3 text-slate-300">{o.customer_name || 'عميل نقدي'}</td>
                        <td className="py-2 px-3 text-slate-200">{o.service_name}</td>
                        <td className="py-2 px-3 text-slate-400">
                          {o.payment_method === 'cash'
                            ? 'كاش'
                            : o.payment_method === 'card'
                            ? 'فيزا'
                            : 'محفظة'}
                        </td>
                        <td className="py-2 px-3 text-slate-400">{o.assigned_employee_name || 'عام'}</td>
                        <td className="py-2 px-3 font-mono font-bold text-emerald-400">
                          {formatEGP(o.total_amount)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedOrderToPrint(o)}
                            title="طباعة إيصال الفاتورة"
                            className="px-2.5 py-1 border text-slate-300 rounded-lg hover:bg-white/10 transition-colors font-bold text-[10px]"
                            style={{
                              borderColor: 'var(--border-color)',
                            }}
                          >
                            طباعة
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-slate-500">
                        لا توجد فواتير تفصيلية محفوظة لهذه الوردية
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border rounded-xl text-slate-300 hover:text-white font-bold transition-all hover:bg-white/5"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderColor: 'var(--border-color)',
              }}
            >
              إغلاق
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default ClosedShiftDetailsModal;
