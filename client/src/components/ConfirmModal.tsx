import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'نعم، حذف نهائي',
  cancelLabel = 'إلغاء',
  variant = 'danger',
  isLoading = false,
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      } else if (e.key === 'Enter' && !isLoading) {
        onConfirm();
      }
    },
    [onClose, onConfirm, isLoading]
  );

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'warning':
        return {
          iconBg: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
          confirmBtn: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/40',
          badgeText: 'تنبيه',
        };
      case 'info':
        return {
          iconBg: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
          confirmBtn: 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/40',
          badgeText: 'إشعار',
        };
      case 'danger':
      default:
        return {
          iconBg: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
          confirmBtn: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40',
          badgeText: 'تأكيد الحذف',
        };
    }
  };

  const styles = getVariantStyles();

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[99999] w-screen h-screen flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        onClick={() => {
          if (!isLoading) onClose();
        }}
      />

      {/* Modal Card */}
      <div
        className="relative w-full max-w-md border rounded-3xl shadow-2xl overflow-hidden z-10 transition-all transform duration-200 animate-in zoom-in-95 my-auto backdrop-blur-md text-right text-xs"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-color)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Ribbon */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{
            borderColor: 'var(--border-color)',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${styles.iconBg}`}>
              {styles.badgeText}
            </span>
            <h3 className="text-sm font-black text-slate-100">{title}</h3>
          </div>
          {!isLoading && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors font-bold text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border text-lg font-bold ${styles.iconBg}`}
            >
              {variant === 'danger' ? '⚠️' : 'ℹ️'}
            </div>
            <div className="space-y-1 text-slate-200 leading-relaxed font-medium">
              <p className="text-xs">{message}</p>
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            يرجى التأكد من رغبتك في متابعة هذا الإجراء، لا يمكن التراجع عن هذه العملية بعد التأكيد.
          </p>
        </div>

        {/* Action Buttons */}
        <div
          className="grid grid-cols-2 gap-3 px-6 py-4 border-t"
          style={{
            borderColor: 'var(--border-color)',
            backgroundColor: 'rgba(0, 0, 0, 0.15)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="py-2.5 px-4 rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 font-bold transition-all text-center disabled:opacity-40"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold shadow-lg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${styles.confirmBtn}`}
          >
            {isLoading && (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />
            )}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ConfirmModal;
