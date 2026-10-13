import { InventoryItem, Service, InventoryTransaction } from '../types/index.js';
import { FALLBACK_INVENTORY } from '../api/mockFallbacks.js';
import { getStoredServices } from './serviceStorage.js';
import { recordInventoryPurchaseExpense } from './expenseStorage.js';
import { notifyLowStockAlert, clearLowStockNotificationFlag } from './telegramNotifications.js';
import { getAllFromDb, bulkPutInDb, putInDb } from '../db/indexedDB.js';

const INVENTORY_STORAGE_KEY = 'cw_inventory_items';
const INVENTORY_TX_KEY = 'cw_inventory_transactions';

let inMemoryInventoryCache: InventoryItem[] | null = null;

export async function initInventoryFromIndexedDB(): Promise<InventoryItem[]> {
  if (typeof window === 'undefined') return FALLBACK_INVENTORY;
  try {
    const items = await getAllFromDb('inventory');
    if (Array.isArray(items) && items.length > 0) {
      inMemoryInventoryCache = items;
      return inMemoryInventoryCache;
    }
  } catch (e) {
    console.warn('[inventoryStorage] IDB init fallback:', e);
  }
  inMemoryInventoryCache = getStoredInventory();
  return inMemoryInventoryCache;
}

export const getStoredInventory = (): InventoryItem[] => {
  if (inMemoryInventoryCache !== null && Array.isArray(inMemoryInventoryCache)) {
    return inMemoryInventoryCache;
  }

  if (typeof window === 'undefined') return FALLBACK_INVENTORY;
  try {
    const raw = localStorage.getItem(INVENTORY_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryInventoryCache = parsed;
        return inMemoryInventoryCache;
      }
    }
  } catch {}
  inMemoryInventoryCache = FALLBACK_INVENTORY;
  return inMemoryInventoryCache;
};

export const saveStoredInventory = (items: InventoryItem[]): void => {
  inMemoryInventoryCache = items;
  if (typeof window === 'undefined') return;

  // 1. Asynchronous IndexedDB Persistence
  bulkPutInDb('inventory', items).catch((e) => console.warn('[IDB saveStoredInventory error]', e));

  // 2. LocalStorage backup snapshot
  try {
    localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('cw_inventory_updated', { detail: items }));
    window.dispatchEvent(new Event('cw_inventory_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

/**
 * Retrieve local inventory transaction audit logs
 */
export const getStoredInventoryTransactions = (): InventoryTransaction[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(INVENTORY_TX_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
};

/**
 * Save inventory transactions to local storage and IndexedDB
 */
export const saveStoredInventoryTransactions = (txs: InventoryTransaction[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INVENTORY_TX_KEY, JSON.stringify(txs.slice(0, 500))); // Keep latest 500
    bulkPutInDb('inventory_transactions' as any, txs).catch(() => {});
    window.dispatchEvent(new CustomEvent('cw_inventory_tx_updated', { detail: txs }));
    window.dispatchEvent(new Event('cw_inventory_tx_updated'));
  } catch {}
};

/**
 * Record an audit log entry for inventory movements (order deduction, restock, manual adjustment)
 */
export const recordLocalInventoryTransaction = (tx: Partial<InventoryTransaction>): InventoryTransaction => {
  const fullTx: InventoryTransaction = {
    id: tx.id || `invtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    inventory_item_id: tx.inventory_item_id || '',
    inventory_name: tx.inventory_name,
    order_id: tx.order_id,
    order_code: tx.order_code,
    transaction_type: tx.transaction_type || 'deduction_order',
    quantity_grams: Number(tx.quantity_grams) || 0,
    previous_stock_grams: Number(tx.previous_stock_grams) || 0,
    new_stock_grams: Number(tx.new_stock_grams) || 0,
    cost_impact: Number(tx.cost_impact) || 0,
    notes: tx.notes,
    created_at: tx.created_at || new Date().toISOString(),
  };

  const currentTxs = getStoredInventoryTransactions();
  currentTxs.unshift(fullTx);
  saveStoredInventoryTransactions(currentTxs);
  return fullTx;
};

/**
 * Deducts BOM raw materials grams for a service when an order is completed.
 * Matches service recipes by item ID, reduces current_stock_grams, updates low_stock status,
 * and logs individual audit transactions.
 */
export const deductBomInventory = (
  serviceId: string,
  servicesList?: Service[],
  orderRef?: { id?: string; order_code?: string }
): { deductedItems: { name: string; grams: number; remainingGrams: number }[] } => {
  const allServices = (servicesList && servicesList.length > 0) ? servicesList : getStoredServices();
  const service = allServices.find((s) => s.id === serviceId);
  const recipes = service?.recipes || [];

  if (!recipes || recipes.length === 0) {
    return { deductedItems: [] };
  }

  const currentInventory = getStoredInventory();
  const deductedItems: { name: string; grams: number; remainingGrams: number }[] = [];

  const updatedInventory = currentInventory.map((item) => {
    // Find matching recipe ingredient by inventory_item_id or item_id
    const recipe = recipes.find(
      (r) => r.inventory_item_id === item.id || (r as any).item_id === item.id
    );

    if (recipe) {
      const gramsUsed = Number(recipe.quantity_grams || (recipe as any).grams_used || 0);
      const prevStock = item.current_stock_grams;
      const newStock = Math.max(0, Number((prevStock - gramsUsed).toFixed(2)));
      const isLowStock = newStock <= item.reorder_threshold_grams;

      deductedItems.push({
        name: item.name,
        grams: gramsUsed,
        remainingGrams: newStock,
      });

      // Record audit trail log entry
      recordLocalInventoryTransaction({
        inventory_item_id: item.id,
        inventory_name: item.name,
        order_id: orderRef?.id,
        order_code: orderRef?.order_code,
        transaction_type: 'deduction_order',
        quantity_grams: gramsUsed,
        previous_stock_grams: prevStock,
        new_stock_grams: newStock,
        cost_impact: Number((gramsUsed * (item.cost_per_gram || 0)).toFixed(2)),
        notes: `خصم مواد استهلاك لخدمة ${service?.name || ''} (${orderRef?.order_code || 'طلب'})`,
      });

      if (isLowStock) {
        notifyLowStockAlert(item.id, item.name, newStock, item.reorder_threshold_grams).catch(() => {});
      }

      return {
        ...item,
        current_stock_grams: newStock,
        is_low_stock: isLowStock,
        updated_at: new Date().toISOString(),
      };
    }

    return item;
  });

  saveStoredInventory(updatedInventory);
  return { deductedItems };
};

export const restockInventoryItem = (
  itemId: string,
  gramsToAdd: number,
  costPerGram?: number,
  paymentMethod?: 'cash' | 'card' | 'transfer',
  invoiceRef?: string,
  notes?: string,
  recordExpense: boolean = true
): InventoryItem | null => {
  const currentInventory = getStoredInventory();
  let updatedItem: InventoryItem | null = null;

  const updatedInventory = currentInventory.map((item) => {
    if (item.id === itemId) {
      const prevStock = item.current_stock_grams;
      const newStock = Number((prevStock + Number(gramsToAdd)).toFixed(2));
      const isLowStock = newStock <= item.reorder_threshold_grams;
      const effectiveCostPerGram =
        costPerGram !== undefined && Number(costPerGram) > 0
          ? Number(costPerGram)
          : Number(item.cost_per_gram) || 0.15;

      if (!isLowStock) {
        clearLowStockNotificationFlag(item.id);
      }

      updatedItem = {
        ...item,
        current_stock_grams: newStock,
        cost_per_gram: effectiveCostPerGram,
        is_low_stock: isLowStock,
        updated_at: new Date().toISOString(),
      };

      // Record audit trail log entry
      recordLocalInventoryTransaction({
        inventory_item_id: item.id,
        inventory_name: item.name,
        transaction_type: 'restock',
        quantity_grams: gramsToAdd,
        previous_stock_grams: prevStock,
        new_stock_grams: newStock,
        cost_impact: Number((gramsToAdd * effectiveCostPerGram).toFixed(2)),
        notes: notes || `توريد ${gramsToAdd.toLocaleString()} جرام لمادة ${item.name}`,
      });

      // Automatically create the expense in P&L if requested
      if (recordExpense && gramsToAdd > 0) {
        const totalCost = Number((gramsToAdd * effectiveCostPerGram).toFixed(2));
        if (totalCost > 0) {
          recordInventoryPurchaseExpense({
            itemName: item.name,
            grams: gramsToAdd,
            costPerGram: effectiveCostPerGram,
            totalCost,
            paymentMethod: paymentMethod || 'cash',
            receiptReference: invoiceRef,
            notes: notes || `توريد ${gramsToAdd.toLocaleString()} جرام لمادة ${item.name}`,
          });
        }
      }

      return updatedItem;
    }
    return item;
  });

  saveStoredInventory(updatedInventory);
  return updatedItem;
};

