import React from 'react';

interface LoadingStateProps {
  title?: string;
  description?: string;
  compact?: boolean;
  type?: 'spinner' | 'skeleton';
  skeletonCount?: number;
}

/**
 * Standard Glassmorphic Loading Spinner / Pulse Widget
 */
export const LoadingState: React.FC<LoadingStateProps> = ({
  title = 'جارٍ تحميل البيانات...',
  description,
  compact = false,
  type = 'spinner',
  skeletonCount = 3,
}) => {
  if (type === 'skeleton') {
    return (
      <div className="w-full space-y-3 animate-pulse">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-2xl border border-white/5 bg-slate-800/40 backdrop-blur-md"
          />
        ))}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-xs font-semibold text-slate-400">
        <span
          className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin inline-block"
          style={{ borderColor: 'var(--color-primary, #bd0000)', borderTopColor: 'transparent' }}
        />
        <span>{title}</span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-3xl border border-white/10 backdrop-blur-md space-y-3.5 my-4 animate-fadeIn"
      style={{
        backgroundColor: 'var(--card-bg, rgba(20, 15, 25, 0.8))',
        borderColor: 'var(--border-color, rgba(255, 255, 255, 0.1))',
      }}
    >
      <div
        className="w-14 h-14 rounded-2xl border border-white/10 flex items-center justify-center shadow-lg relative"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
        }}
      >
        <span
          className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin inline-block"
          style={{ borderColor: 'var(--color-primary, #bd0000)', borderTopColor: 'transparent' }}
        />
        <div
          className="absolute inset-0 rounded-2xl blur-md opacity-40 animate-pulse pointer-events-none"
          style={{ backgroundColor: 'var(--color-primary, #bd0000)' }}
        />
      </div>

      <div className="space-y-1">
        <h3 className="font-bold text-sm text-slate-100">{title}</h3>
        {description && <p className="text-xs text-slate-400 max-w-sm">{description}</p>}
      </div>
    </div>
  );
};

/**
 * Reusable Card Grid Skeleton (KPI Metrics & Dashboards)
 */
export const CardGridSkeleton: React.FC<{
  count?: number;
  columns?: 2 | 3 | 4;
  className?: string;
}> = ({ count = 4, columns = 4, className = '' }) => {
  const colClass =
    columns === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : columns === 3
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className={`grid ${colClass} gap-4 animate-pulse ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-5 rounded-3xl border border-white/5 bg-slate-900/60 backdrop-blur-md space-y-3 shadow-lg"
          style={{
            borderColor: 'var(--border-color, rgba(255, 255, 255, 0.08))',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="h-4 w-24 bg-slate-800 rounded-lg" />
            <div className="w-8 h-8 rounded-xl bg-slate-800" />
          </div>
          <div className="h-7 w-32 bg-slate-800 rounded-xl" />
          <div className="h-3 w-40 bg-slate-800/60 rounded-md" />
        </div>
      ))}
    </div>
  );
};

/**
 * Reusable Table Row Skeletons (Orders, Staff, Shifts, Expenses)
 */
export const TableSkeletonRows: React.FC<{
  columns?: number;
  rows?: number;
  rowHeight?: string;
}> = ({ columns = 7, rows = 5, rowHeight = 'py-4' }) => {
  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr
          key={rIdx}
          className="animate-pulse border-b border-white/5 transition-colors"
          style={{ borderColor: 'var(--border-color, rgba(255, 255, 255, 0.05))' }}
        >
          {Array.from({ length: columns }).map((_, cIdx) => (
            <td key={cIdx} className={`px-4 ${rowHeight}`}>
              <div
                className="h-4 bg-slate-800/80 rounded-lg"
                style={{
                  width: `${50 + ((cIdx * 17 + rIdx * 13) % 45)}%`,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
};

/**
 * Reusable Form & Settings Section Skeleton (POS Appearance, Landing Settings)
 */
export const FormSkeleton: React.FC<{
  fields?: number;
  className?: string;
}> = ({ fields = 4, className = '' }) => {
  return (
    <div className={`space-y-6 animate-pulse ${className}`}>
      <div className="p-6 rounded-3xl border border-white/5 bg-slate-900/60 space-y-5">
        <div className="h-5 w-48 bg-slate-800 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: fields }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3.5 w-24 bg-slate-800/80 rounded" />
              <div className="h-10 w-full bg-slate-800/50 rounded-xl border border-white/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LoadingState;
