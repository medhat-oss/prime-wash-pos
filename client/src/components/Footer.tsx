import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer
      className="w-full py-6 px-4 border-t transition-colors duration-300 select-none text-center"
      style={{ borderColor: 'var(--border-color)' }}
    >
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center gap-2.5">
        
        {/* Brand & Copyright */}
        <div className="text-xs sm:text-sm font-bold text-neutral-200 tracking-wide">
          &copy; 2026 <span className="text-white font-extrabold">Machine Code</span> — جميع الحقوق محفوظة
        </div>

        {/* Sub-headline */}
        <div className="text-[11px] sm:text-xs text-neutral-400 font-medium leading-relaxed">
          حلول برمجية لإدارة وتشغيل الأعمال &bull; ERP &bull; POS &bull; أنظمة مخصصة
        </div>

        {/* Founder & Contact Action Row */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 pt-1">
          <span className="text-[11px] sm:text-xs text-neutral-300 font-medium">
            م. مدحت العربي — Founder &amp; Software Engineer
          </span>

          <span className="hidden sm:inline text-neutral-600 font-bold">&bull;</span>

          <a
            href="https://wa.me/201223770207"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 rounded-md text-[11px] sm:text-xs font-bold text-neutral-200 hover:text-white bg-white/5 hover:bg-white/10 border border-neutral-700 hover:border-red-600 transition-all duration-200 active:scale-95 shadow-sm"
            style={{
              textDecoration: 'none',
            }}
          >
            تواصل معنا
          </a>
        </div>

      </div>
    </footer>
  );
};

export default Footer;
