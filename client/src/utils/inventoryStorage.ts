import { InventoryItem, Service } from '../types/index.js';
import { FALLBACK_INVENTORY } from '../api/mockFallbacks.js';
import { getStoredServices } from './serviceStorage.js';

const INVENTORY_STORAGE_KEY = 'cw_inventory_items';

export const getStoredInventory = (): InventoryItem[] => {
  if (typeof window === 'undefined') return FALLBACK_INVENTORY;
  try {
    const raw = localStorage.getItem(INVENTORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  try {
    localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(FALLBACK_INVENTORY));
  } catch {}
  return FALLBACK_INVENTORY;
};

export const saveStoredInventory = (items: InventoryItem[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('cw_inventory_updated', { detail: items }));
    window.dispatchEvent(new Event('cw_inventory_updated'));
  } catch {}
};

/**
 * Deducts BOM raw materials grams for a service when an order is completed.
 * Matches service recipes by item ID, reduces current_stock_grams, updates low_stock status.
 */
export const deductBomInventory = (
  serviceId: string,
  servicesList?: Service[]
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
      const newStock = Math.max(0, Number((item.current_stock_grams - gramsUsed).toFixed(2)));
      const isLowStock = newStock <= item.reorder_threshold_grams;

      deductedItems.push({
        name: item.name,
        grams: gramsUsed,
        remainingGrams: newStock,
      });

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
  gramsToAdd: number
): InventoryItem | null => {
  const currentInventory = getStoredInventory();
  let updatedItem: InventoryItem | null = null;

  const updatedInventory = currentInventory.map((item) => {
    if (item.id === itemId) {
      const newStock = Number((item.current_stock_grams + Number(gramsToAdd)).toFixed(2));
      const isLowStock = newStock <= item.reorder_threshold_grams;
      updatedItem = {
        ...item,
        current_stock_grams: newStock,
        is_low_stock: isLowStock,
        updated_at: new Date().toISOString(),
      };
      return updatedItem;
    }
    return item;
  });

  saveStoredInventory(updatedInventory);
  return updatedItem;
};
