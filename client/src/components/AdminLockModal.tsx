import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Delete, X, ShieldAlert, ArrowRight, Loader2, KeyRound } from 'lucide-react';
import { setAdminPin, verifyAdminPin } from '../api/client.js';

interface AdminLockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (pin: string) => void;
}

export const AdminLockModal: React.FC<AdminLockModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const triggerError = (msg: string) => {
    setError(msg);
    setIsShaking(true);
    setPin('');
    setTimeout(() => setIsShaking(false), 500);
  };

  const handleVerify = useCallback(
    async (pinToVerify?: string) => {
      const targetPin = (pinToVerify || pin).trim();
      if (targetPin.length < 4) {
        triggerError('يرجى إدخال 4 أرقام على الأقل لرمز الـ PIN');
        return;
      }

      const currentAdminPin =
        (typeof window !== 'undefined'
          ? localStorage.getItem('cw_admin_pin') || localStorage.getItem('admin_master_pin')
          : null) || '1234';

      setIsVerifying(true);
      setError('');
      try {
        const isValid = await verifyAdminPin(targetPin);
        if (isValid && targetPin === currentAdminPin.trim()) {
          setAdminPin(targetPin);
          setPin('');
          setError('');
          onSuccess(targetPin);
        } else {
          triggerError('رمز PIN غير صحيح! يرجى التأكد من الرمز.');
        }
      } catch {
        triggerError('رمز PIN غير صحيح! يرجى التأكد من الرمز.');
      } finally {
        setIsVerifying(false);
      }
    },
    [pin, onSuccess]
  );


  const handleInputDigit = useCallback(
    async (digit: string) => {
      if (pin.length < 6 && !isVerifying) {
        setError('');
        const newPin = pin + digit;
        setPin(newPin);

        // Auto verify if user enters maximum 6 digits
        if (newPin.length === 6) {
          handleVerify(newPin);
        }
      }
    },
    [pin, isVerifying, handleVerify]
  );

  const handleBackspace = useCallback(() => {
    if (isVerifying) return;
    setError('');
    setPin((prev) => prev.slice(0, -1));
  }, [isVerifying]);

  const handleClear = useCallback(() => {
    if (isVerifying) return;
    setError('');
    setPin('');
  }, [isVerifying]);

  // Lock body scroll and listen to keyboard events when open
  useEffect(() => {
    if (!isOpen) {
      setPin('');
      setError('');
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleInputDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pin.length >= 4 && !isVerifying) {
          handleVerify(pin);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, pin, isVerifying, handleInputDigit, handleBackspace, handleVerify, onClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] w-screen h-screen flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
    >
      {/* Background Click to dismiss */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Lock Card Container - Perfectly Centered */}
      <div
        className={`relative w-full max-w-sm sm:max-w-md border rounded-3xl p-6 sm:p-8 shadow-2xl text-center select-none z-10 my-auto backdrop-blur-xl animate-in zoom-in-95 duration-200 ${
          isShaking ? 'animate-shake' : ''
        }`}
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-color)',
        }}
      >
        {/* Top Close / Return Button */}
        <button
          onClick={onClose}
          type="button"
          title="إلغاء والرجوع للكاشير"
          className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white rounded-xl transition-colors hover:bg-white/5"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Lock Icon with Glowing Gradient Ring */}
        <div
          className="w-16 h-16 rounded-2xl text-white flex items-center justify-center mx-auto mb-3.5 shadow-xl"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.35)',
          }}
        >
          {isVerifying ? <Loader2 className="w-8 h-8 animate-spin" /> : <Lock className="w-8 h-8" />}
        </div>

        {/* Modal Title & Subtitle */}
        <h3 className="text-xl font-black text-white">لوحة تحكم الإدارة</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
          يرجى إدخال رمز PIN السري (4 إلى 6 أرقام) للوصول
        </p>

        {/* PIN Indicator Dots (Supports 4 to 6 Digits) */}
        <div className="flex justify-center items-center gap-2.5 my-5 py-2">
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const isFilled = pin.length > i;
            return (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 ${
                  isFilled
                    ? 'scale-110 shadow-lg'
                    : 'bg-black/40 border-slate-700'
                }`}
                style={
                  isFilled
                    ? {
                        backgroundColor: 'var(--color-primary)',
                        borderColor: 'var(--color-primary)',
                        boxShadow: '0 0 12px var(--color-primary)',
                      }
                    : {}
                }
              />
            );
          })}
        </div>

        {/* Error Alert Message */}
        {error ? (
          <div className="flex items-center justify-center gap-2 p-2.5 mb-4 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-semibold animate-in zoom-in-95">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="h-6 mb-4" />
        )}

        {/* Numeric Touch Keypad Grid */}
        <div className="grid grid-cols-3 gap-2.5 max-w-[270px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleInputDigit(num)}
              className="h-12 rounded-2xl border text-slate-100 text-xl font-bold font-mono transition-all shadow-md active:scale-95 flex items-center justify-center hover:bg-white/10"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            >
              {num}
            </button>
          ))}

          {/* Cancel / Clear Button */}
          <button
            type="button"
            onClick={pin ? handleClear : onClose}
            className="h-12 rounded-2xl text-slate-400 hover:text-slate-200 border text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1 hover:bg-white/10"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            {pin ? <span>مسح الكل</span> : <ArrowRight className="w-3.5 h-3.5" />}
          </button>

          {/* Zero Button */}
          <button
            type="button"
            onClick={() => handleInputDigit('0')}
            className="h-12 rounded-2xl border text-slate-100 text-xl font-bold font-mono transition-all shadow-md active:scale-95 flex items-center justify-center hover:bg-white/10"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            0
          </button>

          {/* Backspace Button */}
          <button
            type="button"
            onClick={handleBackspace}
            title="مسح رقم"
            className="h-12 rounded-2xl text-slate-400 hover:text-slate-200 border flex items-center justify-center transition-all active:scale-95 hover:bg-white/10"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Submit Enter Button (for 4, 5, or 6 digit PINs) */}
        <div className="mt-4 pt-3 border-t max-w-[270px] mx-auto" style={{ borderColor: 'var(--border-color)' }}>
          <button
            type="button"
            onClick={() => handleVerify()}
            disabled={pin.length < 4 || isVerifying}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-white font-bold text-xs shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--color-primary)',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
            }}
          >
            {isVerifying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <KeyRound className="w-4 h-4" />
            )}
            <span>تأكيد ودخول لوحة الإدارة</span>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default AdminLockModal;
