/**
 * Offline Sync Queue Manager for Prime Wash ERP & POS
 * Handles indestructible offline order capture and automatic background synchronization.
 */

import { reconcileSyncedOrder } from './orderStorage.js';

const SYNC_QUEUE_STORAGE_KEY = 'cw_offline_order_queue';

export interface QueuedOrder {
  tempId: string;
  orderData: {
    service_id: string;
    car_plate?: string;
    car_type?: string;
    customer_name?: string;
    customer_phone?: string;
    payment_method?: 'cash' | 'card' | 'transfer' | 'split';
    assigned_employee_id?: string;
    notes?: string;
    cashier_id?: string;
    cashier_name?: string;
    shift_id?: string;
    [key: string]: any;
  };
  enqueuedAt: string;
  retryCount: number;
}

/**
 * Retrieve all pending queued orders from localStorage
 */
export const getOfflineSyncQueue = (): QueuedOrder[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to read offline sync queue:', err);
    return [];
  }
};

/**
 * Save pending sync queue to localStorage and notify UI
 */
export const saveOfflineSyncQueue = (queue: QueuedOrder[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SYNC_QUEUE_STORAGE_KEY, JSON.stringify(queue));
    notifyQueueChange(queue.length);
  } catch (err) {
    console.error('Failed to save offline sync queue:', err);
  }
};

import { enqueueSyncAction } from '../sync/syncEngine.js';

/**
 * Enqueue a newly created order when offline or when network request fails
 */
export const enqueueOfflineOrder = (orderData: QueuedOrder['orderData']): QueuedOrder => {
  const queue = getOfflineSyncQueue();
  const queuedItem: QueuedOrder = {
    tempId: orderData.id || `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    orderData,
    enqueuedAt: new Date().toISOString(),
    retryCount: 0,
  };

  queue.push(queuedItem);
  saveOfflineSyncQueue(queue);

  // Also bridge into primary IndexedDB Sync Engine
  enqueueSyncAction(
    'CREATE_ORDER',
    orderData,
    orderData.order_code || orderData.id || queuedItem.tempId
  ).catch((e) => console.warn('[SyncEngine bridge error]', e));

  console.log(`📥 [Offline Sync Queue] Enqueued order (${queuedItem.tempId}). Pending items: ${queue.length}`);
  return queuedItem;
};

/**
 * Remove an order from the offline queue by tempId
 */
export const dequeueOfflineOrder = (tempId: string): void => {
  const queue = getOfflineSyncQueue();
  const updated = queue.filter((item) => item.tempId !== tempId);
  saveOfflineSyncQueue(updated);
};

/**
 * Get count of pending offline orders
 */
export const getOfflineQueueCount = (): number => {
  return getOfflineSyncQueue().length;
};

/**
 * Broadcast event when offline sync queue state changes
 */
const notifyQueueChange = (count: number) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('offline-sync-queue-updated', {
        detail: { count },
      })
    );
  }
};

let isProcessingQueue = false;

/**
 * Process the queue by sending pending orders directly to Neon DB (NO recursion, NO duplicate fallback)
 */
export const processOfflineSyncQueue = async (
  syncDirectFn: (data: any) => Promise<any>
): Promise<{ processed: number; failed: number }> => {
  if (isProcessingQueue) {
    return { processed: 0, failed: 0 };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { processed: 0, failed: 0 };
  }

  const queue = getOfflineSyncQueue();
  if (queue.length === 0) {
    return { processed: 0, failed: 0 };
  }

  isProcessingQueue = true;
  let processed = 0;
  let failed = 0;

  console.log(`🔄 [Offline Sync Queue] Processing ${queue.length} pending orders with Cloudflare/Neon DB...`);

  try {
    for (const item of [...queue]) {
      try {
        const syncedOrder = await syncDirectFn(item.orderData);
        if (syncedOrder) {
          reconcileSyncedOrder(item.tempId, syncedOrder);
        }
        dequeueOfflineOrder(item.tempId);
        processed++;
        console.log(`✅ [Offline Sync Queue] Successfully synced order ${item.tempId}`);
      } catch (err: any) {
        console.warn(`⚠️ [Offline Sync Queue] Sync paused for order ${item.tempId}:`, err?.message);
        item.retryCount = (item.retryCount || 0) + 1;
        failed++;
        // Break early on network or server error to avoid continuous hammering
        break;
      }
    }
  } finally {
    isProcessingQueue = false;
  }

  return { processed, failed };
};
