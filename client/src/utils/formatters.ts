/**
 * Centralized formatting utilities for Egyptian Car Wash ERP & POS
 */

/**
 * Format a number as Egyptian Pounds (ج.م)
 */
export const formatEGP = (amount: number | string | null | undefined): string => {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return '0.00 ج.م';
  }
  return `${Number(amount).toFixed(2)} ج.م`;
};

export const formatCurrency = formatEGP;

/**
 * Format raw grams into readable grams or kilograms
 */
export const formatGrams = (grams: number | string | null | undefined): string => {
  if (grams === null || grams === undefined || isNaN(Number(grams))) {
    return '0 g';
  }
  const g = Number(grams);
  if (g >= 1000) {
    return `${(g / 1000).toFixed(2)} كجم (${g.toLocaleString()}g)`;
  }
  return `${g.toLocaleString()} g`;
};

/**
 * Format Date & Time in Arabic Egyptian locale
 */
export const formatDateTime = (date: string | Date | null | undefined): string => {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  return d.toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Format Time only (HH:MM AM/PM)
 */
export const formatTime = (date: string | Date | null | undefined): string => {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  return d.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Format Date only (YYYY-MM-DD)
 */
export const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  return d.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Format a Date object or YYYY-MM-DD string as standard numeric DD-MM-YYYY without timezone shift
 */
export const formatLocalDateStr = (dateStrOrDate: string | Date | null | undefined): string => {
  if (!dateStrOrDate) return '-';
  if (typeof dateStrOrDate === 'string') {
    const cleanStr = dateStrOrDate.split('T')[0].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
      const [year, month, day] = cleanStr.split('-');
      return `${day}-${month}-${year}`;
    }
  }
  const d = typeof dateStrOrDate === 'string' ? new Date(dateStrOrDate) : dateStrOrDate;
  if (isNaN(d.getTime())) return '-';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}-${month}-${year}`;
};

/**
 * Get local YYYY-MM-DD string from a Date object
 */
export const toLocalISODate = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Resolves media URLs (Cloudinary, Absolute URLs, or Local /uploads paths)
 */
export const resolveMediaUrl = (url?: string | null): string => {
  if (!url) return '';
  const trimmed = url.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  const backendBase = (import.meta as any).env?.VITE_API_URL
    ? (import.meta as any).env.VITE_API_URL.replace(/\/api\/?$/, '')
    : 'http://localhost:3000';

  return `${backendBase}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
};

/**
 * Calculate standard 14% VAT tax breakdown from gross total price (inclusive of VAT)
 */
export const calculateTaxBreakdown = (
  totalPrice: number,
  rate = 0.14
): { subtotal: number; taxAmount: number } => {
  if (!totalPrice || isNaN(totalPrice) || totalPrice <= 0) {
    return { subtotal: 0, taxAmount: 0 };
  }
  const subtotal = Number((totalPrice / (1 + rate)).toFixed(2));
  const taxAmount = Number((totalPrice - subtotal).toFixed(2));
  return { subtotal, taxAmount };
};

/**
 * Unified Payment Method Arabic Labels
 */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي (كاش)',
  card: 'بطاقة ائتمان / فيزا (Card)',
  transfer: 'محفظة إلكترونية / إنستاباي',
  split: 'دفع مجزأ',
};

/**
 * Resolves localized payment method label with fallback
 */
export const getPaymentMethodLabel = (method: string | null | undefined): string => {
  if (!method) return '-';
  return PAYMENT_METHOD_LABELS[method] || method;
};

/**
 * HTML Entity Escaper for Safe Thermal, Document & Iframe Rendering
 * Neutralizes potential XSS when interpolating dynamic user input into raw HTML templates.
 */
export const escapeHtml = (str: string | number | null | undefined): string => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};



