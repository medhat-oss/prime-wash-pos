import React, { createContext, useContext, useState, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (type: ToastType, message: string, title?: string, duration?: number) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, title?: string, duration: number = 2800) => {
      const trimmedMsg = (message || '').trim();
      if (!trimmedMsg) return;

      setToasts((prev) => {
        // 1. Deduplication: prevent stacking identical messages
        if (prev.some((t) => t.type === type && t.message.trim() === trimmedMsg)) {
          return prev;
        }

        const id = Math.random().toString(36).substring(2, 9);
        const newToast: Toast = { id, type, message: trimmedMsg, title, duration };

        // 2. Limit stack size to max 2 items
        const limited = prev.length >= 2 ? prev.slice(prev.length - 1) : prev;

        if (duration > 0) {
          setTimeout(() => {
            removeToast(id);
          }, duration);
        }

        return [...limited, newToast];
      });
    },
    [removeToast]
  );

  const success = useCallback((msg: string, title?: string) => showToast('success', msg, title), [showToast]);
  const error = useCallback((msg: string, title?: string) => showToast('error', msg, title || 'خطأ في العملية'), [showToast]);
  const warning = useCallback((msg: string, title?: string) => showToast('warning', msg, title || 'تنبيه'), [showToast]);
  const info = useCallback((msg: string, title?: string) => showToast('info', msg, title), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      <div className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-md z-[100000] flex flex-col gap-2 pointer-events-none pb-[env(safe-area-inset-bottom,0px)]">
        {toasts.map((toast) => {
          const bgColors = {
            success: 'bg-emerald-950/95 border-emerald-500/50 text-emerald-100',
            error: 'bg-rose-950/95 border-rose-500/50 text-rose-100',
            warning: 'bg-amber-950/95 border-amber-500/50 text-amber-100',
            info: 'bg-sky-950/95 border-sky-500/50 text-sky-100',
          };

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl border shadow-2xl backdrop-blur-md transition-all duration-300 animate-slide-in ${bgColors[toast.type]}`}
            >
              <div className="flex-1 text-xs sm:text-sm">
                {toast.title && <div className="font-bold mb-0.5">{toast.title}</div>}
                <div className="leading-relaxed opacity-95">{toast.message}</div>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-white transition-colors p-1 font-bold text-xs"
                aria-label="Close toast"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
