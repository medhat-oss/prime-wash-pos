/**
 * Prime Wash POS - Automated Telegram Bot Notification Service
 * Dispatches real-time alerts for Employee Check-in/Out, Raw Material Low Stock,
 * and Shift Closing Reports directly to management via Telegram Bot API.
 */

export interface TelegramSettings {
  bot_token: string;
  chat_id: string;
  is_enabled: boolean;
  updated_at?: string;
}

const TELEGRAM_SETTINGS_KEY = 'cw_telegram_settings';
const NOTIFIED_LOW_STOCK_KEY = 'cw_telegram_notified_low_stock';

export const TELEGRAM_SETTINGS_UPDATED_EVENT = 'cw_telegram_settings_updated';

export const DEFAULT_TELEGRAM_SETTINGS: TelegramSettings = {
  bot_token: '',
  chat_id: '',
  is_enabled: false,
};

/**
 * Formats a Date object into Cairo/Egypt standard timestamp
 */
export const getEgyptFormattedDateTime = (date: Date = new Date()): string => {
  try {
    return date.toLocaleString('ar-EG', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return date.toLocaleString('ar-EG');
  }
};

/**
 * Retrieve saved Telegram settings from localStorage
 */
export const getStoredTelegramSettings = (): TelegramSettings => {
  if (typeof window === 'undefined') return { ...DEFAULT_TELEGRAM_SETTINGS };
  try {
    const raw = localStorage.getItem(TELEGRAM_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          ...DEFAULT_TELEGRAM_SETTINGS,
          ...parsed,
        };
      }
    }
  } catch {}
  return { ...DEFAULT_TELEGRAM_SETTINGS };
};

/**
 * Persist Telegram configuration to localStorage and dispatch event
 */
export const saveStoredTelegramSettings = (data: Partial<TelegramSettings>): TelegramSettings => {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_TELEGRAM_SETTINGS, ...(data || {}) };
  }
  try {
    const current = getStoredTelegramSettings();
    const updated: TelegramSettings = {
      ...current,
      ...data,
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(TELEGRAM_SETTINGS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(TELEGRAM_SETTINGS_UPDATED_EVENT, { detail: updated }));
    window.dispatchEvent(new Event(TELEGRAM_SETTINGS_UPDATED_EVENT));
    window.dispatchEvent(new Event('storage'));
    return updated;
  } catch {
    return { ...DEFAULT_TELEGRAM_SETTINGS, ...(data || {}) };
  }
};

/**
 * Core Telegram Dispatcher using native fetch.
 * Silently resolves without throwing or interrupting UI operations.
 */
export const sendTelegramAlert = async (message: string): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  const settings = getStoredTelegramSettings();
  if (!settings.is_enabled || !settings.bot_token?.trim() || !settings.chat_id?.trim()) {
    return false;
  }

  const token = settings.bot_token.trim();
  const chatId = settings.chat_id.trim();

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json().catch(() => null);
    return Boolean(data?.ok);
  } catch (err) {
    console.warn('Telegram alert dispatch encountered network issue (silently bypassed):', err);
    return false;
  }
};

/**
 * 1. Employee Check-in Notification (تسجيل الحضور)
 */
export const notifyEmployeeCheckIn = async (
  employeeName: string,
  role?: string,
  dateTimeStr?: string
): Promise<void> => {
  const time = dateTimeStr || getEgyptFormattedDateTime();
  const text = `نظام PRIME WASH POS
تسجيل حضور موظف
اسم الموظف: ${employeeName}
المسمى الوظيفي: ${role || 'فني غسيل وتشغيل'}
التاريخ والوقت: ${time}`;

  await sendTelegramAlert(text).catch(() => {});
};

/**
 * 2. Employee Check-out Notification (تسجيل الانصراف)
 */
export const notifyEmployeeCheckOut = async (
  employeeName: string,
  hoursWorked: number,
  dateTimeStr?: string
): Promise<void> => {
  const time = dateTimeStr || getEgyptFormattedDateTime();
  const text = `نظام PRIME WASH POS
تسجيل انصراف موظف
اسم الموظف: ${employeeName}
ساعات العمل المحتسبة: ${Number(hoursWorked || 0).toFixed(2)} ساعة
التاريخ والوقت: ${time}`;

  await sendTelegramAlert(text).catch(() => {});
};

/**
 * 3. Raw Material Reorder Point Alert (نواقص المواد الخام بالجرام)
 * Guarded by deduplication: will only alert once per item crossing threshold until restocked.
 */
export const notifyLowStockAlert = async (
  itemId: string,
  itemName: string,
  remainingGrams: number,
  reorderThresholdGrams: number
): Promise<void> => {
  if (typeof window === 'undefined') return;

  // Deduplication guard check
  let notifiedMap: Record<string, boolean> = {};
  try {
    const raw = localStorage.getItem(NOTIFIED_LOW_STOCK_KEY);
    if (raw) notifiedMap = JSON.parse(raw) || {};
  } catch {}

  if (notifiedMap[itemId]) {
    // Already notified since last restock
    return;
  }

  // Mark as alerted
  notifiedMap[itemId] = true;
  try {
    localStorage.setItem(NOTIFIED_LOW_STOCK_KEY, JSON.stringify(notifiedMap));
  } catch {}

  const remainingKg = (remainingGrams / 1000).toFixed(2);
  const text = `نظام PRIME WASH POS
تنبيه وصول مادة خام لحد إعادة الطلب
اسم المادة: ${itemName}
الرصيد المتبقي: ${remainingGrams.toLocaleString()} جرام (${remainingKg} كجم)
حد إعادة الطلب: ${reorderThresholdGrams.toLocaleString()} جرام
الإجراء المطلوب: إعادة توريد وشراء المادة فوراً`;

  await sendTelegramAlert(text).catch(() => {});
};

/**
 * Clears deduplication flag when an item is restocked
 */
export const clearLowStockNotificationFlag = (itemId: string): void => {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(NOTIFIED_LOW_STOCK_KEY);
    if (raw) {
      const map: Record<string, boolean> = JSON.parse(raw) || {};
      if (map[itemId]) {
        delete map[itemId];
        localStorage.setItem(NOTIFIED_LOW_STOCK_KEY, JSON.stringify(map));
      }
    }
  } catch {}
};

/**
 * 4. Shift Close Report Notification (تقرير إقفال الوردية)
 */
export const notifyShiftClose = async (shift: {
  shift_code: string;
  cashier_name?: string;
  gross_sales: number;
  total_orders: number;
  actual_cash: number;
  variance: number;
  shift_end?: string;
}): Promise<void> => {
  const time = shift.shift_end ? getEgyptFormattedDateTime(new Date(shift.shift_end)) : getEgyptFormattedDateTime();
  const varianceFormatted =
    shift.variance === 0
      ? '0.00 ج.م (مطابق تماماً)'
      : shift.variance > 0
      ? `+${shift.variance.toFixed(2)} ج.م (زيادة)`
      : `${shift.variance.toFixed(2)} ج.م (عجز)`;

  const text = `نظام PRIME WASH POS
تقرير إقفال وردية
رقم الوردية: ${shift.shift_code}
الكاشير المسؤول: ${shift.cashier_name || 'الكاشير'}
ميعاد ووقت التقفيل: ${time}
إجمالي مبيعات الوردية: ${Number(shift.gross_sales || 0).toFixed(2)} ج.م
عدد الفواتير: ${shift.total_orders || 0}
النقدية بالدرج (الفعلي): ${Number(shift.actual_cash || 0).toFixed(2)} ج.م
الفارق (عجز / زيادة): ${varianceFormatted}`;

  await sendTelegramAlert(text).catch(() => {});
};

/**
 * Manual Test Notification Trigger
 */
export const sendTestTelegramNotification = async (
  overrideSettings?: Partial<TelegramSettings>
): Promise<{ success: boolean; message: string }> => {
  const settings = overrideSettings
    ? { ...getStoredTelegramSettings(), ...overrideSettings }
    : getStoredTelegramSettings();

  if (!settings.bot_token?.trim()) {
    return { success: false, message: 'يرجى إدخال رمز Bot Token الخاص بالبوت أولاً.' };
  }
  if (!settings.chat_id?.trim()) {
    return { success: false, message: 'يرجى إدخال معرف المحادثة أو القناة Chat ID أولاً.' };
  }

  const token = settings.bot_token.trim();
  const chatId = settings.chat_id.trim();
  const time = getEgyptFormattedDateTime();

  const text = `نظام PRIME WASH POS
رسالة اختبار الاتصال والربط البرمجي
تم بنجاح التحقق من ربط بوت التليجرام مع نظام نقاط البيع Prime Wash.
التاريخ والوقت: ${time}`;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    const data = await res.json().catch(() => null);
    if (data?.ok) {
      return { success: true, message: 'تم إرسال الإشعار التجريبي بنجاح إلى التليجرام!' };
    }
    return {
      success: false,
      message: `فشل الإرسال من خوادم تليجرام: ${data?.description || 'رمز Token أو Chat ID غير صحيح'}`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `تعذر الاتصال بخوادم تليجرام: ${err.message || 'يرجى التحقق من اتصال الإنترنت'}`,
    };
  }
};
