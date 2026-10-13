import React from 'react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'حدث خطأ أثناء تحميل البيانات',
  message = 'تعذر الاتصال بالخادم أو جلب أحدث البيانات. يرجى التحقق من اتصالك وإعادة المحاولة.',
  onRetry,
  compact = false,
  className = '',
}) => {
  if (compact) {
    return (
      <div className={`p-4 rounded-2xl border border-rose-500/30 bg-rose-950/30 text-center space-y-2 animate-fadeIn ${className}`}>
        <div className="font-bold text-xs text-rose-200">{title}</div>
        {message && <p className="text-[11px] text-rose-300/80">{message}</p>}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-95"
          >
            <span>🔄 إعادة المحاولة</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-10 text-center rounded-3xl border border-rose-500/30 bg-rose-950/25 backdrop-blur-md space-y-4 my-4 animate-fadeIn shadow-xl ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl border border-rose-500/40 bg-rose-950/60 flex items-center justify-center text-rose-400 shadow-inner relative text-2xl">
        <span>⚠️</span>
        <div className="absolute inset-0 rounded-2xl bg-rose-500/20 blur-md pointer-events-none" />
      </div>

      <div className="space-y-1 max-w-md">
        <h3 className="font-bold text-sm sm:text-base text-rose-200">{title}</h3>
        <p className="text-xs text-rose-300/80 leading-relaxed">{message}</p>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-950/50 transition-all active:scale-95 mt-2"
        >
          <span>🔄 إعادة المحاولة (Retry)</span>
        </button>
      )}
    </div>
  );
};

export default ErrorState;
