import React from 'react';
import { LandingOfferCard } from '../../../types/index.js';
import { buildWhatsAppUrl } from '../../../utils/landingStorage.js';

interface OfferCardProps {
  card: LandingOfferCard;
  index: number;
}

export const OfferCard: React.FC<OfferCardProps> = ({ card }) => {
  const isVideo = card.media_type === 'video' && Boolean(card.media_url);
  const whatsappUrl = buildWhatsAppUrl(card.whatsapp_number, card.whatsapp_prefilled_text || card.title);

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex flex-col justify-between w-full min-w-0 overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-zinc-900 p-2.5 sm:p-5 md:p-6 transition-all duration-300 hover:border-red-600/60 hover:shadow-red-950/40 active:scale-[0.98] aspect-[3/4] sm:aspect-[4/3] md:aspect-[16/11] min-h-[220px] sm:min-h-[280px] md:min-h-[320px] shadow-2xl select-none"
      style={{ textDecoration: 'none' }}
    >
      {/* Background Media */}
      {isVideo ? (
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster={card.fallback_image_url || card.media_url}
          className="absolute inset-0 w-full h-full object-cover object-center select-none pointer-events-none filter brightness-[0.45] transition-transform duration-700 group-hover:scale-105 group-hover:brightness-[0.55]"
          src={card.media_url}
        />
      ) : (
        <div
          className="absolute inset-0 w-full h-full bg-cover bg-center select-none filter brightness-[0.45] transition-transform duration-700 group-hover:scale-105 group-hover:brightness-[0.55]"
          style={{
            backgroundImage: `url(${card.media_url || card.fallback_image_url || 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=1000&q=80'})`,
          }}
        />
      )}

      {/* Dark Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none" />

      {/* Top Header Row: Badge */}
      <div className="relative z-10 flex items-center justify-start min-w-0 w-full">
        {card.badge ? (
          <span className="inline-flex items-center px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-red-950/85 text-red-300 text-[10px] sm:text-xs md:text-sm font-bold border border-red-500/50 shadow-[0_0_10px_rgba(220,38,38,0.3)] backdrop-blur-sm truncate max-w-full">
            {card.badge}
          </span>
        ) : (
          <div className="h-4" />
        )}
      </div>

      {/* Bottom Action Area */}
      <div className="relative z-10 w-full min-w-0 flex flex-col items-center justify-end space-y-1.5 sm:space-y-3 pt-2">
        <div className="min-h-[34px] sm:min-h-[44px] w-full flex items-center justify-center">
          <h3 className="text-xs sm:text-base md:text-lg font-bold text-white text-center line-clamp-2 px-1 mb-1 drop-shadow-xl leading-snug">
            {card.title}
          </h3>
        </div>

        <div className="w-full sm:w-auto sm:px-8 py-1.5 sm:py-2.5 px-3 bg-emerald-600/90 group-hover:bg-emerald-500 text-white text-[11px] sm:text-xs md:text-sm font-semibold rounded-xl text-center shadow-lg transition-all whitespace-nowrap inline-flex items-center justify-center">
          احجز واتساب ←
        </div>
      </div>
    </a>
  );
};

export default OfferCard;
