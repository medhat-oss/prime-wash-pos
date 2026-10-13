/**
 * Prime Wash POS - Landing Page CMS Storage & State Management
 * Provides persistence, event bus broadcasting, and offline caching
 * for public visitor showcase and marketing offers.
 */

import { LandingPageConfig } from '../types/index.js';

const LANDING_CONFIG_KEY = 'cw_landing_config';
export const LANDING_CONFIG_UPDATED_EVENT = 'cw_landing_config_updated';

export const DEFAULT_LANDING_CONFIG: LandingPageConfig = {
  hero_section_1: {
    media_type: 'video',
    media_url: 'https://assets.mixkit.co/videos/preview/mixkit-washing-a-luxury-black-car-with-foam-41275-large.mp4',
    fallback_image_url: 'https://images.unsplash.com/photo-1601362840469-51e4d8d58785?auto=format&fit=crop&w=1600&q=80',
    show_overlay_text: true,
    title: 'برايم واش — العناية الفائقة والذكية بسيارتك',
    subtitle: 'تقنيات نانو سيراميك متطورة، رغوة ألمانية مخصصة، غسيل بخار دقيق، وتلميع احترافي يحافظ على بريق يدوم طويلاً',
  },
  offer_card_1: {
    id: 'offer-vip-wax',
    title: 'عرض غسيل VIP + طبقة واكس كارنوبا إيطالي',
    badge: 'الأكثر طلباً',
    media_type: 'image',
    media_url: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=1000&q=80',
    fallback_image_url: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=1000&q=80',
    whatsapp_number: '201223770207',
    whatsapp_prefilled_text: 'مرحباً برايم واش، أود الاستفسار والحجز لعرض (غسيل VIP + طبقة واكس كارنوبا إيطالي)',
  },
  offer_card_2: {
    id: 'offer-nano-ceramic',
    title: 'باقة حماية النانو سيراميك ومعالجة الفرش الداخلي',
    badge: 'حماية فائقة',
    media_type: 'image',
    media_url: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=1000&q=80',
    fallback_image_url: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=1000&q=80',
    whatsapp_number: '201223770207',
    whatsapp_prefilled_text: 'مرحباً برايم واش، أود الاستفسار والحجز لباقة (حماية النانو سيراميك ومعالجة الفرش الداخلي)',
  },
  hero_section_2: {
    media_type: 'image',
    media_url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1600&q=80',
    fallback_image_url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1600&q=80',
    show_overlay_text: true,
    title: 'خامات عالمية معتمدة ومتوازنة الحموضة (pH Neutral)',
    subtitle: 'نضمن لك حماية تامة لطلاء الهيكل، الجلد، والزجاج بدون أي خدوش مع فريق فني مدرب على أعلى المعايير العالمية',
  },
  whatsapp_header_number: '201223770207',
  updated_at: new Date().toISOString(),
};

/**
 * Retrieve saved Landing Page CMS config from localStorage with defaults fallback
 */
export const getStoredLandingConfig = (): LandingPageConfig => {
  if (typeof window === 'undefined') return { ...DEFAULT_LANDING_CONFIG };
  try {
    const raw = localStorage.getItem(LANDING_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          ...DEFAULT_LANDING_CONFIG,
          ...parsed,
          hero_section_1: { ...DEFAULT_LANDING_CONFIG.hero_section_1, ...(parsed.hero_section_1 || {}) },
          offer_card_1: { ...DEFAULT_LANDING_CONFIG.offer_card_1, ...(parsed.offer_card_1 || {}) },
          offer_card_2: { ...DEFAULT_LANDING_CONFIG.offer_card_2, ...(parsed.offer_card_2 || {}) },
          hero_section_2: { ...DEFAULT_LANDING_CONFIG.hero_section_2, ...(parsed.hero_section_2 || {}) },
        };
      }
    }
  } catch (err) {
    console.error('Error reading landing config from localStorage:', err);
  }
  return { ...DEFAULT_LANDING_CONFIG };
};

/**
 * Save Landing Page CMS config to localStorage and dispatch update event
 */
export const saveStoredLandingConfig = (data: Partial<LandingPageConfig>): LandingPageConfig => {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_LANDING_CONFIG, ...(data || {}) };
  }
  if (!data || typeof data !== 'object') {
    return getStoredLandingConfig();
  }
  try {
    const current = getStoredLandingConfig();
    const updated: LandingPageConfig = {
      ...current,
      ...data,
      hero_section_1: { ...current.hero_section_1, ...(data.hero_section_1 || {}) },
      offer_card_1: { ...current.offer_card_1, ...(data.offer_card_1 || {}) },
      offer_card_2: { ...current.offer_card_2, ...(data.offer_card_2 || {}) },
      hero_section_2: { ...current.hero_section_2, ...(data.hero_section_2 || {}) },
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(LANDING_CONFIG_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(LANDING_CONFIG_UPDATED_EVENT, { detail: updated }));
    return updated;
  } catch (err) {
    console.error('Error saving landing config to localStorage:', err);
    return { ...DEFAULT_LANDING_CONFIG, ...(data || {}) };
  }
};

/**
 * Format WhatsApp URL with international clean number and pre-filled inquiry text
 */
export const buildWhatsAppUrl = (phone?: string, text?: string): string => {
  const cleanPhone = (phone || '201223770207').replace(/\D/g, '');
  const message = text ? encodeURIComponent(text.trim()) : '';
  return `https://wa.me/${cleanPhone}${message ? `?text=${message}` : ''}`;
};
