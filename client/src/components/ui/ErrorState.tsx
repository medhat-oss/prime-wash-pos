import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'حدث خطأ أثناء تحميل البيانات',
  message = 'تعذر الاتصال بالخادم. يرجى التحقق من اتصالك وإعادة المحاولة.',
  onRetry,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-10 text-center rounded-3xl border border-rose-500/30 bg-rose-950/20 backdrop-blur-md space-y-4 my-4 animate-in fade-in duration-300 ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl border border-rose-500/40 bg-rose-950/40 flex items-center justify-center shadow-lg text-rose-400">
        <AlertTriangle className="w-7 h-7" />
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
          <RefreshCw className="w-3.5 h-3.5" />
          <span>إعادة المحاولة (Retry)</span>
        </button>
      )}
    </div>
  );
};

export default ErrorState;
