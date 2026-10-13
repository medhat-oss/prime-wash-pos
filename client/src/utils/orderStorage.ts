import { Order } from '../types/index.js';
import { getAllFromDb, putInDb, deleteFromDb, bulkPutInDb } from '../db/indexedDB.js';

const SHIFT_ORDERS_KEY = 'cw_shift_orders';
const ALL_ORDERS_KEY = 'cw_all_orders';
const LEGACY_ORDERS_KEY = 'pos_local_orders';

// In-Memory Synchronous Cache for 0ms reads
let inMemoryOrdersCache: Order[] | null = null;

/**
 * Initialize in-memory cache from IndexedDB on startup
 */
export async function initOrdersFromIndexedDB(): Promise<Order[]> {
  if (typeof window === 'undefined') return [];
  try {
    const idbOrders = await getAllFromDb('orders');
    if (Array.isArray(idbOrders) && idbOrders.length > 0) {
      inMemoryOrdersCache = deduplicateOrders(idbOrders);
      return inMemoryOrdersCache;
    }
  } catch (e) {
    console.warn('[orderStorage] IDB init fallback:', e);
  }
  inMemoryOrdersCache = getStoredAllOrders();
  return inMemoryOrdersCache;
}

/**
 * Strict deduplication helper across all orders:
 * Guarantees each order is counted EXACTLY ONCE by order_code, id, or client_order_id.
 * If both local and server copies exist, the server copy (or synced copy) takes precedence.
 */
export const deduplicateOrders = (ordersList: Order[]): Order[] => {
  if (!Array.isArray(ordersList) || ordersList.length === 0) return [];
  const result: Order[] = [];
  const seenCodes = new Set<string>();
  const seenIds = new Set<string>();

  for (const order of ordersList) {
    if (!order) continue;
    const code = order.order_code ? order.order_code.trim() : null;
    const id = order.id ? String(order.id).trim() : null;
    const clientId = (order as any).client_order_id ? String((order as any).client_order_id).trim() : null;

    // Check if this order was already added
    const isDuplicate =
      (code && seenCodes.has(code)) ||
      (id && seenIds.has(id)) ||
      (clientId && seenIds.has(clientId));

    if (isDuplicate) {
      // If the new one is synced or from server, update/replace the unsynced local copy
      const existingIdx = result.findIndex(
        (r) =>
          (code && r.order_code === code) ||
          (id && r.id === id) ||
          (clientId && (r.id === clientId || (r as any).client_order_id === clientId))
      );
      if (existingIdx !== -1) {
        const existing = result[existingIdx];
        if (order.is_synced && !existing.is_synced) {
          result[existingIdx] = { ...existing, ...order };
        } else if (!existing.is_synced) {
          result[existingIdx] = { ...existing, ...order };
        }
      }
      continue;
    }

    if (code) seenCodes.add(code);
    if (id) seenIds.add(id);
    if (clientId) seenIds.add(clientId);
    result.push(order);
  }

  return result;
};

export const getStoredAllOrders = (): Order[] => {
  if (inMemoryOrdersCache !== null && Array.isArray(inMemoryOrdersCache)) {
    return inMemoryOrdersCache;
  }

  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ALL_ORDERS_KEY) || localStorage.getItem(LEGACY_ORDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        inMemoryOrdersCache = deduplicateOrders(parsed);
        return inMemoryOrdersCache;
      }
    }
  } catch {}
  return [];
};

export const getStoredShiftOrders = (shiftStartTime?: string, shiftId?: string): Order[] => {
  if (typeof window === 'undefined') return [];
  
  let shiftOrders: Order[] = [];
  try {
    const raw = localStorage.getItem(SHIFT_ORDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        shiftOrders = parsed;
      }
    }
  } catch {}

  // If shiftOrders is empty, also check all orders as fallback
  if (shiftOrders.length === 0 && (shiftStartTime || shiftId)) {
    shiftOrders = getStoredAllOrders();
  }

  let filtered: Order[] = [];

  // Strict filtering by shiftStartTime / shiftId
  if (shiftStartTime || shiftId) {
    const startMs = shiftStartTime ? new Date(shiftStartTime).getTime() : 0;
    filtered = shiftOrders.filter((o) => {
      if (shiftId && o.shift_id) {
        return o.shift_id === shiftId;
      }
      if (startMs > 0 && o.created_at) {
        return new Date(o.created_at).getTime() >= startMs;
      }
      return false;
    });
  } else {
    // Fallback: today's orders
    const todayStr = new Date().toLocaleDateString('en-CA');
    filtered = shiftOrders.filter(
      (o) =>
        o.created_at &&
        (o.created_at.slice(0, 10) === todayStr ||
          new Date(o.created_at).toLocaleDateString('en-CA') === todayStr)
    );
  }

  return deduplicateOrders(filtered);
};

export const saveStoredAllOrders = (orders: Order[]): void => {
  inMemoryOrdersCache = orders;
  if (typeof window === 'undefined') return;

  // 1. Asynchronous IndexedDB Persistence
  bulkPutInDb('orders', orders).catch((e) => console.warn('[IDB saveStoredAllOrders error]', e));

  // 2. LocalStorage Backup Snapshot
  try {
    localStorage.setItem(ALL_ORDERS_KEY, JSON.stringify(orders.slice(0, 500)));
    localStorage.setItem(LEGACY_ORDERS_KEY, JSON.stringify(orders.slice(0, 100)));
    window.dispatchEvent(new CustomEvent('cw_orders_updated', { detail: orders }));
    window.dispatchEvent(new Event('cw_orders_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

export const saveStoredShiftOrders = (orders: Order[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SHIFT_ORDERS_KEY, JSON.stringify(orders));
    window.dispatchEvent(new CustomEvent('cw_orders_updated', { detail: orders }));
    window.dispatchEvent(new Event('cw_orders_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

export const updateStoredOrder = (orderId: string, updates: Partial<Order>): Order | null => {
  if (typeof window === 'undefined' || !orderId) return null;
  try {
    const all = getStoredAllOrders();
    let updatedOrder: Order | null = null;
    const updatedAll = all.map((o) => {
      if (o.id === orderId || o.order_code === orderId) {
        updatedOrder = { ...o, ...updates, updated_at: new Date().toISOString() };
        return updatedOrder;
      }
      return o;
    });

    if (updatedOrder) {
      saveStoredAllOrders(updatedAll);

      // Async single put into IndexedDB
      putInDb('orders', updatedOrder).catch(() => {});

      // Also update in shift orders if present
      const shiftOrders = getStoredShiftOrders();
      const updatedShift = shiftOrders.map((o) => {
        if (o.id === orderId || o.order_code === orderId) {
          return { ...o, ...updates, updated_at: new Date().toISOString() };
        }
        return o;
      });
      saveStoredShiftOrders(updatedShift);
    }

    return updatedOrder;
  } catch {
    return null;
  }
};

/**
 * Reconcile a synced order from background queue into local storage & IndexedDB
 */
export const reconcileSyncedOrder = (tempId: string, serverOrder: Order): void => {
  if (typeof window === 'undefined' || !serverOrder) return;
  try {
    const all = getStoredAllOrders();
    const index = all.findIndex(
      (o) => o.id === tempId || o.order_code === serverOrder.order_code || (o.service_id === serverOrder.service_id && !o.is_synced)
    );
    if (index !== -1) {
      all[index] = {
        ...all[index],
        ...serverOrder,
        sync_status: 'synced',
        is_synced: true,
      };
      saveStoredAllOrders(all);
      putInDb('orders', all[index]).catch(() => {});
    } else if (!all.some((o) => o.id === serverOrder.id)) {
      const newOrder = { ...serverOrder, sync_status: 'synced' as const, is_synced: true };
      all.unshift(newOrder);
      saveStoredAllOrders(all);
      putInDb('orders', newOrder).catch(() => {});
    }

    const shiftOrders = getStoredShiftOrders();
    const shiftIndex = shiftOrders.findIndex(
      (o) => o.id === tempId || o.order_code === serverOrder.order_code || (o.service_id === serverOrder.service_id && !o.is_synced)
    );
    if (shiftIndex !== -1) {
      shiftOrders[shiftIndex] = {
        ...shiftOrders[shiftIndex],
        ...serverOrder,
        sync_status: 'synced',
        is_synced: true,
      };
      saveStoredShiftOrders(shiftOrders);
    }
  } catch {}
};

/**
 * Checks whether an order is officially linked/submitted/approved by ETA
 */
export const isOrderEtaCompliant = (order: Order): boolean => {
  if (!order) return false;
  return (
    order.eta_status === 'valid' ||
    order.eta_status === 'submitted' ||
    (order.eta_status as any) === 'synced' ||
    Boolean(order.eta_uuid) ||
    Boolean((order as any).is_synced)
  );
};

/**
 * Cascading Shift Deletion Logic Guarded by ETA Status:
 */
export const cascadeDeleteShiftOrders = (
  shiftId: string,
  shiftOrders?: Order[],
  shiftStartTime?: string,
  shiftEndTime?: string
): { deletedCount: number; preservedCount: number } => {
  if (typeof window === 'undefined') return { deletedCount: 0, preservedCount: 0 };

  const allOrders = getStoredAllOrders();
  const shiftOrderIds = new Set<string>();

  if (Array.isArray(shiftOrders) && shiftOrders.length > 0) {
    shiftOrders.forEach((o) => {
      if (o && o.id) shiftOrderIds.add(o.id);
      if (o && o.order_code) shiftOrderIds.add(o.order_code);
    });
  }

  const startMs = shiftStartTime ? new Date(shiftStartTime).getTime() : 0;
  const endMs = shiftEndTime ? new Date(shiftEndTime).getTime() : 0;

  let deletedCount = 0;
  let preservedCount = 0;

  const remainingAllOrders: Order[] = [];

  for (const order of allOrders) {
    const matchesId = order.shift_id === shiftId || shiftOrderIds.has(order.id) || shiftOrderIds.has(order.order_code);
    const matchesTime =
      startMs > 0 &&
      endMs > 0 &&
      order.created_at &&
      new Date(order.created_at).getTime() >= startMs &&
      new Date(order.created_at).getTime() <= endMs;

    const isAssociatedWithShift = matchesId || matchesTime;

    if (!isAssociatedWithShift) {
      remainingAllOrders.push(order);
      continue;
    }

    if (isOrderEtaCompliant(order)) {
      preservedCount++;
      const preserved = {
        ...order,
        shift_id: 'unlinked_archived_shift',
        notes: order.notes ? `${order.notes} | [تم أرشفة الوردية الأصلية]` : '[تم أرشفة الوردية الأصلية]',
      };
      remainingAllOrders.push(preserved);
      putInDb('orders', preserved).catch(() => {});
    } else {
      deletedCount++;
      deleteFromDb('orders', order.id).catch(() => {});
    }
  }

  saveStoredAllOrders(remainingAllOrders);

  // Clean up cw_shift_orders
  try {
    const raw = localStorage.getItem(SHIFT_ORDERS_KEY);
    if (raw) {
      const parsed: Order[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const remainingShift = parsed.filter((o) => {
          const matches =
            o.shift_id === shiftId || shiftOrderIds.has(o.id) || shiftOrderIds.has(o.order_code);
          if (!matches) return true;
          return isOrderEtaCompliant(o);
        });
        saveStoredShiftOrders(remainingShift);
      }
    }
  } catch {}

  window.dispatchEvent(new CustomEvent('cw_orders_updated'));
  window.dispatchEvent(new Event('cw_orders_updated'));
  window.dispatchEvent(new Event('storage'));

  return { deletedCount, preservedCount };
};

export const appendNewOrder = (order: Order): void => {
  if (typeof window === 'undefined') return;
  try {
    const orderWithSyncStatus: Order = {
      ...order,
      sync_status: order.is_synced ? 'synced' : (order.sync_status || 'pending'),
    };

    // 1. Append to inMemory & cw_all_orders
    const all = getStoredAllOrders();
    const updatedAll = [orderWithSyncStatus, ...all.filter((o) => o.id !== order.id)];
    inMemoryOrdersCache = updatedAll;

    // Async IDB persist
    putInDb('orders', orderWithSyncStatus).catch((e) => console.warn('[IDB appendNewOrder error]', e));

    localStorage.setItem(ALL_ORDERS_KEY, JSON.stringify(updatedAll.slice(0, 500)));
    localStorage.setItem(LEGACY_ORDERS_KEY, JSON.stringify(updatedAll.slice(0, 100)));

    // 2. Append to cw_shift_orders
    let currentShiftOrders: Order[] = [];
    try {
      const raw = localStorage.getItem(SHIFT_ORDERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) currentShiftOrders = parsed;
      }
    } catch {}

    const updatedShift = [orderWithSyncStatus, ...currentShiftOrders.filter((o) => o.id !== order.id)];
    localStorage.setItem(SHIFT_ORDERS_KEY, JSON.stringify(updatedShift));

    // Dispatch custom event for real-time updates
    window.dispatchEvent(new CustomEvent('cw_orders_updated', { detail: orderWithSyncStatus }));
    window.dispatchEvent(new Event('cw_orders_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

export const clearStoredShiftOrders = (): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SHIFT_ORDERS_KEY);
    window.dispatchEvent(new Event('cw_orders_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

/**
 * Clean up any lingering duplicate orders on startup
 */
export const pruneDuplicateOrders = (): void => {
  if (typeof window === 'undefined') return;
  try {
    const all = getStoredAllOrders();
    const dedupedAll = deduplicateOrders(all);
    if (dedupedAll.length !== all.length) {
      saveStoredAllOrders(dedupedAll);
    }

    const shift = getStoredShiftOrders();
    const dedupedShift = deduplicateOrders(shift);
    if (dedupedShift.length !== shift.length) {
      saveStoredShiftOrders(dedupedShift);
    }
  } catch {}
};

// Auto-run on load
if (typeof window !== 'undefined') {
  pruneDuplicateOrders();
}
