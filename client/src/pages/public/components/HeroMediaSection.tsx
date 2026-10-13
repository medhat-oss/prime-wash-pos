import React from 'react';
import { LandingHeroSection } from '../../../types/index.js';

interface HeroMediaSectionProps {
  section: LandingHeroSection;
  badgeText?: string;
  minHeightClass?: string;
}

const formatTitleWithNoWrap = (text?: string) => {
  if (!text) return null;
  // Match parenthetical phrases like (pH Neutral), (PH Neutral), etc.
  const parts = text.split(/(\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith('(') && part.endsWith(')')) {
      return (
        <span key={i} className="inline-block whitespace-nowrap" dir="ltr">
          {part}
        </span>
      );
    }
    return part;
  });
};

export const HeroMediaSection: React.FC<HeroMediaSectionProps> = ({
  section,
  badgeText,
  minHeightClass = 'min-h-[460px] sm:min-h-[540px] lg:min-h-[620px]',
}) => {
  const isVideo = section.media_type === 'video' && Boolean(section.media_url);

  return (
    <section className={`relative w-full overflow-hidden rounded-2xl sm:rounded-[36px] shadow-2xl border border-white/10 ${minHeightClass} flex items-center justify-center`}>
      {/* Background Media Layer */}
      {isVideo ? (
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster={section.fallback_image_url || 'https://images.unsplash.com/photo-1601362840469-51e4d8d58785?auto=format&fit=crop&w=1600&q=80'}
          className="absolute inset-0 w-full h-full object-cover object-center select-none pointer-events-none filter brightness-90 transform transition-transform duration-1000"
          src={section.media_url}
        />
      ) : (
        <div
          className="absolute inset-0 w-full h-full bg-cover bg-center select-none transition-transform duration-1000"
          style={{
            backgroundImage: `url(${section.media_url || section.fallback_image_url || 'https://images.unsplash.com/photo-1601362840469-51e4d8d58785?auto=format&fit=crop&w=1600&q=80'})`,
          }}
        />
      )}

      {/* Cinematic Dark Gradient Vignette for Ultra-Readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/30 backdrop-blur-[1px]" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-black/80" />

      {/* Dynamic Content Overlay */}
      {section.show_overlay_text && (
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-8 py-5 sm:py-10 text-center space-y-2 sm:space-y-4 animate-fadeIn">
          {badgeText && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-red-950/75 border border-red-500/40 text-red-300 text-[10px] sm:text-xs md:text-sm font-bold shadow-[0_0_12px_rgba(239,68,68,0.25)] backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
              <span>{badgeText}</span>
            </div>
          )}

          <h1 className="text-base sm:text-2xl md:text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight drop-shadow-2xl [text-wrap:balance]">
            {formatTitleWithNoWrap(section.title)}
          </h1>

          <p className="text-[11px] sm:text-sm md:text-base lg:text-lg text-slate-200/90 font-medium leading-relaxed max-w-2xl mx-auto drop-shadow-md line-clamp-3 sm:line-clamp-none">
            {section.subtitle}
          </p>
        </div>
      )}
    </section>
  );
};

export default HeroMediaSection;
