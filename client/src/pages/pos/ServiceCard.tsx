import React from 'react';
import { Check, Droplets } from 'lucide-react';
import { Service } from '../../types/index.js';
import { formatEGP, resolveMediaUrl } from '../../utils/formatters.js';

interface ServiceCardProps {
  service: Service;
  isSelected: boolean;
  onSelect: (service: Service) => void;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ service, isSelected, onSelect }) => {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const hasMedia = service.media_type && service.media_type !== 'none' && !!service.media_url;
  const resolvedUrl = hasMedia ? resolveMediaUrl(service.media_url) : '';

  React.useEffect(() => {
    if (service.media_type === 'video' && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [service.media_type, service.media_url]);

  return (
    <button
      type="button"
      onClick={() => onSelect(service)}
      className={`group relative text-right p-4 rounded-3xl transition-all duration-300 border flex flex-col justify-between overflow-hidden shadow-lg hover:shadow-2xl hover:-translate-y-1 active:scale-[0.98] select-none ${
        isSelected
          ? 'ring-2'
          : 'hover:border-slate-600'
      }`}
      style={{
        backgroundColor: 'var(--card-bg)',
        borderColor: isSelected ? 'var(--color-primary)' : 'var(--border-color)',
        boxShadow: isSelected ? '0 10px 25px rgba(0, 0, 0, 0.45)' : undefined,
      }}
    >
      {/* Background Media: Video or HD Image */}
      {hasMedia && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none rounded-3xl">
          {service.media_type === 'video' ? (
            <video
              ref={videoRef}
              src={resolvedUrl}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover opacity-30 group-hover:opacity-45 transition-opacity duration-500 scale-105 group-hover:scale-110 transform"
            />
          ) : (
            <img
              src={resolvedUrl}
              alt={service.name}
              className="w-full h-full object-cover opacity-25 group-hover:opacity-40 transition-opacity duration-500 scale-105 group-hover:scale-110 transform"
            />
          )}
          {/* Subtle gradient overlay to keep text fully legible */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent" />
        </div>
      )}

      {/* Card Header: Category Tag & Selected Indicator */}
      <div className="relative z-10 w-full">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-slate-950/80 text-slate-200 border border-slate-700/80 backdrop-blur-md">
              {service.category || 'عام'}
            </span>
          </div>

          {isSelected && (
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center text-white shadow-md animate-in zoom-in-50 duration-200"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <Check className="w-4 h-4 stroke-[3]" />
            </div>
          )}
        </div>

        {/* Service Name */}
        <h4 className="text-lg font-bold text-white transition-colors mb-1.5 drop-shadow-sm">
          {service.name}
        </h4>

        {/* Description */}
        {service.description && (
          <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed mb-3 drop-shadow-sm">
            {service.description}
          </p>
        )}

        {/* BOM Ingredients Tags */}
        {service.recipes && service.recipes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
            {service.recipes.slice(0, 3).map((r, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg bg-slate-950/90 text-slate-300 border border-slate-800/90 backdrop-blur-md"
              >
                <Droplets className="w-2.5 h-2.5" style={{ color: 'var(--color-primary)' }} />
                <span>{r.inventory_name || 'مادة'}:</span>
                <span className="font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                  {r.quantity_grams}g
                </span>
              </span>
            ))}
            {service.recipes.length > 3 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-slate-900/90 text-slate-400 border border-slate-800 backdrop-blur-md">
                +{service.recipes.length - 3} مواد
              </span>
            )}
          </div>
        )}
      </div>

      {/* Price Tag */}
      <div className="relative z-10 pt-3 mt-3 border-t border-slate-800/80 flex items-baseline justify-between w-full">
        <span className="text-xs text-slate-400 font-medium">السعر شامل الضريبة</span>
        <div
          className="font-mono text-2xl font-black tracking-tight drop-shadow-sm"
          style={{ color: 'var(--color-primary)' }}
        >
          {formatEGP(service.price)}
        </div>
      </div>
    </button>
  );
};

export default ServiceCard;
