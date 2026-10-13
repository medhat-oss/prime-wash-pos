import { Service, RecipeItem, InventoryItem } from '../types/index.js';
import { FALLBACK_SERVICES } from '../api/mockFallbacks.js';
import { getStoredInventory } from './inventoryStorage.js';

const SERVICES_KEY = 'cw_custom_services';

/**
 * Calculates the estimated raw material cost for a service based on current inventory gram unit costs.
 */
export const calculateServiceEstimatedCost = (
  recipes?: RecipeItem[],
  inventoryList?: InventoryItem[]
): number => {
  if (!recipes || !Array.isArray(recipes) || recipes.length === 0) return 0;
  const inventory = inventoryList || getStoredInventory();

  const totalCost = recipes.reduce((sum, recipe) => {
    const item = inventory.find(
      (inv) => inv.id === recipe.inventory_item_id || inv.id === (recipe as any).item_id
    );
    const costPerGram = item ? Number(item.cost_per_gram || 0) : Number(recipe.cost_per_gram || 0);
    const qtyGrams = Number(recipe.quantity_grams || (recipe as any).grams_used || 0);
    return sum + (costPerGram * qtyGrams);
  }, 0);

  return Number(totalCost.toFixed(2));
};

/**
 * Retrieve all services from localStorage (or fallback if empty) with enriched recipe costs
 */
export const getStoredServices = (status?: 'active' | 'inactive'): Service[] => {
  if (typeof window === 'undefined') {
    return status ? FALLBACK_SERVICES.filter((s) => s.status === status) : FALLBACK_SERVICES;
  }

  let list: Service[] | null = null;
  try {
    const raw = localStorage.getItem(SERVICES_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed;
      }
    }
  } catch {}

  // Only seed with FALLBACK_SERVICES on first run when the storage key is completely missing
  if (list === null) {
    list = FALLBACK_SERVICES;
    try {
      localStorage.setItem(SERVICES_KEY, JSON.stringify(FALLBACK_SERVICES));
    } catch {}
  }

  const inventory = getStoredInventory();
  // Ensure each service has estimated_material_cost calculated
  const enriched = list.map((s) => ({
    ...s,
    estimated_material_cost: calculateServiceEstimatedCost(s.recipes, inventory),
  }));

  if (status) {
    return enriched.filter((s) => s.status === status);
  }
  return enriched;
};

/**
 * Save services to localStorage and dispatch reactive event
 */
export const saveStoredServices = (services: Service[]): void => {
  if (typeof window === 'undefined') return;
  try {
    const inventory = getStoredInventory();
    const enriched = services.map((s) => ({
      ...s,
      estimated_material_cost: calculateServiceEstimatedCost(s.recipes, inventory),
    }));

    localStorage.setItem(SERVICES_KEY, JSON.stringify(enriched));
    window.dispatchEvent(new CustomEvent('cw_services_updated', { detail: enriched }));
    window.dispatchEvent(new Event('cw_services_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

/**
 * Get a single service by ID
 */
export const getStoredServiceById = (id: string): Service | undefined => {
  const all = getStoredServices();
  return all.find((s) => s.id === id);
};

/**
 * Create a new service package with attached BOM recipes
 */
export const createStoredService = (
  data: Partial<Service> & { recipes?: RecipeItem[] }
): Service => {
  const current = getStoredServices();
  const inventory = getStoredInventory();

  // Attach inventory names if missing
  const formattedRecipes: RecipeItem[] = (data.recipes || []).map((r) => {
    const item = inventory.find((inv) => inv.id === r.inventory_item_id);
    return {
      id: r.id || `rec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      inventory_item_id: r.inventory_item_id,
      inventory_name: r.inventory_name || item?.name || 'مادة خام',
      quantity_grams: Number(r.quantity_grams || 0),
      cost_per_gram: item ? Number(item.cost_per_gram || 0) : Number(r.cost_per_gram || 0),
      notes: r.notes || '',
    };
  });

  const estimatedCost = calculateServiceEstimatedCost(formattedRecipes, inventory);

  const newService: Service = {
    id: data.id || `srv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: data.name || 'باقة غسيل جديدة',
    price: Number(data.price) || 100.0,
    description: data.description || '',
    category: data.category || 'عام',
    egs_code: data.egs_code || `EG-PW-${Math.floor(100 + Math.random() * 900)}`,
    media_url: data.media_url || '',
    media_type: data.media_type || (data.media_url ? (data.media_url.endsWith('.mp4') ? 'video' : 'image') : 'none'),
    status: data.status || 'active',
    recipes: formattedRecipes,
    estimated_material_cost: estimatedCost,
    created_at: data.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const updated = [newService, ...current.filter((s) => s.id !== newService.id)];
  saveStoredServices(updated);
  return newService;
};

/**
 * Update an existing service package
 */
export const updateStoredService = (
  id: string,
  data: Partial<Service> & { recipes?: RecipeItem[] }
): Service => {
  const current = getStoredServices();
  const existing = current.find((s) => s.id === id);
  const inventory = getStoredInventory();

  const formattedRecipes: RecipeItem[] | undefined = data.recipes
    ? data.recipes.map((r) => {
        const item = inventory.find((inv) => inv.id === r.inventory_item_id);
        return {
          id: r.id || `rec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          inventory_item_id: r.inventory_item_id,
          inventory_name: r.inventory_name || item?.name || 'مادة خام',
          quantity_grams: Number(r.quantity_grams || 0),
          cost_per_gram: item ? Number(item.cost_per_gram || 0) : Number(r.cost_per_gram || 0),
          notes: r.notes || '',
        };
      })
    : existing?.recipes;

  const estimatedCost = calculateServiceEstimatedCost(formattedRecipes, inventory);

  const updatedService: Service = {
    ...(existing || {
      id,
      name: 'باقة غسيل',
      price: 100.0,
      category: 'عام',
      status: 'active',
      created_at: new Date().toISOString(),
    }),
    ...data,
    price: data.price !== undefined ? Number(data.price) : existing?.price || 100.0,
    recipes: formattedRecipes,
    estimated_material_cost: estimatedCost,
    updated_at: new Date().toISOString(),
  };

  const updatedList = current.some((s) => s.id === id)
    ? current.map((s) => (s.id === id ? updatedService : s))
    : [updatedService, ...current];

  saveStoredServices(updatedList);
  return updatedService;
};

/**
 * Delete a service package by ID or name
 */
export const deleteStoredService = (idOrName: string): boolean => {
  if (typeof window === 'undefined') return false;
  const current = getStoredServices();
  const filtered = current.filter(
    (s) => s.id !== idOrName && s.name !== idOrName && (s as any).temp_id !== idOrName
  );
  saveStoredServices(filtered);
  return true;
};

/**
 * Update recipes for a specific service
 */
export const setStoredServiceRecipes = (id: string, recipes: RecipeItem[]): Service => {
  return updateStoredService(id, { recipes });
};

/**
 * Purge any test ghost services and legacy storage keys
 */
export const purgeGhostServices = (): void => {
  if (typeof window === 'undefined') return;
  try {
    // Remove deprecated storage keys
    localStorage.removeItem('cw_services');
    localStorage.removeItem('pos_services');
    localStorage.removeItem('services_cache');

    const raw = localStorage.getItem(SERVICES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter(
          (s: any) =>
            s &&
            s.name &&
            !s.name.includes('متاتن') &&
            !s.name.includes('شيشيشيشيشي') &&
            s.status !== 'deleted' &&
            s.status !== 'inactive'
        );
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(SERVICES_KEY, JSON.stringify(cleaned));
          window.dispatchEvent(new CustomEvent('cw_services_updated', { detail: cleaned }));
        }
      }
    }
  } catch {}
};

// Auto-purge on load
if (typeof window !== 'undefined') {
  purgeGhostServices();
}
