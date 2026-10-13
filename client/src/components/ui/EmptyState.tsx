import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  className = '',
}) => {
  if (compact) {
    return (
      <div className={`text-center py-6 px-4 text-xs text-slate-500 space-y-1.5 animate-fadeIn ${className}`}>
        {icon && <div className="flex justify-center text-slate-500 mb-1">{icon}</div>}
        <div className="font-semibold text-slate-400">{title}</div>
        {description && <p className="text-[11px] text-slate-500">{description}</p>}
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-1 mt-2 text-xs font-bold hover:underline transition-all active:scale-95"
            style={{ color: 'var(--color-primary, #bd0000)' }}
          >
            <span>{actionLabel}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-3xl border border-white/10 backdrop-blur-md space-y-4 my-4 animate-fadeIn shadow-xl ${className}`}
      style={{
        backgroundColor: 'var(--card-bg, rgba(20, 15, 25, 0.8))',
        borderColor: 'var(--border-color, rgba(255, 255, 255, 0.1))',
      }}
    >
      <div
        className="w-16 h-16 rounded-2xl border border-white/10 flex items-center justify-center shadow-lg relative text-slate-400"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
        }}
      >
        {icon ? (
          <div className="text-2xl">{icon}</div>
        ) : (
          <svg
            className="w-8 h-8 opacity-60"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        )}
        <div
          className="absolute inset-0 rounded-2xl blur-md opacity-20 pointer-events-none"
          style={{ backgroundColor: 'var(--color-primary, #bd0000)' }}
        />
      </div>

      <div className="space-y-1.5 max-w-md">
        <h3 className="font-black text-sm sm:text-base text-slate-100">{title}</h3>
        {description && (
          <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
        )}
      </div>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg transition-all hover:brightness-110 active:scale-95 mt-2"
          style={{
            backgroundColor: 'var(--color-primary, #bd0000)',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
          }}
        >
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
};

export default EmptyState;
