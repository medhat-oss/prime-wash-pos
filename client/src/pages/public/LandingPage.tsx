import React, { useState, useEffect } from 'react';
import { LandingPageConfig } from '../../types/index.js';
import {
  getStoredLandingConfig,
  LANDING_CONFIG_UPDATED_EVENT,
  buildWhatsAppUrl,
  DEFAULT_LANDING_CONFIG,
} from '../../utils/landingStorage.js';
import { landingApi } from '../../api/client.js';
import { HeroMediaSection } from './components/HeroMediaSection.js';
import { OfferCard } from './components/OfferCard.js';

export const LandingPage: React.FC = () => {
  const [config, setConfig] = useState<LandingPageConfig>(() => getStoredLandingConfig());

  useEffect(() => {
    // 1. Fetch remote config from edge/backend
    landingApi
      .getConfig(false)
      .then((data) => {
        if (data) setConfig(data);
      })
      .catch(() => {});

    // 2. Listen to live updates from CMS tab
    const handleUpdate = (e: any) => {
      if (e.detail) {
        setConfig(e.detail);
      }
    };

    window.addEventListener(LANDING_CONFIG_UPDATED_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(LANDING_CONFIG_UPDATED_EVENT, handleUpdate);
    };
  }, []);

  const headerWhatsappUrl = buildWhatsAppUrl(
    config.whatsapp_header_number || '201223770207',
    'مرحباً برايم واش، أود الاستفسار عن باقات الغسيل والعروض المتاحة'
  );

  return (
    <div className="min-h-screen bg-black text-slate-100 font-tajawal antialiased selection:bg-red-600 selection:text-white flex flex-col w-full max-w-full overflow-x-hidden">
      {/* 1. Glassmorphic Minimalist Luxury Top Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/85 backdrop-blur-xl px-3 sm:px-8 py-3 transition-colors select-none w-full">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          {/* Logo & Brand Matching POS Internal System EXACTLY */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0" dir="ltr">
            <span
              className="font-black tracking-wider text-white text-lg md:text-xl uppercase select-none font-mono"
              style={{
                textShadow: '0 0 8px rgba(239, 68, 68, 0.8), 0 0 16px rgba(220, 38, 38, 0.4)',
              }}
            >
              PRIME WASH
            </span>
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-full border border-red-500/40 bg-red-950/40 text-red-400 select-none shadow-[0_0_8px_rgba(239,68,68,0.2)] inline-flex items-center font-mono">
              OFFERS &amp; SHOWCASE
            </span>
          </div>

          {/* Action CTAs: Direct WhatsApp Action */}
          <div className="flex items-center shrink-0">
            <a
              href={headerWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-emerald-950/80 hover:bg-emerald-900/90 active:bg-emerald-950 text-emerald-300 hover:text-emerald-100 text-xs sm:text-sm font-semibold whitespace-nowrap border border-emerald-500/40 hover:border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.2)] transition-all active:scale-95"
              style={{ textDecoration: 'none' }}
            >
              <span>تواصل واتساب</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Public Body Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-6 sm:space-y-12 overflow-x-hidden">
        {/* Section 1: Hero Banner 1 */}
        <HeroMediaSection
          section={config.hero_section_1}
          badgeText="خدمة VIP فائقة الدقة"
          minHeightClass="min-h-[220px] sm:min-h-[380px] lg:min-h-[480px] aspect-[16/10] sm:aspect-[16/9] lg:aspect-[21/9]"
        />

        {/* Section 2: Two Interactive Offer Action Cards (Side-by-Side 2-Columns on All Screens) */}
        <section className="w-full max-w-4xl lg:max-w-5xl mx-auto space-y-3 sm:space-y-6 overflow-hidden">
          <div className="text-center space-y-1 sm:space-y-2 max-w-xl mx-auto px-2">
            <h2 className="text-lg sm:text-2xl md:text-3xl font-black text-white tracking-tight">
              أقوى العروض الحصرية لهذا الشهر
            </h2>
            <p className="text-[11px] sm:text-xs md:text-sm text-neutral-400 font-medium">
              اضغط على أي عرض لحجز موعدك فوراً والاستفادة من خصومات باقات برايم واش
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-6 w-full">
            <OfferCard card={config.offer_card_1} index={0} />
            <OfferCard card={config.offer_card_2} index={1} />
          </div>
        </section>

        {/* Section 3: Hero Banner 2 (Guarantees & BOM Quality) */}
        <HeroMediaSection
          section={config.hero_section_2}
          badgeText="جودة لا تضاهى وخامات أصلية 100%"
          minHeightClass="min-h-[190px] sm:min-h-[320px] lg:min-h-[400px] aspect-[16/10] sm:aspect-[16/9]"
        />
      </main>

      {/* Strictly Formatted Machine Code Minimalist Footer */}
      <footer className="w-full py-8 px-4 border-t border-neutral-900 bg-black text-center select-none mt-14">
        <div className="max-w-4xl mx-auto flex flex-col items-center justify-center gap-2.5">
          {/* Brand & Copyright */}
          <div className="text-xs sm:text-sm font-bold text-neutral-300 tracking-wide">
            &copy; 2026 <span className="text-white font-extrabold">Machine Code</span> — جميع الحقوق محفوظة
          </div>

          {/* Sub-headline */}
          <div className="text-[11px] sm:text-xs text-neutral-400 font-medium leading-relaxed">
            حلول برمجية لإدارة وتشغيل الأعمال &bull; ERP &bull; POS &bull; أنظمة مخصصة
          </div>

          {/* Founder & Contact Action Row */}
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 pt-1.5">
            <span className="text-[11px] sm:text-xs text-neutral-400 font-medium">
              م. مدحت العربي — Founder &amp; Software Engineer
            </span>

            <span className="hidden sm:inline text-neutral-700 font-bold">&bull;</span>

            <a
              href="https://wa.me/201223770207"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 rounded-lg text-[11px] sm:text-xs font-bold text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border border-neutral-800 hover:border-neutral-600 transition-all duration-200 active:scale-95"
              style={{
                textDecoration: 'none',
              }}
            >
              تواصل مع المطور
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
