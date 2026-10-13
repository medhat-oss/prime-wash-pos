import React, { useState } from 'react';
import Modal from './Modal.js';
import { setAdminPin, setStoredAdminPin, dashboardApi } from '../api/client.js';
import { safeSessionStorage } from '../utils/safeStorage.js';
import { useToast } from './Toast.js';

interface ChangeAdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newPin: string) => void;
}

export const ChangeAdminPinModal: React.FC<ChangeAdminPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const toast = useToast();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  const triggerError = (msg: string) => {
    setError(msg);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const handleClose = () => {
    if (submitting) return;
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setError('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanCurrent = currentPin.trim();
    const cleanNew = newPin.trim();
    const cleanConfirm = confirmPin.trim();

    if (!cleanCurrent) {
      triggerError('يرجى إدخال رمز الـ PIN الحالي للإدارة');
      return;
    }

    if (!/^\d{4,6}$/.test(cleanNew)) {
      triggerError('رمز الـ PIN الجديد يجب أن يتكون من 4 إلى 6 أرقام فقط');
      return;
    }

    if (cleanNew !== cleanConfirm) {
      triggerError('رمز الـ PIN الجديد وتأكيده غير متطابقين!');
      return;
    }

    if (cleanCurrent === cleanNew) {
      triggerError('رمز الـ PIN الجديد مطابق للرمز الحالي، يرجى اختيار رمز جديد');
      return;
    }

    try {
      setSubmitting(true);
      const res = await dashboardApi.changeAdminPin({
        currentPin: cleanCurrent,
        newPin: cleanNew,
      });

      // Update session with new PIN
      setAdminPin(cleanNew);
      setStoredAdminPin(cleanNew);
      safeSessionStorage.setItem('cw_admin_pin', cleanNew);
      safeSessionStorage.setItem('cw_admin_unlocked', 'true');
      safeSessionStorage.setItem('cw_active_tab', 'admin');
      toast.success(res.message || 'تم تحديث رمز PIN للإدارة بنجاح!', 'تم التحديث');

      if (onSuccess) {
        onSuccess(cleanNew);
      }

      handleClose();
    } catch (err: any) {
      triggerError(err.message || 'تعذر تغيير رمز الـ PIN، تأكد من صحة الرمز الحالي');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="تغيير رمز PIN للوحة الإدارة" maxWidth="md">
      <form onSubmit={handleSubmit} noValidate className={`space-y-4 text-xs ${isShaking ? 'animate-shake' : ''}`}>
        {/* Header Banner */}
        <div
          className="p-3.5 rounded-2xl border flex items-center gap-3 shadow-inner"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div>
            <div className="font-bold text-slate-200 text-sm">حماية لوحة التحكم والإدارة</div>
            <div className="text-slate-400 text-[11px] mt-0.5">
              يمكنك تخصيص رمز PIN سري مكون من 4 إلى 6 أرقام للوصول إلى الحسابات والرواتب
            </div>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-semibold animate-in zoom-in-95">
            <span>{error}</span>
          </div>
        )}

        {/* Form Fields */}
        <div className="space-y-3">
          {/* 1. Current PIN */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              رمز PIN الحالي <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="أدخل الرمز الحالي (الافتراضي 1234)..."
                value={currentPin}
                onChange={(e) => {
                  setError('');
                  setCurrentPin(e.target.value.replace(/\D/g, ''));
                }}
                className="w-full border rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono tracking-widest text-center focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderColor: 'var(--border-color)',
                }}
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute left-3 top-2.5 text-[10px] text-slate-400 hover:text-slate-200 font-bold px-1.5 py-0.5 rounded bg-white/5 border border-white/10"
              >
                {showCurrent ? 'إخفاء' : 'إظهار'}
              </button>
            </div>
          </div>

          {/* 2. New PIN */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              رمز PIN الجديد (4 - 6 أرقام) <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="أدخل الرمز الجديد..."
                value={newPin}
                onChange={(e) => {
                  setError('');
                  setNewPin(e.target.value.replace(/\D/g, ''));
                }}
                className="w-full border rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono tracking-widest text-center focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderColor: 'var(--border-color)',
                }}
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute left-3 top-2.5 text-[10px] text-slate-400 hover:text-slate-200 font-bold px-1.5 py-0.5 rounded bg-white/5 border border-white/10"
              >
                {showNew ? 'إخفاء' : 'إظهار'}
              </button>
            </div>
          </div>

          {/* 3. Confirm New PIN */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              تأكيد رمز PIN الجديد <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="أعد إدخال الرمز الجديد للتأكيد..."
                value={confirmPin}
                onChange={(e) => {
                  setError('');
                  setConfirmPin(e.target.value.replace(/\D/g, ''));
                }}
                className="w-full border rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono tracking-widest text-center focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderColor: 'var(--border-color)',
                }}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute left-3 top-2.5 text-[10px] text-slate-400 hover:text-slate-200 font-bold px-1.5 py-0.5 rounded bg-white/5 border border-white/10"
              >
                {showConfirm ? 'إخفاء' : 'إظهار'}
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5 pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="py-2.5 border rounded-xl text-slate-400 hover:text-slate-200 font-bold transition-all"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'var(--border-color)',
            }}
          >
            إلغاء
          </button>

          <button
            type="submit"
            disabled={submitting || !currentPin || !newPin || !confirmPin}
            className="flex items-center justify-center gap-1.5 py-2.5 text-white rounded-xl font-bold shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--color-primary)',
            }}
          >
            {submitting && (
              <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />
            )}
            <span>حفظ رمز الـ PIN الجديد</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ChangeAdminPinModal;
