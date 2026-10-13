/**
 * Prime Wash POS - Tax & ETA e-Receipt Local Storage & State Management
 * Provides persistence, event bus broadcasting, and real-time computation
 * of tax statistics from stored POS orders.
 */

import { TaxSettings, TaxStats, Service } from '../types/index.js';
import { getStoredAllOrders } from './orderStorage.js';
import { getStoredServices } from './serviceStorage.js';

const TAX_SETTINGS_KEY = 'cw_tax_settings';
const SERVICE_TAX_CODES_KEY = 'cw_services_tax_codes';

export const TAX_SETTINGS_UPDATED_EVENT = 'cw_tax_settings_updated';
export const SERVICE_TAX_CODES_UPDATED_EVENT = 'cw_services_tax_codes_updated';

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  is_enabled: true,
  eta_sync_enabled: false,
  environment: 'preprod',
  company_name: 'مغسلة برايم واش (PRIME WASH)',
  tax_registration_number: '123-456-789',
  activity_code: '4520',
  branch_code: '0',
  pos_serial: 'POS-PRIME-01',
  pos_os_version: 'PrimeWash-Cloud-v2.0',
  client_id: '',
  client_secret: '',
  remote_signer_url: '',
  remote_signer_token: '',
};

/**
 * Standard Egyptian 14% VAT Breakdown:
 * Calculates subtotal (pre-tax) and tax amount from gross price.
 */
export const calculateSubtotalAndTax = (
  grossTotal: number,
  vatRate: number = 0.14
): { subtotal: number; taxAmount: number; total: number } => {
  const total = Number(grossTotal) || 0;
  const subtotal = Number((total / (1 + vatRate)).toFixed(2));
  const taxAmount = Number((total - subtotal).toFixed(2));
  return { subtotal, taxAmount, total };
};

/**
 * Retrieve saved Tax & ETA settings from localStorage with fallback defaults
 */
export const getStoredTaxSettings = (): TaxSettings => {
  if (typeof window === 'undefined') return { ...DEFAULT_TAX_SETTINGS };
  try {
    const raw = localStorage.getItem(TAX_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          ...DEFAULT_TAX_SETTINGS,
          ...parsed,
        };
      }
    }
  } catch (err) {
    console.error('Error reading tax settings from localStorage:', err);
  }
  return { ...DEFAULT_TAX_SETTINGS };
};

/**
 * Save Tax & ETA settings to localStorage and dispatch update event
 */
export const saveStoredTaxSettings = (data: Partial<TaxSettings>): TaxSettings => {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_TAX_SETTINGS, ...(data || {}) };
  }
  if (!data || typeof data !== 'object') {
    return getStoredTaxSettings();
  }
  try {
    const current = getStoredTaxSettings();
    const updated: TaxSettings = {
      ...current,
      ...data,
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(TAX_SETTINGS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(TAX_SETTINGS_UPDATED_EVENT, { detail: updated }));
    return updated;
  } catch (err) {
    console.error('Error saving tax settings to localStorage:', err);
    return { ...DEFAULT_TAX_SETTINGS, ...(data || {}) };
  }
};

/**
 * Get map of serviceId -> egs_code
 */
export const getStoredServiceTaxCodes = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SERVICE_TAX_CODES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (err) {
    console.error('Error reading service tax codes from localStorage:', err);
  }
  return {};
};

/**
 * Save single service EGS code
 */
export const saveStoredServiceTaxCode = (
  serviceId: string,
  egs_code: string | null
): Record<string, string> => {
  if (typeof window === 'undefined' || !serviceId) return {};
  try {
    const current = getStoredServiceTaxCodes();
    const updated = {
      ...current,
      [serviceId]: egs_code || '',
    };
    localStorage.setItem(SERVICE_TAX_CODES_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(SERVICE_TAX_CODES_UPDATED_EVENT, { detail: updated }));
    return updated;
  } catch (err) {
    console.error('Error saving service tax code to localStorage:', err);
    return {};
  }
};

/**
 * Batch save multiple service EGS codes
 */
export const batchSaveStoredServiceTaxCodes = (
  items: Array<{ id: string; egs_code: string | null }>
): Record<string, string> => {
  if (typeof window === 'undefined' || !Array.isArray(items)) return {};
  try {
    const current = getStoredServiceTaxCodes();
    const updated = { ...current };
    items.forEach((item) => {
      if (item && item.id) {
        updated[item.id] = item.egs_code || '';
      }
    });
    localStorage.setItem(SERVICE_TAX_CODES_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(SERVICE_TAX_CODES_UPDATED_EVENT, { detail: updated }));
    return updated;
  } catch (err) {
    console.error('Error batch saving service tax codes:', err);
    return {};
  }
};

/**
 * Get enriched services list with their mapped EGS codes
 */
export const getStoredServicesWithTaxCodes = (
  baseServices?: Service[]
): Service[] => {
  const codesMap = getStoredServiceTaxCodes();
  const services = baseServices && baseServices.length > 0 ? baseServices : getStoredServices();

  return services.map((service) => ({
    ...service,
    egs_code: codesMap[service.id] !== undefined ? codesMap[service.id] : service.egs_code ?? '',
  }));
};

/**
 * Compute real-time Tax Statistics from locally stored orders
 */
export const getTaxStatsFromStoredOrders = (): TaxStats => {
  const orders = getStoredAllOrders();
  const taxSettings = getStoredTaxSettings();

  let total_orders = orders.length;
  let synced_valid_count = 0;
  let pending_count = 0;
  let failed_count = 0;
  let not_synced_count = 0;

  orders.forEach((order) => {
    if (order.eta_status === 'valid') {
      synced_valid_count++;
    } else if (order.eta_status === 'pending') {
      pending_count++;
    } else if (order.eta_status === 'failed' || order.eta_status === 'invalid') {
      failed_count++;
    } else {
      if (taxSettings.eta_sync_enabled && taxSettings.is_enabled) {
        pending_count++;
      } else {
        not_synced_count++;
      }
    }
  });

  return {
    orders: {
      total_orders,
      synced_valid_count,
      pending_count,
      failed_count,
      not_synced_count,
    },
    queue: {
      total_queue_items: pending_count + failed_count,
      queue_pending: pending_count,
      queue_processing: 0,
      queue_failed: failed_count,
    },
  };
};

/**
 * Clean and format 9-digit Egyptian Tax Registration Number (e.g. 123-456-789)
 */
export const formatEgyptianTaxNumber = (val?: string | null): string => {
  if (!val) return '';
  const digits = val.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
};

/**
 * Validate standard 9-digit Egyptian Tax Number
 */
export const validateEgyptianTaxNumber = (val?: string | null): boolean => {
  if (!val) return false;
  const digits = val.replace(/\D/g, '');
  return digits.length === 9;
};

/**
 * Generate standard ETA EGS Item Code (EG-<TaxID>-<ItemCode>)
 */
export const generateStandardEgsCode = (
  taxRegistrationNumber: string | null | undefined,
  serviceIndex: number,
  prefix: string = 'WASH'
): string => {
  const cleanTax = (taxRegistrationNumber || '123456789')
    .replace(/\D/g, '')
    .padEnd(9, '0')
    .slice(0, 9);
  const codeNum = (serviceIndex + 1).toString().padStart(3, '0');
  return `EG-${cleanTax}-${prefix}${codeNum}`;
};
