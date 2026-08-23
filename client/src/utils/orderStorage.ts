import { Order } from '../types/index.js';

const SHIFT_ORDERS_KEY = 'cw_shift_orders';
const ALL_ORDERS_KEY = 'cw_all_orders';
const LEGACY_ORDERS_KEY = 'pos_local_orders';

export const getStoredAllOrders = (): Order[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ALL_ORDERS_KEY) || localStorage.getItem(LEGACY_ORDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
};

export const getStoredShiftOrders = (shiftStartTime?: string): Order[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SHIFT_ORDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}

  // Fallback: extract today's orders from all orders
  const all = getStoredAllOrders();
  if (shiftStartTime) {
    const startDate = new Date(shiftStartTime);
    return all.filter((o) => new Date(o.created_at) >= startDate);
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  return all.filter((o) => o.created_at && o.created_at.slice(0, 10) === todayStr);
};

export const appendNewOrder = (order: Order): void => {
  if (typeof window === 'undefined') return;
  try {
    // 1. Append to cw_all_orders
    const all = getStoredAllOrders();
    const updatedAll = [order, ...all.filter((o) => o.id !== order.id)];
    localStorage.setItem(ALL_ORDERS_KEY, JSON.stringify(updatedAll.slice(0, 500)));
    localStorage.setItem(LEGACY_ORDERS_KEY, JSON.stringify(updatedAll.slice(0, 100)));

    // 2. Append to cw_shift_orders
    const shift = getStoredShiftOrders();
    const updatedShift = [order, ...shift.filter((o) => o.id !== order.id)];
    localStorage.setItem(SHIFT_ORDERS_KEY, JSON.stringify(updatedShift));
  } catch {}
};

export const clearStoredShiftOrders = (): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SHIFT_ORDERS_KEY);
  } catch {}
};
