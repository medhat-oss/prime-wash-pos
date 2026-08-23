import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Check, X, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Order } from '../types/index.js';
import { formatEGP, formatDateTime } from '../utils/formatters.js';

interface ThermalReceiptProps {
  order: Order | null;
  onClose: () => void;
}

export const ThermalReceipt: React.FC<ThermalReceiptProps> = ({ order, onClose }) => {
  useEffect(() => {
    if (!order) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [order]);

  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  const paymentLabels: Record<string, string> = {
    cash: 'نقدي (كاش)',
    card: 'فيزا / بطاقة (Card)',
    transfer: 'تحويل (فودافون كاش / بنكي)',
    split: 'دفع مجزأ',
  };

  const qrValue =
    order.eta_share_url ||
    (order.eta_uuid
      ? `https://invoicing.eta.gov.eg/receipts/search/${order.eta_uuid}`
      : `SMART-CAR-WASH-ORDER:${order.order_code}`);

  const receiptModal = (
    <div className="fixed inset-0 z-[9999] w-screen h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl p-6 my-auto z-10 animate-in zoom-in-95 duration-200">
        {/* Actions Bar */}
        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <Check className="w-4 h-4" />
            تم إصدار الفاتورة بنجاح
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-brand-500/20"
            >
              <Printer className="w-4 h-4" />
              طباعة (Print)
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable 80mm Thermal Receipt Layout */}
        <div
          id="printable-thermal-receipt"
          className="bg-white text-black p-5 rounded-2xl font-mono text-xs shadow-inner select-none"
        >
          {/* Header */}
          <div className="text-center pb-3 border-b border-dashed border-gray-400">
            <div className="text-base font-black tracking-wider">مغسلة السيارات الذكية</div>
            <div className="text-[10px] text-gray-600 mt-0.5">CAR WASH & DETAILING SERVICES</div>
            <div className="text-[11px] font-bold text-gray-800 mt-1">إيصال غسيل سيارة إلكتروني</div>
            <div className="text-[10px] text-gray-500">سجل تجاري / رقم ضريبي: 100234567</div>
          </div>

          {/* Info Block */}
          <div className="py-2.5 border-b border-dashed border-gray-400 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-gray-600">رقم الإيصال:</span>
              <span className="font-bold">{order.order_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">التاريخ والوقت:</span>
              <span>{formatDateTime(order.created_at)}</span>
            </div>
            {order.car_plate && (
              <div className="flex justify-between font-bold text-sm bg-gray-100 px-1.5 py-0.5 rounded">
                <span>رقم اللوحة:</span>
                <span className="tracking-widest">{order.car_plate}</span>
              </div>
            )}
            {order.car_type && (
              <div className="flex justify-between">
                <span className="text-gray-600">نوع المركبة:</span>
                <span>{order.car_type}</span>
              </div>
            )}
            {order.customer_name && (
              <div className="flex justify-between">
                <span className="text-gray-600">العميل:</span>
                <span>{order.customer_name}</span>
              </div>
            )}
            {order.assigned_employee_name && (
              <div className="flex justify-between">
                <span className="text-gray-600">الفني المسؤول:</span>
                <span>{order.assigned_employee_name}</span>
              </div>
            )}
          </div>

          {/* Items Table */}
          <div className="py-2.5 border-b border-dashed border-gray-400">
            <div className="flex justify-between font-bold text-[11px] pb-1 border-b border-gray-200 mb-1.5">
              <span>الخدمة المطلوبة</span>
              <span>السعر</span>
            </div>
            <div className="flex justify-between text-[11px] font-semibold py-1">
              <div>
                <div>{order.service_name || 'خدمة غسيل سيارة'}</div>
                {order.service_egs_code && (
                  <div className="text-[9px] text-gray-500">كود ضريبي: {order.service_egs_code}</div>
                )}
              </div>
              <span>{formatEGP(order.total_amount)}</span>
            </div>
          </div>

          {/* Financials Breakdown */}
          <div className="py-2.5 border-b border-dashed border-gray-400 space-y-1 text-[11px]">
            <div className="flex justify-between text-gray-600">
              <span>المبلغ الأساسي (قبل الضريبة):</span>
              <span>{formatEGP(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>ضريبة القيمة المضافة T1 (14%):</span>
              <span>{formatEGP(order.tax_amount)}</span>
            </div>
            <div className="flex justify-between font-black text-sm pt-1.5 border-t border-gray-300">
              <span>الإجمالي النهائي:</span>
              <span>{formatEGP(order.total_amount)}</span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 pt-1">
              <span>طريقة الدفع:</span>
              <span className="font-semibold text-gray-700">{paymentLabels[order.payment_method] || order.payment_method}</span>
            </div>
          </div>

          {/* ETA Egyptian Tax Authority Section */}
          {order.eta_uuid && (
            <div className="py-2 border-b border-dashed border-gray-400 text-center space-y-0.5 bg-gray-50/80 rounded my-1.5 px-2">
              <div className="text-[10px] font-bold text-gray-800 flex items-center justify-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>إيصال معتمد بمصلحة الضرائب المصرية (ETA)</span>
              </div>
              <div className="text-[9px] text-gray-600 font-mono break-all">
                UUID: <span className="font-bold text-gray-900">{order.eta_uuid}</span>
              </div>
              {order.eta_submission_id && (
                <div className="text-[8px] text-gray-500 font-mono">
                  Ref: {order.eta_submission_id}
                </div>
              )}
            </div>
          )}

          {/* QR Code Block */}
          <div className="text-center pt-2 pb-1">
            <div className="inline-block p-1.5 bg-white rounded border border-gray-300 mb-1 shadow-sm">
              <QRCodeSVG
                value={qrValue}
                size={85}
                level="M"
                includeMargin={false}
              />
            </div>
            <div className="text-[9px] text-gray-500">
              امسح الرمز لمعاينة الإيصال الضريبي المعتمد
            </div>
            <div className="text-[10px] text-gray-700 font-bold mt-1">
              شكراً لزيارتكم ونسعد بخدمتكم دائماً
            </div>
            <div className="text-[9px] text-gray-400">نظافة سيارتك بأعلى جودة</div>
          </div>
        </div>


        {/* Modal Footer Button */}
        <div className="mt-4 text-center">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-semibold transition-colors"
          >
            إغلاق ومتابعة (Done)
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(receiptModal, document.body);
};

export default ThermalReceipt;
