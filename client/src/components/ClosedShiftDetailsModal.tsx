import React, { useState } from 'react';
import Modal from './Modal.js';
import { ClosedShift, Order } from '../types/index.js';
import { formatEGP, formatDateTime } from '../utils/formatters.js';
import { printClosedShiftZReport } from '../utils/shiftStorage.js';
import ThermalReceipt from './ThermalReceipt.js';

interface ClosedShiftDetailsModalProps {
  shift: ClosedShift | null;
  onClose: () => void;
}

export const ClosedShiftDetailsModal: React.FC<ClosedShiftDetailsModalProps> = ({ shift, onClose }) => {
  const [selectedOrderToPrint, setSelectedOrderToPrint] = useState<Order | null>(null);

  if (!shift) return null;

  const isShortage = shift.variance < 0;
  const isSurplus = shift.variance > 0;
  const isExact = shift.variance === 0;

  return (
    <>
      {selectedOrderToPrint && (
        <ThermalReceipt
          order={selectedOrderToPrint}
          onClose={() => setSelectedOrderToPrint(null)}
        />
      )}

      <Modal
        isOpen={!!shift}
        onClose={onClose}
        title={`سجل وتفاصيل الوردية: ${shift.shift_code}`}
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
                {shift.cashier_name ? shift.cashier_name.charAt(0) : 'ك'}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-black text-white">{shift.cashier_name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30">
                    {shift.cashier_role || 'كاشير'}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${
                      shift.is_end_of_day
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    {shift.is_end_of_day ? 'تقفيل نهاية اليوم بالكامل' : 'تسليم وردية كاشير'}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 mt-1 font-mono flex items-center gap-2 flex-wrap">
                  <span>
                    بداية: <strong className="text-slate-200">{formatDateTime(shift.shift_start)}</strong>
                  </span>
                  <span>|</span>
                  <span>
                    نهاية: <strong className="text-slate-200">{formatDateTime(shift.shift_end)}</strong>
                  </span>
                  {shift.duration_formatted && (
                    <>
                      <span>|</span>
                      <span>
                        المدة: <strong className="text-emerald-400">{shift.duration_formatted}</strong>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => printClosedShiftZReport(shift)}
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
                {formatEGP(shift.gross_sales)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{shift.total_orders} فاتورة</div>
            </div>

            <div className="p-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/20">
              <div className="text-[10px] text-emerald-400 font-bold">
                مبيعات نقدي (كاش)
              </div>
              <div className="text-lg font-black font-mono text-emerald-300 mt-1">
                {formatEGP(shift.cash_sales)}
              </div>
              <div className="text-[10px] text-emerald-500/80 mt-0.5">المتوقع بالدرج</div>
            </div>

            <div className="p-3 rounded-2xl border border-sky-500/30 bg-sky-950/20">
              <div className="text-[10px] text-sky-400 font-bold">
                فيزا وبطاقات
              </div>
              <div className="text-lg font-black font-mono text-sky-300 mt-1">
                {formatEGP(shift.card_sales)}
              </div>
              <div className="text-[10px] text-sky-500/80 mt-0.5">مدفوعات بنكية</div>
            </div>

            <div className="p-3 rounded-2xl border border-purple-500/30 bg-purple-950/20">
              <div className="text-[10px] text-purple-400 font-bold">
                محافظ إلكترونية
              </div>
              <div className="text-lg font-black font-mono text-purple-300 mt-1">
                {formatEGP(shift.transfer_sales)}
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
                  معتمد بواسطة: <strong className="text-slate-200">{shift.approved_by || 'الإدارة'}</strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono">
              <div className="p-2.5 rounded-xl border border-white/5 bg-white/5">
                <div className="text-[10px] text-slate-400">النقدية المتوقعة بالدرج</div>
                <div className="text-sm font-bold text-slate-200 mt-0.5">{formatEGP(shift.expected_cash)}</div>
              </div>

              <div className="p-2.5 rounded-xl border border-white/5 bg-white/5">
                <div className="text-[10px] text-slate-400">النقدية الفعلية المحصورة</div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5">{formatEGP(shift.actual_cash)}</div>
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
                    <span>عجز {formatEGP(Math.abs(shift.variance))}</span>
                  ) : (
                    <span>زيادة +{formatEGP(shift.variance)}</span>
                  )}
                </div>
              </div>
            </div>

            {shift.closing_notes && (
              <div className="p-2.5 rounded-xl border border-white/5 bg-white/5 text-[11px] text-slate-300">
                <span className="font-bold text-amber-400">ملاحظات الإغلاق: </span>
                <span>{shift.closing_notes}</span>
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
                كشف فواتير الوردية ({shift.orders?.length || 0} فاتورة)
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
                  {shift.orders && shift.orders.length > 0 ? (
                    shift.orders.map((o) => (
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
