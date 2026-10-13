import React, { useState, useEffect } from 'react';
import { Service, Employee, TaxSettings } from '../../types/index.js';
import { formatEGP, calculateTaxBreakdown } from '../../utils/formatters.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { getStoredTaxSettings, TAX_SETTINGS_UPDATED_EVENT } from '../../utils/taxStorage.js';

interface OrderSummaryProps {
  selectedService: Service | null;
  employees: Employee[];
  customerName: string;
  setCustomerName: (val: string) => void;
  customerPhone: string;
  setCustomerPhone: (val: string) => void;
  assignedEmployeeId: string;
  setAssignedEmployeeId: (val: string) => void;
  paymentMethod: 'cash' | 'card' | 'transfer';
  setPaymentMethod: (val: 'cash' | 'card' | 'transfer') => void;
  notes: string;
  setNotes: (val: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export const OrderSummary: React.FC<OrderSummaryProps> = ({
  selectedService,
  employees,
  customerName,
  setCustomerName,
  customerPhone,
  setCustomerPhone,
  assignedEmployeeId,
  setAssignedEmployeeId,
  paymentMethod,
  setPaymentMethod,
  notes,
  setNotes,
  onSubmit,
  isSubmitting,
}) => {
  const [showExtraDetails, setShowExtraDetails] = useState(false);
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(() => getStoredTaxSettings());

  useEffect(() => {
    const handleTaxUpdate = (e: any) => {
      if (e.detail) {
        setTaxSettings(e.detail);
      } else {
        setTaxSettings(getStoredTaxSettings());
      }
    };
    window.addEventListener(TAX_SETTINGS_UPDATED_EVENT, handleTaxUpdate);
    return () => {
      window.removeEventListener(TAX_SETTINGS_UPDATED_EVENT, handleTaxUpdate);
    };
  }, []);

  const totalPrice = selectedService ? Number(selectedService.price) : 0;
  const { subtotal, taxAmount } = React.useMemo(() => {
    if (!taxSettings.is_enabled) {
      return { subtotal: totalPrice, taxAmount: 0 };
    }
    return calculateTaxBreakdown(totalPrice);
  }, [totalPrice, taxSettings.is_enabled]);

  return (
    <div
      className="border rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col justify-between h-full space-y-5 transition-all duration-300"
      style={{
        backgroundColor: 'var(--card-bg)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div className="space-y-4 overflow-y-auto pr-1">
        {/* Title */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <h3 className="font-black text-slate-100 text-base">تسجيل الفاتورة السريعة</h3>
          {selectedService && (
            <span
              className="text-xs px-3 py-1 rounded-full font-bold border transition-all duration-300"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: 'var(--color-primary)',
                borderColor: 'var(--color-primary)',
              }}
            >
              {selectedService.name}
            </span>
          )}
        </div>


        {/* 1. Assigned Worker / Staff Selection */}
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5">
            العامل المسؤول عن الغسلة
          </label>
          <select
            value={assignedEmployeeId}
            onChange={(e) => setAssignedEmployeeId(e.target.value)}
            className="w-full border focus:border-primary rounded-2xl px-4 py-3 text-sm text-slate-100 focus:outline-none transition-colors font-medium cursor-pointer"
            style={{
              backgroundColor: 'rgba(2, 6, 23, 0.65)',
              borderColor: 'var(--border-color)',
            }}
          >
            <option value="">-- بدون تحديد عامل (عام) --</option>
            {employees
              .filter((e) => e.status === 'active')
              .map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.role})
                </option>
              ))}
          </select>
        </div>

        {/* 2. Payment Method Buttons */}
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-2">
            طريقة الدفع الفوري
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod('cash')}
              className={`flex flex-col items-center justify-center py-3.5 px-2 rounded-2xl border text-xs font-black transition-all active:scale-95 ${
                paymentMethod === 'cash'
                  ? 'text-white shadow-lg ring-2 ring-white/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={{
                backgroundColor: paymentMethod === 'cash' ? 'var(--color-primary)' : 'rgba(2, 6, 23, 0.65)',
                borderColor: paymentMethod === 'cash' ? 'var(--color-primary)' : 'var(--border-color)',
                boxShadow: paymentMethod === 'cash' ? '0 6px 18px rgba(0, 0, 0, 0.35)' : 'none',
              }}
            >
              كاش (نقدي)
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={`flex flex-col items-center justify-center py-3.5 px-2 rounded-2xl border text-xs font-black transition-all active:scale-95 ${
                paymentMethod === 'card'
                  ? 'text-white shadow-lg ring-2 ring-white/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={{
                backgroundColor: paymentMethod === 'card' ? 'var(--color-primary)' : 'rgba(2, 6, 23, 0.65)',
                borderColor: paymentMethod === 'card' ? 'var(--color-primary)' : 'var(--border-color)',
                boxShadow: paymentMethod === 'card' ? '0 6px 18px rgba(0, 0, 0, 0.35)' : 'none',
              }}
            >
              فيزا / بطاقة
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('transfer')}
              className={`flex flex-col items-center justify-center py-3.5 px-2 rounded-2xl border text-xs font-black transition-all active:scale-95 ${
                paymentMethod === 'transfer'
                  ? 'text-white shadow-lg ring-2 ring-white/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={{
                backgroundColor: paymentMethod === 'transfer' ? 'var(--color-primary)' : 'rgba(2, 6, 23, 0.65)',
                borderColor: paymentMethod === 'transfer' ? 'var(--color-primary)' : 'var(--border-color)',
                boxShadow: paymentMethod === 'transfer' ? '0 6px 18px rgba(0, 0, 0, 0.35)' : 'none',
              }}
            >
              محفظة إلكترونية
            </button>
          </div>
        </div>

        {/* 3. Optional Customer Details & Notes (Collapsible or Quick View) */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowExtraDetails(!showExtraDetails)}
            className="w-full flex items-center justify-between py-2 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors border-t border-slate-800/80"
          >
            <span className="flex items-center gap-1.5">
              <span>بيانات العميل والملاحظات (اختياري)</span>
              {(customerName || customerPhone || notes) && (
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                />
              )}
            </span>
            <span className="text-xs font-bold text-slate-400">
              {showExtraDetails ? '▲' : '▼'}
            </span>
          </button>

          {showExtraDetails && (
            <div className="space-y-3 pt-2 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <input
                    type="text"
                    placeholder="اسم العميل (اختياري)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full border focus:border-primary rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition-colors"
                    style={{
                      backgroundColor: 'rgba(2, 6, 23, 0.65)',
                      borderColor: 'var(--border-color)',
                    }}
                  />
                </div>

                <div>
                  <input
                    type="text"
                    placeholder="رقم الموبايل (اختياري)"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full border focus:border-primary rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition-colors font-mono"
                    style={{
                      backgroundColor: 'rgba(2, 6, 23, 0.65)',
                      borderColor: 'var(--border-color)',
                    }}
                  />
                </div>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="ملاحظات إضافية على الطلب..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border focus:border-primary rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'rgba(2, 6, 23, 0.65)',
                    borderColor: 'var(--border-color)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Financials Breakdown & Massive Instant Pay Button */}
      <div className="pt-3 border-t border-slate-800 space-y-3">
        {selectedService ? (
          <>
            <div className="space-y-1 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>المبلغ الأساسي:</span>
                <span className="font-mono text-slate-200">{formatEGP(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>ضريبة القيمة المضافة (14%):</span>
                {taxSettings.is_enabled ? (
                  <span className="font-mono text-slate-200">{formatEGP(taxAmount)}</span>
                ) : (
                  <span className="text-[11px] font-bold text-slate-400">معفى من الضريبة (معطل)</span>
                )}
              </div>
            </div>

            <div
              className="flex items-baseline justify-between p-4 rounded-2xl border transition-all duration-300"
              style={{
                backgroundColor: 'rgba(2, 6, 23, 0.75)',
                borderColor: 'var(--border-color)',
              }}
            >
              <span className="text-sm font-bold text-slate-200">الإجمالي النهائي:</span>
              <div
                className="font-mono text-3xl font-black"
                style={{ color: 'var(--color-primary)' }}
              >
                {formatEGP(totalPrice)}
              </div>
            </div>

            <button
              onClick={onSubmit}
              disabled={isSubmitting}
              className="w-full py-4 text-white rounded-2xl font-black text-base shadow-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--color-primary)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
              }}
            >
              {isSubmitting ? (
                <>
                  <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />
                  <span>جاري تسجيل الطلب وخصم الجرامات...</span>
                </>
              ) : (
                <span>إصدار الفاتورة وطباعة الإيصال (Done)</span>
              )}
            </button>
          </>
        ) : (
          <EmptyState
            compact
            title="لم يتم اختيار باقة غسيل"
            description="اضغط على باقة الغسيل من القائمة لبدء الفاتورة وتحديد طريقة الدفع"
          />
        )}
      </div>


    </div>
  );
};

export default React.memo(OrderSummary);
