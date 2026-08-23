import React from 'react';
import { PackageOpen, Plus } from 'lucide-react';

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
      <div className={`text-center py-6 px-4 text-xs text-slate-500 space-y-1.5 ${className}`}>
        <div className="font-semibold text-slate-400">{title}</div>
        {description && <p className="text-[11px] text-slate-500">{description}</p>}
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-red-400 hover:text-red-300 underline"
            style={{ color: 'var(--color-primary)' }}
          >
            <Plus className="w-3 h-3" />
            <span>{actionLabel}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-3xl border backdrop-blur-md space-y-4 my-4 animate-in fade-in duration-300 ${className}`}
      style={{
        backgroundColor: 'var(--card-bg)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div
        className="w-16 h-16 rounded-2xl border flex items-center justify-center shadow-inner relative"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          borderColor: 'var(--border-color)',
          color: 'var(--color-primary)',
        }}
      >
        {icon || <PackageOpen className="w-8 h-8 opacity-80" />}
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
            backgroundColor: 'var(--color-primary)',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
          }}
        >
          <Plus className="w-4 h-4" />
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
};

export default EmptyState;
