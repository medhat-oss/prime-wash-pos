import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  title?: string;
  description?: string;
  compact?: boolean;
  type?: 'spinner' | 'skeleton';
  skeletonCount?: number;
}

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
            className="h-20 rounded-2xl border"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderColor: 'var(--border-color)',
            }}
          />
        ))}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-xs font-semibold text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin text-red-500" style={{ color: 'var(--color-primary)' }} />
        <span>{title}</span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-3xl border backdrop-blur-md space-y-3.5 my-4"
      style={{
        backgroundColor: 'var(--card-bg)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div
        className="w-14 h-14 rounded-2xl border flex items-center justify-center shadow-lg relative"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          borderColor: 'var(--border-color)',
        }}
      >
        <Loader2
          className="w-7 h-7 animate-spin"
          style={{ color: 'var(--color-primary)' }}
        />
        <div
          className="absolute inset-0 rounded-2xl blur-md opacity-40 animate-pulse pointer-events-none"
          style={{ backgroundColor: 'var(--color-primary)' }}
        />
      </div>

      <div className="space-y-1">
        <h3 className="font-bold text-sm text-slate-100">{title}</h3>
        {description && <p className="text-xs text-slate-400 max-w-sm">{description}</p>}
      </div>
    </div>
  );
};

export default LoadingState;
