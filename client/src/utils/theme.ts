import { PosSettings } from '../types/index.js';

const STORAGE_KEY = 'cw_pos_appearance_theme';

export const defaultTheme: Partial<PosSettings> = {
  pos_background_type: 'video',
  pos_background_url: 'https://res.cloudinary.com/dwsxotewe/video/upload/v1787166944/car_wash_media/q40i7grywsgvya85nedc.mp4',
  pos_background_opacity: 0.30,
  primary_color: '#bd0000',
  secondary_color: '#570505',
  accent_color: '#bd0000',
  card_bg_color: 'rgba(66, 0, 0, 0.82)',
  border_color: 'rgba(194, 0, 0, 0.70)',
  app_bg_color: '#000000',
  header_bg_color: 'rgba(46, 0, 0, 0.85)',
};


/**
 * Apply theme colors and CSS variables to document.documentElement
 */
export const applyThemeToRoot = (settings?: Partial<PosSettings>) => {
  if (typeof document === 'undefined') return;

  const primary = settings?.primary_color || defaultTheme.primary_color || '#bd0000';
  const secondary = settings?.secondary_color || defaultTheme.secondary_color || '#570505';
  const accent = settings?.accent_color || defaultTheme.accent_color || '#bd0000';
  const cardBg = settings?.card_bg_color || defaultTheme.card_bg_color || 'rgba(66, 0, 0, 0.82)';
  const borderColor = settings?.border_color || defaultTheme.border_color || 'rgba(194, 0, 0, 0.70)';
  const appBg = settings?.app_bg_color || defaultTheme.app_bg_color || '#000000';
  const headerBg = settings?.header_bg_color || defaultTheme.header_bg_color || 'rgba(46, 0, 0, 0.85)';

  const root = document.documentElement;
  root.style.setProperty('--color-primary', primary);
  root.style.setProperty('--color-secondary', secondary);
  root.style.setProperty('--color-accent', accent);
  root.style.setProperty('--card-bg', cardBg);
  root.style.setProperty('--border-color', borderColor);
  root.style.setProperty('--app-bg', appBg);
  root.style.setProperty('--header-bg', headerBg);

  if (settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }
};

/**
 * Dispatch real-time theme change event across the application
 */
export const broadcastThemeUpdate = (settings: PosSettings) => {
  applyThemeToRoot(settings);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pos-settings-updated', { detail: settings }));
  }
};

/**
 * Load cached theme from localStorage on initial page startup
 */
export const loadStoredTheme = (): Partial<PosSettings> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      applyThemeToRoot(parsed);
      return parsed;
    }
  } catch {}
  applyThemeToRoot(defaultTheme);
  return defaultTheme;
};

/**
 * Get current stored theme synchronously with all defaults guaranteed
 */
export const getStoredTheme = (): PosSettings => {
  const stored = loadStoredTheme();
  return {
    id: stored.id,
    pos_background_url: stored.pos_background_url || 'https://res.cloudinary.com/dwsxotewe/video/upload/v1787166944/car_wash_media/q40i7grywsgvya85nedc.mp4',
    pos_background_type: stored.pos_background_type || 'video',
    pos_background_opacity: stored.pos_background_opacity ?? 0.30,
    primary_color: stored.primary_color || '#bd0000',
    secondary_color: stored.secondary_color || '#570505',
    accent_color: stored.accent_color || '#bd0000',
    card_bg_color: stored.card_bg_color || 'rgba(66, 0, 0, 0.82)',
    border_color: stored.border_color || 'rgba(194, 0, 0, 0.70)',
    app_bg_color: stored.app_bg_color || '#000000',
    header_bg_color: stored.header_bg_color || 'rgba(46, 0, 0, 0.85)',
  };
};


/**
 * Helper: parse rgba or hex to { hex, alpha }
 */
export function parseColorAndAlpha(
  colorStr: string,
  defaultHex: string = '#0f172a',
  defaultAlpha: number = 0.75
): { hex: string; alpha: number } {
  if (!colorStr) return { hex: defaultHex, alpha: defaultAlpha };
  const trimmed = colorStr.trim();
  if (trimmed.startsWith('#')) {
    if (trimmed.length === 7) return { hex: trimmed, alpha: defaultAlpha };
    if (trimmed.length === 9) {
      const alphaHex = trimmed.slice(7, 9);
      const alpha = Math.round((parseInt(alphaHex, 16) / 255) * 100) / 100;
      return { hex: trimmed.slice(0, 7), alpha };
    }
  }
  const rgbaMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10);
    const g = parseInt(rgbaMatch[2], 10);
    const b = parseInt(rgbaMatch[3], 10);
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : defaultAlpha;
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return {
      hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
      alpha: Math.min(1, Math.max(0, isNaN(a) ? defaultAlpha : a)),
    };
  }
  return { hex: defaultHex, alpha: defaultAlpha };
}

/**
 * Helper: convert hex and alpha into rgba string
 */
export function hexAndAlphaToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}



