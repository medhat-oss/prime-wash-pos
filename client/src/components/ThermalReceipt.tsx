import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Order } from '../types/index.js';
import { formatEGP, formatDateTime, getPaymentMethodLabel } from '../utils/formatters.js';
import {
  printThermalTicket,
  printViaWebSerial,
  printViaWebBluetooth,
  isDirectPrinterSupported,
} from '../utils/thermalPrinter.js';

interface ThermalReceiptProps {
  order: Order | null;
  onClose: () => void;
}

export const ThermalReceipt: React.FC<ThermalReceiptProps> = ({ order, onClose }) => {
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);

  const directSupport = isDirectPrinterSupported();

  useEffect(() => {
    if (!order) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [order]);

  if (!order) return null;

  const qrValue =
    order.eta_share_url ||
    (order.eta_uuid
      ? `https://invoicing.eta.gov.eg/receipts/search/${order.eta_uuid}`
      : `PRIME-WASH-POS-ORDER:${order.order_code}`);

  // Standard 80mm / 58mm browser thermal printing
  const handleThermalPrint = async () => {
    try {
      setIsPrinting(true);
      setPrintStatus('جاري تجهيز أمر الطباعة الحرارية...');
      await printThermalTicket(order, { paperWidth });
      setPrintStatus('تم إرسال أمر الطباعة بنجاح');
    } catch {
      window.print();
    } finally {
      setIsPrinting(false);
      setTimeout(() => setPrintStatus(null), 2500);
    }
  };

  // Direct USB/Serial ESC/POS printing
  const handleSerialPrint = async () => {
    try {
      setIsPrinting(true);
      setPrintStatus('جاري الاتصال بالطابعة التسلسلية (USB/Serial)...');
      await printViaWebSerial(order, { paperWidth });
      setPrintStatus('تمت الطباعة المباشرة بنجاح عبر منفذ USB');
    } catch (err: any) {
      setPrintStatus(`خطأ في الطباعة المباشرة: ${err.message}`);
    } finally {
      setIsPrinting(false);
      setTimeout(() => setPrintStatus(null), 3500);
    }
  };

  // Direct Bluetooth ESC/POS printing
  const handleBluetoothPrint = async () => {
    try {
      setIsPrinting(true);
      setPrintStatus('جاري الاتصال بالطابعة اللاسلكية (Bluetooth)...');
      await printViaWebBluetooth(order, { paperWidth });
      setPrintStatus('تمت الطباعة المباشرة بنجاح عبر البلوتوث');
    } catch (err: any) {
      setPrintStatus(`خطأ في البلوتوث: ${err.message}`);
    } finally {
      setIsPrinting(false);
      setTimeout(() => setPrintStatus(null), 3500);
    }
  };

  const receiptModal = (
    <div className="fixed inset-0 z-[9999] w-screen h-screen flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl p-5 sm:p-6 my-auto z-10 animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
        {/* Header Bar */}
        <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-3 shrink-0">
          <div className="text-emerald-400 font-bold text-sm">
            <span>تم إصدار الفاتورة بنجاح</span>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors font-bold text-sm"
          >
            ✕
          </button>
        </div>

        {/* Paper Size & Direct Options Selector */}
        <div className="flex items-center justify-between gap-2 mb-3 bg-slate-800/60 p-2 rounded-2xl border border-slate-700/50 text-xs shrink-0">
          <div className="text-slate-300 font-semibold">
            <span>مقاس الورق:</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPaperWidth('80mm')}
              className={`px-2.5 py-1 rounded-xl font-bold transition-all ${
                paperWidth === '80mm'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              80 مم (قياسي)
            </button>
            <button
              onClick={() => setPaperWidth('58mm')}
              className={`px-2.5 py-1 rounded-xl font-bold transition-all ${
                paperWidth === '58mm'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              58 مم (مدمج)
            </button>
          </div>
        </div>

        {/* Print Status Feedback Notification */}
        {printStatus && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-center text-slate-200 font-semibold animate-in fade-in shrink-0">
            {printStatus}
          </div>
        )}

        {/* Scrollable Printable 80mm / 58mm Thermal Receipt Preview */}
        <div className="overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700 rounded-2xl">
          <div
            id="printable-thermal-receipt"
            className={`bg-white text-black p-4 sm:p-5 rounded-2xl font-mono shadow-inner select-none transition-all mx-auto ${
              paperWidth === '58mm' ? 'max-w-[280px] text-[10px]' : 'max-w-sm text-xs'
            }`}
          >
            {/* Header */}
            <div className="text-center pb-2.5 border-b border-dashed border-gray-400">
              <div className="text-base font-black tracking-wide">مغسلة برايم واش</div>
              <div className="text-[10px] text-gray-700 font-bold mt-0.5">PRIME WASH CAR CARE</div>
              <div className="text-[11px] font-bold text-gray-800 mt-1">إيصال غسيل سيارة إلكتروني</div>
              <div className="text-[10px] text-gray-500">سجل تجاري / رقم ضريبي: 100-234-567</div>
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
                <div className="flex justify-between font-bold text-sm bg-gray-100 px-2 py-0.5 rounded border border-gray-300 my-1">
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
                  <div className="font-bold">{order.service_name || 'خدمة غسيل سيارة'}</div>
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
              <div className="flex justify-between font-black text-sm pt-1.5 border-t border-gray-300 text-slate-900">
                <span>الإجمالي النهائي:</span>
                <span>{formatEGP(order.total_amount)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 pt-1">
                <span>طريقة الدفع:</span>
                <span className="font-semibold text-gray-700">
                  {getPaymentMethodLabel(order.payment_method)}
                </span>
              </div>
            </div>

            {/* ETA Egyptian Tax Authority Section */}
            {order.eta_uuid && (
              <div className="py-2 border-b border-dashed border-gray-400 text-center space-y-0.5 bg-emerald-50/80 rounded my-1.5 px-2 border border-emerald-300">
                <div className="text-[10px] font-bold text-emerald-800">
                  <span>إيصال معتمد بمصلحة الضرائب المصرية (ETA)</span>
                </div>
                <div className="text-[9px] text-gray-700 font-mono break-all">
                  UUID: <span className="font-bold">{order.eta_uuid}</span>
                </div>
              </div>
            )}

            {/* QR Code Block */}
            <div className="text-center pt-2 pb-1">
              <div className="inline-block p-1 bg-white rounded border border-black mb-1 shadow-sm">
                <QRCodeSVG
                  value={qrValue}
                  size={paperWidth === '58mm' ? 70 : 85}
                  level="M"
                  includeMargin={false}
                  style={{ shapeRendering: 'crispEdges', display: 'block' }}
                />
              </div>
              <div className="text-[9px] text-gray-700">امسح الرمز لمعاينة الإيصال الضريبي المعتمد</div>
              <div className="text-[10px] text-black font-bold mt-1">شكراً لزيارتكم ونسعد بخدمتكم دائماً</div>
              <div className="text-[9px] text-gray-500">Prime Wash POS Live</div>
            </div>
          </div>
        </div>

        {/* Modal Action Buttons Bar */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-col gap-2 shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Primary 80mm/58mm Thermal Print Button */}
            <button
              onClick={handleThermalPrint}
              disabled={isPrinting}
              className="flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white rounded-2xl font-bold text-xs shadow-lg shadow-rose-600/25 active:scale-95 transition-all disabled:opacity-50"
            >
              {isPrinting && (
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />
              )}
              <span>طباعة إيصال حراري ({paperWidth})</span>
            </button>

            {/* Direct USB / Serial Print Button */}
            {directSupport.serial ? (
              <button
                onClick={handleSerialPrint}
                disabled={isPrinting}
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl font-bold text-xs border border-slate-700 active:scale-95 transition-all disabled:opacity-50"
              >
                <span>طباعة USB مباشرة</span>
              </button>
            ) : directSupport.bluetooth ? (
              <button
                onClick={handleBluetoothPrint}
                disabled={isPrinting}
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl font-bold text-xs border border-slate-700 active:scale-95 transition-all disabled:opacity-50"
              >
                <span>طباعة بلوتوث مباشرة</span>
              </button>
            ) : (
              <button
                onClick={() => window.print()}
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl font-bold text-xs border border-slate-700 active:scale-95 transition-all"
              >
                <span>طباعة عامة (Ctrl+P)</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-800/70 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
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
