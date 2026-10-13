/**
 * Indestructible Offline Sync Engine for Prime Wash ERP & POS
 * Manages outbox queue in IndexedDB, handles FIFO dispatch, exponential backoff,
 * concurrency mutex locks, and network reconnect auto-flushing.
 */

import {
  getAllFromDb,
  putInDb,
  deleteFromDb,
  getFromDb,
  setAppMeta,
  getAppMeta,
  SyncQueueItem,
} from '../db/indexedDB.js';

export type SyncEngineStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatusPayload {
  status: SyncEngineStatus;
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
  lastError?: string;
}

export type SyncHandlerMap = {
  CREATE_ORDER: (payload: any) => Promise<any>;
  CANCEL_ORDER: (payload: any) => Promise<any>;
  CREATE_EXPENSE: (payload: any) => Promise<any>;
  UPDATE_EXPENSE: (payload: any) => Promise<any>;
  DELETE_EXPENSE: (payload: any) => Promise<any>;
  CLOCK_ACTION: (payload: any) => Promise<any>;
  START_SHIFT: (payload: any) => Promise<any>;
  CLOSE_SHIFT: (payload: any) => Promise<any>;
  RESTOCK_INVENTORY: (payload: any) => Promise<any>;
  CHANGE_ADMIN_PIN: (payload: any) => Promise<any>;
};

let isSyncing = false;
let syncHandlers: Partial<SyncHandlerMap> = {};
let lastSyncedTimestamp: string | null = null;
let syncIntervalId: any = null;
let lastSyncFailureTime = 0;

/**
 * Register action execution handlers
 */
export function registerSyncHandlers(handlers: Partial<SyncHandlerMap>) {
  syncHandlers = { ...syncHandlers, ...handlers };
}

/**
 * Enqueue a new mutation into the outbox queue in IndexedDB
 */
export async function enqueueSyncAction(
  action_type: SyncQueueItem['action_type'],
  payload: any,
  idempotency_key?: string
): Promise<SyncQueueItem> {
  const item: SyncQueueItem = {
    id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    action_type,
    payload,
    idempotency_key: idempotency_key || payload?.order_code || payload?.id || `idem_${Date.now()}`,
    created_at: new Date().toISOString(),
    retry_count: 0,
    max_retries: 5,
    status: 'pending',
  };

  await putInDb('sync_queue', item);
  console.log(`📥 [Sync Queue] Enqueued ${action_type} (${item.idempotency_key})`);

  // Notify UI
  emitSyncStatus();

  // Optimistically trigger sync in background if online
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    triggerSyncQueueProcess().catch(() => {});
  }

  return item;
}

/**
 * Get all sync queue items from IndexedDB
 */
export async function getSyncQueueItems(): Promise<SyncQueueItem[]> {
  const items = await getAllFromDb('sync_queue');
  return items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

/**
 * Get count of pending sync items
 */
export async function getPendingSyncCount(): Promise<number> {
  const items = await getSyncQueueItems();
  return items.filter((i) => i.status === 'pending' || i.status === 'in_flight').length;
}

/**
 * Get count of failed sync items
 */
export async function getFailedSyncCount(): Promise<number> {
  const items = await getSyncQueueItems();
  return items.filter((i) => i.status === 'failed').length;
}

/**
 * Broadcast sync status to UI components
 */
export async function emitSyncStatus(currentStatus?: SyncEngineStatus, lastError?: string) {
  if (typeof window === 'undefined') return;

  const items = await getSyncQueueItems();
  const pending = items.filter((i) => i.status === 'pending' || i.status === 'in_flight').length;
  const failed = items.filter((i) => i.status === 'failed').length;

  let status: SyncEngineStatus = currentStatus || 'idle';
  if (!currentStatus) {
    if (!navigator.onLine) {
      status = 'offline';
    } else if (isSyncing) {
      status = 'syncing';
    } else if (failed > 0) {
      status = 'error';
    } else {
      status = 'idle';
    }
  }

  const payload: SyncStatusPayload = {
    status,
    pendingCount: pending,
    failedCount: failed,
    lastSyncedAt: lastSyncedTimestamp,
    lastError,
  };

  window.dispatchEvent(new CustomEvent('sync-status-changed', { detail: payload }));
}

/**
 * Main FIFO Outbox Processor
 */
export async function triggerSyncQueueProcess(): Promise<{
  processed: number;
  failed: number;
  skipped: boolean;
}> {
  if (isSyncing) {
    return { processed: 0, failed: 0, skipped: true };
  }

  // Strict 5-second backoff cooldown between transient retry attempts to protect UI thread
  const now = Date.now();
  if (now - lastSyncFailureTime < 5000) {
    return { processed: 0, failed: 0, skipped: true };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    emitSyncStatus('offline');
    return { processed: 0, failed: 0, skipped: true };
  }

  const items = await getSyncQueueItems();

  // PROACTIVE PURGE: Aggressively discard any stuck or failed START_SHIFT items (>1 retries or failed)
  const stuckStartShifts = items.filter(
    (i) => i.action_type === 'START_SHIFT' && (i.status === 'failed' || (i.retry_count || 0) >= 1)
  );
  for (const shift of stuckStartShifts) {
    console.warn(
      `🧹 [Sync Engine] Auto-purging obsolete stuck START_SHIFT (${shift.idempotency_key}, retries=${shift.retry_count}, status=${shift.status})`
    );
    await deleteFromDb('sync_queue', shift.id);
  }

  // Refresh items after proactive purge
  const activeItems = stuckStartShifts.length > 0 ? await getSyncQueueItems() : items;
  const pendingItems = activeItems.filter((i) => i.status === 'pending');

  if (pendingItems.length === 0) {
    emitSyncStatus('idle');
    return { processed: stuckStartShifts.length, failed: 0, skipped: true };
  }

  isSyncing = true;
  emitSyncStatus('syncing');

  let processed = stuckStartShifts.length;
  let failed = 0;

  console.log(`🔄 [Sync Engine] Flushing ${pendingItems.length} outbox items to cloud...`);

  try {
    for (const item of pendingItems) {
      // Concurrency check before each dispatch
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        break;
      }

      const handler = syncHandlers[item.action_type];
      if (!handler) {
        console.warn(`⚠️ [Sync Engine] No handler registered for action '${item.action_type}'. Marking failed.`);
        item.status = 'failed';
        item.last_error = `No handler for ${item.action_type}`;
        await putInDb('sync_queue', item);
        failed++;
        continue;
      }

      // Mark in-flight
      item.status = 'in_flight';
      await putInDb('sync_queue', item);

      try {
        await handler(item.payload);

        // Success: delete item from queue
        await deleteFromDb('sync_queue', item.id);
        processed++;
        lastSyncedTimestamp = new Date().toISOString();
        console.log(`✅ [Sync Engine] Synced ${item.action_type} (${item.idempotency_key})`);
      } catch (err: any) {
        console.warn(`❌ [Sync Engine] Error syncing ${item.action_type} (${item.idempotency_key}):`, err?.message || err);

        // UNIVERSAL DISCARD FOR START_SHIFT: If starting shift fails on server for ANY reason
        // (400, 409, 500, or generic server errors), it is obsolete and must never block the queue.
        if (item.action_type === 'START_SHIFT') {
          console.warn(
            `⚠️ [Sync Engine] START_SHIFT (${item.idempotency_key}) failed on server (${err?.status || err?.response?.status || 'Error'}: ${err?.message}). Discarding un-syncable shift immediately to unblock outbox queue.`
          );
          await deleteFromDb('sync_queue', item.id);
          processed++;
          lastSyncedTimestamp = new Date().toISOString();
          // Realignment: sync client with server authoritative active shift
          rehydrateClientState(true).catch(() => {});
          continue;
        }

        const is409Conflict =
          err?.status === 409 ||
          err?.response?.status === 409 ||
          err?.response?.data?.error === 'SHIFT_IN_USE' ||
          err?.response?.data?.error === 'active_shift_exists' ||
          String(err?.message || '').includes('وردية نشطة') ||
          String(err?.message || '').includes('شفت كاشير نشط') ||
          String(err?.message || '').includes('SHIFT_IN_USE');

        const isDuplicateOrConflict =
          is409Conflict ||
          String(err?.message || '').includes('مكرر') ||
          String(err?.message || '').includes('duplicate') ||
          String(err?.message || '').includes('already exists');

        if (isDuplicateOrConflict) {
          console.log(`ℹ️ [Sync Engine] Item ${item.action_type} (${item.idempotency_key}) already synced/conflicted on server. Removing from queue.`);
          await deleteFromDb('sync_queue', item.id);
          processed++;
          continue;
        }

        const isBusinessError =
          err?.status === 400 ||
          err?.status === 403 ||
          err?.status === 404 ||
          err?.status === 422 ||
          err?.response?.status === 400 ||
          err?.response?.status === 403 ||
          err?.response?.status === 404 ||
          err?.response?.status === 422;

        const errMsg =
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          (typeof err === 'string' ? err : 'Rejected by server');

        if (isBusinessError || item.retry_count >= item.max_retries) {
          // Terminal failure: isolate this item so rest of the queue can continue
          item.status = 'failed';
          item.last_error = errMsg;
          await putInDb('sync_queue', item);
          failed++;
        } else {
          // Transient network error: increment retry and pause queue for next backoff interval
          item.retry_count = (item.retry_count || 0) + 1;
          item.status = 'pending';
          item.last_error = errMsg;
          await putInDb('sync_queue', item);
          failed++;
          lastSyncFailureTime = Date.now();
          break; // Stop loop on network disconnect to avoid hammering
        }
      }

      // Non-blocking macro-task yield to browser event loop to process user input & paint frames
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  } finally {
    isSyncing = false;
    await emitSyncStatus();
  }

  return { processed, failed, skipped: false };
}

/**
 * Get all failed sync queue items from IndexedDB
 */
export async function getFailedSyncItems(): Promise<SyncQueueItem[]> {
  const items = await getSyncQueueItems();
  return items.filter((i) => i.status === 'failed');
}

/**
 * Delete a specific sync queue item by ID
 */
export async function deleteSyncQueueItem(id: string): Promise<void> {
  await deleteFromDb('sync_queue', id);
  console.log(`🗑️ [Sync Engine] Deleted item ${id} from sync queue.`);
  await emitSyncStatus();
}

/**
 * Retry a single specific failed sync item
 */
export async function retrySyncQueueItem(id: string): Promise<void> {
  const item = await getFromDb('sync_queue', id);
  if (item) {
    item.status = 'pending';
    item.retry_count = 0;
    item.last_error = undefined;
    await putInDb('sync_queue', item);
    console.log(`🔁 [Sync Engine] Reset item ${id} for retry.`);
    await emitSyncStatus();
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      triggerSyncQueueProcess().catch(() => {});
    }
  }
}

/**
 * Reset all failed items back to 'pending' to retry
 */
export async function retryFailedSyncItems(): Promise<void> {
  const items = await getSyncQueueItems();
  const failed = items.filter((i) => i.status === 'failed');
  for (const item of failed) {
    item.status = 'pending';
    item.retry_count = 0;
    item.last_error = undefined;
    await putInDb('sync_queue', item);
  }
  console.log(`🔁 [Sync Engine] Reset ${failed.length} failed items for retry.`);
  await emitSyncStatus();
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    triggerSyncQueueProcess().catch(() => {});
  }
}

/**
 * Purge/delete all permanently failed sync queue items
 */
export async function purgeFailedSyncItems(): Promise<number> {
  const items = await getSyncQueueItems();
  const failed = items.filter((i) => i.status === 'failed');
  for (const item of failed) {
    await deleteFromDb('sync_queue', item.id);
  }
  console.log(`🗑️ [Sync Engine] Purged ${failed.length} failed items from queue.`);
  await emitSyncStatus();
  return failed.length;
}

/**
 * Purge failed items older than specified hours (default: 24h)
 */
export async function purgeStaleFailedSyncItems(maxAgeHours: number = 24): Promise<number> {
  const items = await getSyncQueueItems();
  const threshold = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const stale = items.filter(
    (i) => i.status === 'failed' && new Date(i.created_at).getTime() < threshold
  );
  for (const item of stale) {
    await deleteFromDb('sync_queue', item.id);
  }
  if (stale.length > 0) {
    console.log(`🧹 [Sync Engine] Auto-purged ${stale.length} stale failed items (> ${maxAgeHours}h).`);
    await emitSyncStatus();
  }
  return stale.length;
}

/**
 * Get Arabic translation label for an action type
 */
export function getActionTypeArabicLabel(actionType: string): string {
  const map: Record<string, string> = {
    CREATE_ORDER: 'تسجيل فاتورة جديدة',
    CANCEL_ORDER: 'إلغاء فاتورة',
    CREATE_EXPENSE: 'تسجيل مصروف',
    UPDATE_EXPENSE: 'تعديل مصروف',
    DELETE_EXPENSE: 'حذف مصروف',
    CLOCK_ACTION: 'حضور / انصراف موظف',
    START_SHIFT: 'بدء وردية كاشير',
    CLOSE_SHIFT: 'إغلاق وردية كاشير',
    RESTOCK_INVENTORY: 'تجديد مخزون المواد',
    CHANGE_ADMIN_PIN: 'تغيير رمز PIN الإدارة',
  };
  return map[actionType] || actionType;
}

export type InboundHydrationHandler = () => Promise<any>;
let inboundHydrationHandler: InboundHydrationHandler | null = null;

export function registerInboundHydrationHandler(handler: InboundHydrationHandler) {
  inboundHydrationHandler = handler;
}

let lastRehydrationTime = 0;
export async function rehydrateClientState(force: boolean = false): Promise<void> {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const now = Date.now();
  if (!force && now - lastRehydrationTime < 15000) return; // 15s throttle
  lastRehydrationTime = now;

  if (inboundHydrationHandler) {
    try {
      await inboundHydrationHandler();
    } catch (err) {
      console.warn('[Sync Engine Inbound Hydration Warning]', err);
    }
  }
}

/**
 * Boot the background sync engine
 */
export function startSyncEngine(handlers?: Partial<SyncHandlerMap>): () => void {
  if (handlers) {
    registerSyncHandlers(handlers);
  }

  if (typeof window === 'undefined') return () => {};

  // Reset any stuck in_flight items back to pending on startup and clean very old stale errors
  getSyncQueueItems().then(async (items) => {
    // Purge stale failed items older than 48 hours
    await purgeStaleFailedSyncItems(48).catch(() => {});

    // Proactively purge obsolete failed/stuck START_SHIFT items on boot
    for (const item of items) {
      if (item.action_type === 'START_SHIFT' && (item.status === 'failed' || (item.retry_count || 0) >= 1)) {
        console.warn(`🧹 [Sync Engine Boot] Purging obsolete START_SHIFT (${item.idempotency_key}) on startup.`);
        await deleteFromDb('sync_queue', item.id);
      }
    }

    let hasStuck = false;
    for (const item of items) {
      if (item.status === 'in_flight') {
        item.status = 'pending';
        await putInDb('sync_queue', item);
        hasStuck = true;
      }
    }
    if (hasStuck) {
      await emitSyncStatus();
      if (navigator.onLine) {
        triggerSyncQueueProcess().catch(() => {});
      }
    }
  }).catch(() => {});

  // 1. Listen to online event
  const handleOnline = () => {
    console.log('🌐 [Sync Engine] Device went ONLINE. Triggering immediate queue sync...');
    emitSyncStatus('syncing');
    triggerSyncQueueProcess().catch(() => {});
    rehydrateClientState(true).catch(() => {});
  };

  // 2. Listen to offline event
  const handleOffline = () => {
    console.log('📴 [Sync Engine] Device went OFFLINE. Operations will be queued locally.');
    emitSyncStatus('offline');
  };

  // 3. Listen to visibility / window focus change
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      triggerSyncQueueProcess().catch(() => {});
      rehydrateClientState(false).catch(() => {});
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleVisibilityChange);

  // 4. Scheduled 20-second heartbeat worker
  if (!syncIntervalId) {
    syncIntervalId = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine && !isSyncing) {
        triggerSyncQueueProcess().catch(() => {});
        rehydrateClientState(false).catch(() => {});
      }
    }, 20000);
  }

  // Initial trigger
  if (navigator.onLine) {
    triggerSyncQueueProcess().catch(() => {});
    rehydrateClientState(true).catch(() => {});
  } else {
    emitSyncStatus('offline');
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleVisibilityChange);
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
  };
}
