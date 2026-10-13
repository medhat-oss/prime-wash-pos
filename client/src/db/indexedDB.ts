import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  Order,
  Service,
  InventoryItem,
  Employee,
  Attendance,
  ClosedShift,
  Expense,
} from '../types/index.js';

export interface SyncQueueItem {
  id: string;
  action_type:
    | 'CREATE_ORDER'
    | 'CANCEL_ORDER'
    | 'CREATE_EXPENSE'
    | 'UPDATE_EXPENSE'
    | 'DELETE_EXPENSE'
    | 'CLOCK_ACTION'
    | 'START_SHIFT'
    | 'CLOSE_SHIFT'
    | 'RESTOCK_INVENTORY'
    | 'CHANGE_ADMIN_PIN';
  payload: any;
  idempotency_key: string;
  created_at: string;
  retry_count: number;
  max_retries: number;
  status: 'pending' | 'in_flight' | 'failed';
  last_error?: string;
}

export interface AppMetaItem {
  key: string;
  value: any;
  updated_at: string;
}

export interface PrimeWashDBSchema extends DBSchema {
  orders: {
    key: string;
    value: Order;
    indexes: {
      'by-order-code': string;
      'by-sync-status': string;
      'by-shift-id': string;
      'by-created-at': string;
      'by-status': string;
    };
  };
  services: {
    key: string;
    value: Service;
    indexes: {
      'by-category': string;
      'by-status': string;
    };
  };
  inventory: {
    key: string;
    value: InventoryItem;
    indexes: {
      'by-name': string;
      'by-is-low-stock': number;
    };
  };
  shifts: {
    key: string;
    value: ClosedShift;
    indexes: {
      'by-shift-code': string;
      'by-status': string;
      'by-shift-start': string;
    };
  };
  expenses: {
    key: string;
    value: Expense;
    indexes: {
      'by-category': string;
      'by-expense-date': string;
    };
  };
  attendance: {
    key: string;
    value: Attendance;
    indexes: {
      'by-employee-id': string;
      'by-work-date': string;
    };
  };
  employees: {
    key: string;
    value: Employee;
    indexes: {
      'by-role': string;
      'by-status': string;
    };
  };
  inventory_transactions: {
    key: string;
    value: any;
    indexes: {
      'by-item-id': string;
      'by-order-id': string;
      'by-created-at': string;
    };
  };
  sync_queue: {
    key: string;
    value: SyncQueueItem;
    indexes: {
      'by-created-at': string;
      'by-status': string;
      'by-action-type': string;
    };
  };
  app_meta: {
    key: string;
    value: AppMetaItem;
  };
}

const DB_NAME = 'PrimeWashDB_v1';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<PrimeWashDBSchema>> | null = null;

export const getIndexedDB = (): Promise<IDBPDatabase<PrimeWashDBSchema>> => {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not supported in non-browser environments'));
  }

  if (!dbPromise) {
    dbPromise = openDB<PrimeWashDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 1. Orders Store
        if (!db.objectStoreNames.contains('orders')) {
          const orderStore = db.createObjectStore('orders', { keyPath: 'id' });
          orderStore.createIndex('by-order-code', 'order_code');
          orderStore.createIndex('by-sync-status', 'sync_status');
          orderStore.createIndex('by-shift-id', 'shift_id');
          orderStore.createIndex('by-created-at', 'created_at');
          orderStore.createIndex('by-status', 'status');
        }

        // 2. Services Store
        if (!db.objectStoreNames.contains('services')) {
          const serviceStore = db.createObjectStore('services', { keyPath: 'id' });
          serviceStore.createIndex('by-category', 'category');
          serviceStore.createIndex('by-status', 'status');
        }

        // 3. Inventory Store
        if (!db.objectStoreNames.contains('inventory')) {
          const invStore = db.createObjectStore('inventory', { keyPath: 'id' });
          invStore.createIndex('by-name', 'name');
          invStore.createIndex('by-is-low-stock', 'is_low_stock');
        }

        // 4. Shifts Store
        if (!db.objectStoreNames.contains('shifts')) {
          const shiftStore = db.createObjectStore('shifts', { keyPath: 'id' });
          shiftStore.createIndex('by-shift-code', 'shift_code');
          shiftStore.createIndex('by-status', 'status');
          shiftStore.createIndex('by-shift-start', 'shift_start');
        }

        // 5. Expenses Store
        if (!db.objectStoreNames.contains('expenses')) {
          const expStore = db.createObjectStore('expenses', { keyPath: 'id' });
          expStore.createIndex('by-category', 'category');
          expStore.createIndex('by-expense-date', 'expense_date');
        }

        // 6. Attendance Store
        if (!db.objectStoreNames.contains('attendance')) {
          const attStore = db.createObjectStore('attendance', { keyPath: 'id' });
          attStore.createIndex('by-employee-id', 'employee_id');
          attStore.createIndex('by-work-date', 'work_date');
        }

        // 7. Employees Store
        if (!db.objectStoreNames.contains('employees')) {
          const empStore = db.createObjectStore('employees', { keyPath: 'id' });
          empStore.createIndex('by-role', 'role');
          empStore.createIndex('by-status', 'status');
        }

        // 8. Inventory Transactions Store (Audit Trail)
        if (!db.objectStoreNames.contains('inventory_transactions')) {
          const invTxStore = db.createObjectStore('inventory_transactions', { keyPath: 'id' });
          invTxStore.createIndex('by-item-id', 'inventory_item_id');
          invTxStore.createIndex('by-order-id', 'order_id');
          invTxStore.createIndex('by-created-at', 'created_at');
        }

        // 9. Sync Queue Store (Outbox)
        if (!db.objectStoreNames.contains('sync_queue')) {
          const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
          queueStore.createIndex('by-created-at', 'created_at');
          queueStore.createIndex('by-status', 'status');
          queueStore.createIndex('by-action-type', 'action_type');
        }

        // 10. App Metadata Store
        if (!db.objectStoreNames.contains('app_meta')) {
          db.createObjectStore('app_meta', { keyPath: 'key' });
        }
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }

  return dbPromise;
};

export const isIndexedDBSupported = (): boolean => {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
};

// Generic Helpers
export async function getAllFromDb<K extends keyof PrimeWashDBSchema>(storeName: K): Promise<PrimeWashDBSchema[K]['value'][]> {
  if (!isIndexedDBSupported()) return [];
  try {
    const db = await getIndexedDB();
    return await db.getAll(storeName as any);
  } catch (err) {
    console.warn(`[IndexedDB Read Error - ${String(storeName)}]`, err);
    return [];
  }
}

export async function getFromDb<K extends keyof PrimeWashDBSchema>(
  storeName: K,
  key: string
): Promise<PrimeWashDBSchema[K]['value'] | undefined> {
  if (!isIndexedDBSupported()) return undefined;
  try {
    const db = await getIndexedDB();
    return await db.get(storeName as any, key);
  } catch (err) {
    console.warn(`[IndexedDB Get Error - ${String(storeName)}:${key}]`, err);
    return undefined;
  }
}

export async function putInDb<K extends keyof PrimeWashDBSchema>(
  storeName: K,
  value: PrimeWashDBSchema[K]['value']
): Promise<string> {
  if (!isIndexedDBSupported()) return '';
  try {
    const db = await getIndexedDB();
    return (await db.put(storeName as any, value)) as string;
  } catch (err) {
    console.warn(`[IndexedDB Put Error - ${String(storeName)}]`, err);
    return '';
  }
}

export async function bulkPutInDb<K extends keyof PrimeWashDBSchema>(
  storeName: K,
  items: PrimeWashDBSchema[K]['value'][]
): Promise<void> {
  if (!isIndexedDBSupported() || !items || items.length === 0) return;
  try {
    const db = await getIndexedDB();
    const tx = db.transaction(storeName as any, 'readwrite');
    for (const item of items) {
      tx.store.put(item);
    }
    await tx.done;
  } catch (err) {
    console.warn(`[IndexedDB BulkPut Error - ${String(storeName)}]`, err);
  }
}

export async function deleteFromDb<K extends keyof PrimeWashDBSchema>(storeName: K, key: string): Promise<void> {
  if (!isIndexedDBSupported()) return;
  try {
    const db = await getIndexedDB();
    await db.delete(storeName as any, key);
  } catch (err) {
    console.warn(`[IndexedDB Delete Error - ${String(storeName)}:${key}]`, err);
  }
}

export async function clearDbStore<K extends keyof PrimeWashDBSchema>(storeName: K): Promise<void> {
  if (!isIndexedDBSupported()) return;
  try {
    const db = await getIndexedDB();
    await db.clear(storeName as any);
  } catch (err) {
    console.warn(`[IndexedDB Clear Error - ${String(storeName)}]`, err);
  }
}

// App Metadata Helpers
export async function getAppMeta<T = any>(key: string, defaultValue?: T): Promise<T | undefined> {
  try {
    const item = await getFromDb('app_meta', key);
    if (item && item.value !== undefined) {
      return item.value as T;
    }
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function setAppMeta(key: string, value: any): Promise<void> {
  try {
    await putInDb('app_meta', {
      key,
      value,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn(`[IndexedDB setAppMeta Error - ${key}]`, err);
  }
}
