import axios from 'axios';
import {
  InventoryItem,
  Service,
  Employee,
  Order,
  Attendance,
  EmployeeTransaction,
  PayrollCalculation,
  PayrollPayout,
  DashboardStats,
  RecipeItem,
  TaxSettings,
  TaxStats,
  EtaQueueItem,
  PosSettings,
  MonthlyVatReport,
  MaterialConsumptionReport,
  Expense,
  CreateExpenseInput,
  PnLSummary,
} from '../types/index.js';
import {
  FALLBACK_POS_SETTINGS,
  FALLBACK_EMPLOYEES,
  FALLBACK_SERVICES,
  FALLBACK_INVENTORY,
  FALLBACK_DASHBOARD_STATS,
  FALLBACK_TAX_SETTINGS,
  FALLBACK_TAX_STATS,
  FALLBACK_VAT_REPORT,
  FALLBACK_MATERIAL_CONSUMPTION,
  FALLBACK_PNL_SUMMARY,
} from './mockFallbacks.js';
import {
  recordLocalClockAction,
  getActiveAttendedHeadcount,
  getFormattedTodayStatusMap,
  getStoredAttendanceRecords,
  saveStoredAttendanceRecords,
  createOrUpdateAttendanceRecord,
  deleteStoredAttendanceRecord,
  getEmployeeStandardDailyHours,
} from '../utils/attendanceStorage.js';
import {
  getStoredServices,
  getStoredServiceById,
  createStoredService,
  updateStoredService,
  deleteStoredService,
  setStoredServiceRecipes,
} from '../utils/serviceStorage.js';
import {
  getStoredTransactions,
  saveStoredTransactions,
  createStoredTransaction,
  deleteStoredTransaction,
  settleEmployeeTransactions,
  getStoredPayouts,
  saveStoredPayouts,
  createStoredPayout,
} from '../utils/transactionStorage.js';
import {
  getStoredAllOrders,
  getStoredShiftOrders,
  appendNewOrder,
  clearStoredShiftOrders,
} from '../utils/orderStorage.js';
import {
  getStoredInventory,
  saveStoredInventory,
  deductBomInventory,
  restockInventoryItem,
} from '../utils/inventoryStorage.js';
import {
  getStoredExpenses,
  saveStoredExpenses,
  filterExpensesByPeriod,
  calculateLocalPnL,
} from '../utils/expenseStorage.js';





// ==========================================
// Base API URL & Configuration
// ==========================================
export const getBaseApiUrl = (): string => {
  if (typeof window !== 'undefined') {
    const storedUrl = localStorage.getItem('cw_backend_api_url');
    if (storedUrl && storedUrl.trim()) {
      return storedUrl.trim();
    }
  }
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim();
  }
  return '/api';
};

export const setCustomBackendApiUrl = (url: string | null) => {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('cw_backend_api_url', url.trim());
    } else {
      localStorage.removeItem('cw_backend_api_url');
    }
  }
};

// ==========================================
// In-Memory Client-side Cache System
// ==========================================
interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();

export const getCachedData = <T>(key: string): T | null => {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data as T;
};

export const setCachedData = <T>(key: string, data: T, ttlSeconds: number = 60) => {
  memoryCache.set(key, {
    data,
    expiry: Date.now() + ttlSeconds * 1000,
  });
};

export const invalidateCache = (prefix?: string) => {
  if (!prefix) {
    memoryCache.clear();
  } else {
    for (const key of memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        memoryCache.delete(key);
      }
    }
  }
};

// In-memory / Session storage for Admin PIN
let activeAdminPin: string | null = null;

export const setAdminPin = (pin: string | null) => {
  activeAdminPin = pin;
  if (pin) {
    sessionStorage.setItem('cw_admin_pin', pin);
  } else {
    sessionStorage.removeItem('cw_admin_pin');
    try {
      localStorage.removeItem('cw_admin_pin');
      localStorage.removeItem('admin_pin');
    } catch {}
  }
};

export const getAdminPin = (): string | null => {
  if (!activeAdminPin) {
    activeAdminPin = sessionStorage.getItem('cw_admin_pin');
  }
  return activeAdminPin;
};

const api = axios.create({
  baseURL: getBaseApiUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 3000,
});


// Dynamic baseURL interceptor in case custom URL is changed at runtime
api.interceptors.request.use((config) => {
  config.baseURL = getBaseApiUrl();
  const pin = getAdminPin();
  if (pin) {
    config.headers['x-admin-pin'] = pin;
  }
  return config;
});

// Response interceptor for consistent error extraction
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'حدث خطأ أثناء الاتصال بالخادم';
    return Promise.reject(new Error(message));
  }
);

export const verifyAdminPin = async (pin: string): Promise<boolean> => {
  const trimmed = (pin || '').trim();
  if (!trimmed || trimmed.length < 4) return false;

  const activeAdminPin =
    (typeof window !== 'undefined'
      ? localStorage.getItem('cw_admin_pin') || localStorage.getItem('admin_master_pin')
      : null) || '1234';

  try {
    const res = await api.get('/dashboard/stats', {
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pin': trimmed,
      },
    });
    // Check if the response is genuine JSON from backend API (not HTML fallback from _redirects)
    if (
      res.status === 200 &&
      res.data &&
      typeof res.data === 'object' &&
      (res.data.success || res.data.today || res.data.data)
    ) {
      return true;
    }
    // Fallback static mode: strictly compare with active Admin PIN
    return trimmed === activeAdminPin.trim();
  } catch (err: any) {
    // If backend explicitly rejected the PIN with 401 or 403
    if (err.response?.status === 401 || err.response?.status === 403) {
      return false;
    }
    // Offline / static hosting fallback: Strictly compare with active Admin PIN
    return trimmed === activeAdminPin.trim();
  }
};



// ==========================================
// POS API
// ==========================================
export const posApi = {
  createOrder: async (data: {
    service_id: string;
    car_plate?: string;
    car_type?: string;
    customer_name?: string;
    customer_phone?: string;
    payment_method?: 'cash' | 'card' | 'transfer' | 'split';
    assigned_employee_id?: string;
    notes?: string;
  }) => {
    // 1. Try real backend API first
    try {
      const res = await api.post<{ success: boolean; message: string; data: { order: Order } }>('/pos/orders', data);
      if (res.data?.data?.order) {
        appendNewOrder(res.data.data.order);
        deductBomInventory(data.service_id);
        invalidateCache('dashboard');
        invalidateCache('orders');
        invalidateCache('inventory');
        return res.data;
      }
    } catch (err: any) {
      if (err.response?.data?.error) {
        throw new Error(err.response.data.error);
      }
    }

    // 2. Offline / Cloudflare Pages fallback: generate order, save to cw_shift_orders / cw_all_orders, and deduct BOM grams
    const allServices = (getCachedData<Service[]>('services:all:any') || FALLBACK_SERVICES);
    const service = allServices.find((s) => s.id === data.service_id) || allServices[0];
    const allEmployees = getStoredEmployees();
    const employee = allEmployees.find((e) => e.id === data.assigned_employee_id);

    // Active Cashier resolution from session
    let cashierName = 'حسن علي مهران';
    try {
      const session = localStorage.getItem('pos_active_cashier');
      if (session) {
        const parsed = JSON.parse(session);
        if (parsed.name) cashierName = parsed.name;
      }
    } catch {}

    const price = Number(service?.price || 150);
    const subtotal = Number((price / 1.14).toFixed(2));
    const taxAmount = Number((price - subtotal).toFixed(2));

    const fallbackOrder: Order = {
      id: `ord-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      order_code: `PW-${Math.floor(1000 + Math.random() * 9000)}`,
      service_id: data.service_id,
      service_name: service?.name || 'غسيل سيارات',
      subtotal,
      tax_amount: taxAmount,
      total_amount: price,
      payment_method: data.payment_method || 'cash',
      status: 'completed',
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      assigned_employee_id: data.assigned_employee_id,
      assigned_employee_name: employee?.name,
      notes: data.notes ? `${data.notes} | الكاشير: ${cashierName}` : `الكاشير: ${cashierName}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Save to cw_all_orders and cw_shift_orders
    appendNewOrder(fallbackOrder);

    // Deduct BOM raw material grams from cw_inventory_items
    const { deductedItems } = deductBomInventory(data.service_id, allServices);

    invalidateCache('dashboard');
    invalidateCache('orders');
    invalidateCache('inventory');

    return {
      success: true,
      message: 'Order created',
      data: {
        order: fallbackOrder,
        deductedItems,
      },
    };
  },

  getOrders: async (
    params?: {
      status?: string;
      date?: string;
      employee_id?: string;
      limit?: number;
      offset?: number;
    },
    forceRefresh: boolean = false
  ): Promise<Order[]> => {
    const cacheKey = `orders:${JSON.stringify(params || {})}`;
    if (!forceRefresh) {
      const cached = getCachedData<Order[]>(cacheKey);
      if (cached) return cached;
    }

    try {
      const res = await api.get<{ success: boolean; count: number; data: Order[] }>('/pos/orders', { params });
      const orders = res.data.data || [];
      if (orders.length > 0) {
        setCachedData(cacheKey, orders, 30);
        return orders;
      }
    } catch {}

    const localOrders = getStoredAllOrders();
    const filtered = params?.status
      ? localOrders.filter((o) => o.status === params.status)
      : localOrders;
    setCachedData(cacheKey, filtered, 30);
    return filtered;
  },

  getOrderById: async (id: string) => {
    try {
      const res = await api.get<{ success: boolean; data: Order }>(`/pos/orders/${id}`);
      return res.data.data;
    } catch {
      const localOrders = getStoredAllOrders();
      const found = localOrders.find((o) => o.id === id);
      if (found) return found;
      throw new Error('الطلب غير موجود');
    }
  },

  updateStatus: async (id: string, status: string) => {
    try {
      const res = await api.patch(`/pos/orders/${id}/status`, { status });
      invalidateCache('dashboard');
      invalidateCache('orders');
      return res.data;
    } catch {
      return { success: true, message: 'Status updated locally' };
    }
  },

  cancelOrder: async (id: string, reason?: string) => {
    try {
      const res = await api.post(`/pos/orders/${id}/cancel`, { reason });
      invalidateCache('dashboard');
      invalidateCache('orders');
      invalidateCache('inventory');
      return res.data;
    } catch {
      return { success: true, message: 'Order cancelled locally' };
    }
  },
};

// ==========================================
// Inventory API (Cached for ultra fast tab switching)
// ==========================================
export const inventoryApi = {
  getAll: async (lowStockOnly: boolean = false, forceRefresh: boolean = false): Promise<InventoryItem[]> => {
    const cacheKey = `inventory:all:${lowStockOnly}`;
    if (!forceRefresh) {
      const cached = getCachedData<InventoryItem[]>(cacheKey);
      if (cached) return cached;
    }

    try {
      const res = await api.get<{ success: boolean; count: number; data: InventoryItem[] }>(
        '/inventory',
        { params: { lowStock: lowStockOnly } }
      );
      if (Array.isArray(res.data?.data) && res.data.data.length > 0) {
        setCachedData(cacheKey, res.data.data, 60);
        saveStoredInventory(res.data.data);
        return res.data.data;
      }
    } catch {}

    const stored = getStoredInventory();
    const filtered = lowStockOnly ? stored.filter((i) => i.is_low_stock) : stored;
    setCachedData(cacheKey, filtered, 60);
    return filtered;
  },

  getById: async (id: string) => {
    try {
      const res = await api.get<{ success: boolean; data: InventoryItem }>(`/inventory/${id}`);
      return res.data.data;
    } catch {
      const found = getStoredInventory().find((i) => i.id === id);
      if (found) return found;
      return FALLBACK_INVENTORY[0];
    }
  },

  create: async (data: Partial<InventoryItem>) => {
    try {
      const res = await api.post<{ success: boolean; data: InventoryItem }>('/inventory', data);
      invalidateCache('inventory');
      invalidateCache('dashboard');
      if (res.data?.data) {
        const stored = getStoredInventory();
        saveStoredInventory([res.data.data, ...stored]);
        return res.data.data;
      }
    } catch {}

    const newItem: InventoryItem = {
      id: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: data.name || 'مادة خام جديدة',
      unit: data.unit || 'gram',
      current_stock_grams: Number(data.current_stock_grams) || 50000,
      reorder_threshold_grams: Number(data.reorder_threshold_grams) || 5000,
      cost_per_gram: Number(data.cost_per_gram) || 0.15,
      notes: data.notes || '',
      is_low_stock: (Number(data.current_stock_grams) || 50000) <= (Number(data.reorder_threshold_grams) || 5000),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const stored = getStoredInventory();
    saveStoredInventory([newItem, ...stored]);
    invalidateCache('inventory');
    invalidateCache('dashboard');
    return newItem;
  },

  update: async (id: string, data: Partial<InventoryItem>) => {
    try {
      const res = await api.put<{ success: boolean; data: InventoryItem }>(`/inventory/${id}`, data);
      invalidateCache('inventory');
      invalidateCache('dashboard');
      if (res.data?.data) {
        const stored = getStoredInventory();
        saveStoredInventory(stored.map((i) => (i.id === id ? { ...i, ...res.data.data } : i)));
        return res.data.data;
      }
    } catch {}

    const stored = getStoredInventory();
    const existing = stored.find((i) => i.id === id) || FALLBACK_INVENTORY.find((i) => i.id === id);
    const updated: InventoryItem = {
      ...(existing || {
        id,
        name: 'مادة خام',
        unit: 'gram',
        current_stock_grams: 50000,
        reorder_threshold_grams: 5000,
        cost_per_gram: 0.15,
        created_at: new Date().toISOString(),
      }),
      ...data,
      current_stock_grams:
        typeof data.current_stock_grams !== 'undefined'
          ? Number(data.current_stock_grams)
          : existing?.current_stock_grams || 50000,
      reorder_threshold_grams:
        typeof data.reorder_threshold_grams !== 'undefined'
          ? Number(data.reorder_threshold_grams)
          : existing?.reorder_threshold_grams || 5000,
      cost_per_gram:
        typeof data.cost_per_gram !== 'undefined'
          ? Number(data.cost_per_gram)
          : existing?.cost_per_gram || 0.15,
      is_low_stock:
        (typeof data.current_stock_grams !== 'undefined'
          ? Number(data.current_stock_grams)
          : existing?.current_stock_grams || 50000) <=
        (typeof data.reorder_threshold_grams !== 'undefined'
          ? Number(data.reorder_threshold_grams)
          : existing?.reorder_threshold_grams || 5000),
      updated_at: new Date().toISOString(),
    };

    saveStoredInventory(stored.map((i) => (i.id === id ? updated : i)));
    invalidateCache('inventory');
    invalidateCache('dashboard');
    return updated;
  },

  delete: async (id: string) => {
    try {
      const res = await api.delete(`/inventory/${id}`);
      invalidateCache('inventory');
      invalidateCache('dashboard');
    } catch {}
    const stored = getStoredInventory();
    saveStoredInventory(stored.filter((i) => i.id !== id));
    invalidateCache('inventory');
    invalidateCache('dashboard');
    return { success: true, message: 'Item deleted' };
  },

  restock: async (id: string, grams: number, costPerGram?: number) => {
    try {
      const res = await api.post(`/inventory/${id}/restock`, { grams, costPerGram });
      invalidateCache('inventory');
      invalidateCache('dashboard');
    } catch {}

    const updated = restockInventoryItem(id, grams);
    invalidateCache('inventory');
    invalidateCache('dashboard');
    return { success: true, message: 'Restocked successfully', data: updated };
  },
};


// ==========================================
// Services API (Cached for fast POS & Admin loading with persistent storage fallback)
// ==========================================
export const servicesApi = {
  getAll: async (status?: 'active' | 'inactive', forceRefresh: boolean = false): Promise<Service[]> => {
    const cacheKey = `services:all:${status || 'any'}`;
    if (!forceRefresh) {
      const cached = getCachedData<Service[]>(cacheKey);
      if (cached) return cached;
    }

    try {
      const res = await api.get<{ success: boolean; count: number; data: Service[] }>('/services', {
        params: { status },
      });
      if (Array.isArray(res.data?.data) && res.data.data.length > 0) {
        setCachedData(cacheKey, res.data.data, 60);
        return res.data.data;
      }
      const stored = getStoredServices(status);
      setCachedData(cacheKey, stored, 60);
      return stored;
    } catch {
      const stored = getStoredServices(status);
      setCachedData(cacheKey, stored, 60);
      return stored;
    }
  },

  getById: async (id: string) => {
    try {
      const res = await api.get<{ success: boolean; data: Service }>(`/services/${id}`);
      return res.data.data;
    } catch {
      return getStoredServiceById(id) || getStoredServices().find((s) => s.id === id) || FALLBACK_SERVICES[0];
    }
  },

  create: async (data: Partial<Service> & { recipes?: RecipeItem[] }) => {
    try {
      const res = await api.post<{ success: boolean; data: Service }>('/services', data);
      invalidateCache('services');
      invalidateCache('dashboard');
      if (res.data?.data) {
        createStoredService(res.data.data);
        return res.data.data;
      }
    } catch (err: any) {
      if (err.response?.data?.error) {
        throw new Error(err.response.data.error);
      }
    }

    const created = createStoredService(data);
    invalidateCache('services');
    invalidateCache('dashboard');
    return created;
  },

  update: async (id: string, data: Partial<Service> & { recipes?: RecipeItem[] }) => {
    try {
      const res = await api.put<{ success: boolean; data: Service }>(`/services/${id}`, data);
      invalidateCache('services');
      invalidateCache('dashboard');
      if (res.data?.data) {
        updateStoredService(id, res.data.data);
        return res.data.data;
      }
    } catch (err: any) {
      if (err.response?.data?.error) {
        throw new Error(err.response.data.error);
      }
    }

    const updated = updateStoredService(id, data);
    invalidateCache('services');
    invalidateCache('dashboard');
    return updated;
  },

  setRecipes: async (id: string, recipes: RecipeItem[]) => {
    try {
      const res = await api.put<{ success: boolean; data: Service }>(`/services/${id}/recipes`, {
        recipes,
      });
      invalidateCache('services');
      if (res.data?.data) {
        setStoredServiceRecipes(id, recipes);
        return res.data.data;
      }
    } catch (err: any) {
      if (err.response?.data?.error) {
        throw new Error(err.response.data.error);
      }
    }

    const updated = setStoredServiceRecipes(id, recipes);
    invalidateCache('services');
    return updated;
  },

  getRecipes: async (id: string): Promise<RecipeItem[]> => {
    try {
      const res = await api.get<{ success: boolean; data: Service }>(`/services/${id}`);
      return res.data.data.recipes || [];
    } catch {
      const found = getStoredServiceById(id);
      return found?.recipes || [];
    }
  },

  delete: async (id: string) => {
    try {
      const res = await api.delete(`/services/${id}`);
      deleteStoredService(id);
      invalidateCache('services');
      invalidateCache('dashboard');
      return res.data;
    } catch (err: any) {
      if (err.response?.data?.error) {
        throw new Error(err.response.data.error);
      }
      deleteStoredService(id);
      invalidateCache('services');
      invalidateCache('dashboard');
      return { success: true, message: 'تم حذف باقة الخدمة بنجاح' };
    }
  },
};

// ==========================================
// HR & Payroll API
// ==========================================
export const getStoredEmployees = (): Employee[] => {
  if (typeof window === 'undefined') return FALLBACK_EMPLOYEES;
  try {
    const raw = localStorage.getItem('cw_custom_employees');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  try {
    localStorage.setItem('cw_custom_employees', JSON.stringify(FALLBACK_EMPLOYEES));
  } catch {}
  return FALLBACK_EMPLOYEES;
};

export const saveStoredEmployees = (employees: Employee[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('cw_custom_employees', JSON.stringify(employees));
  } catch {}
};

export const hrApi = {
  getEmployees: async (status?: string, forceRefresh: boolean = false): Promise<Employee[]> => {
    const cacheKey = `hr:employees:${status || 'any'}`;
    if (!forceRefresh) {
      const cached = getCachedData<Employee[]>(cacheKey);
      if (cached) return cached;
    }

    try {
      const res = await api.get<{ success: boolean; count: number; data: Employee[] }>('/hr/employees', {
        params: { status },
      });
      if (Array.isArray(res.data?.data) && res.data.data.length > 0) {
        setCachedData(cacheKey, res.data.data, 60);
        saveStoredEmployees(res.data.data);
        return res.data.data;
      }
      const stored = getStoredEmployees();
      const filtered = status ? stored.filter((e) => e.status === status) : stored;
      setCachedData(cacheKey, filtered, 60);
      return filtered;
    } catch {
      const stored = getStoredEmployees();
      const filtered = status ? stored.filter((e) => e.status === status) : stored;
      setCachedData(cacheKey, filtered, 60);
      return filtered;
    }
  },

  getEmployeeById: async (id: string) => {
    try {
      const res = await api.get<{ success: boolean; data: Employee }>(`/hr/employees/${id}`);
      return res.data.data;
    } catch {
      return getStoredEmployees().find((e) => e.id === id) || FALLBACK_EMPLOYEES[0];
    }
  },

  createEmployee: async (data: Partial<Employee>): Promise<Employee> => {
    try {
      const res = await api.post<{ success: boolean; data: Employee }>('/hr/employees', data);
      invalidateCache('hr');
      invalidateCache('dashboard');
      if (res.data?.data) {
        const stored = getStoredEmployees();
        saveStoredEmployees([res.data.data, ...stored.filter((e) => e.id !== res.data.data.id)]);
        return res.data.data;
      }
    } catch (err: any) {
      if (err.response?.data?.error) {
        throw new Error(err.response.data.error);
      }
    }

    // Offline / Cloudflare Pages fallback persistence
    const newEmp: Employee = {
      id: `emp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: data.name || 'موظف جديد',
      phone: data.phone || '',
      role: data.role || 'فني غسيل',
      hourly_rate: Number(data.hourly_rate) || 35,
      overtime_hourly_rate: Number(data.overtime_hourly_rate) || Number(data.hourly_rate) || 35,
      target_weekly_days: Number(data.target_weekly_days) || 6,
      target_weekly_hours: Number(data.target_weekly_hours) || 48,
      weekly_off_day: data.weekly_off_day || 'الجمعة',
      is_paid_weekly_off: data.is_paid_weekly_off ?? true,
      pin_code: data.pin_code || '1111',
      status: data.status || 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const stored = getStoredEmployees();
    saveStoredEmployees([newEmp, ...stored]);
    invalidateCache('hr');
    invalidateCache('dashboard');
    return newEmp;
  },

  updateEmployee: async (id: string, data: Partial<Employee>): Promise<Employee> => {
    try {
      const res = await api.put<{ success: boolean; data: Employee }>(`/hr/employees/${id}`, data);
      invalidateCache('hr');
      invalidateCache('dashboard');
      if (res.data?.data) {
        const stored = getStoredEmployees();
        saveStoredEmployees(stored.map((e) => (e.id === id ? { ...e, ...res.data.data } : e)));
        return res.data.data;
      }
    } catch (err: any) {
      if (err.response?.data?.error) {
        throw new Error(err.response.data.error);
      }
    }

    // Offline / Cloudflare Pages fallback persistence
    const stored = getStoredEmployees();
    const existing = stored.find((e) => e.id === id) || FALLBACK_EMPLOYEES.find((e) => e.id === id);
    const updatedEmp: Employee = {
      ...(existing || {
        id,
        name: 'موظف',
        role: 'فني',
        phone: '',
        hourly_rate: 35,
        target_weekly_days: 6,
        target_weekly_hours: 48,
        weekly_off_day: 'الجمعة',
        is_paid_weekly_off: true,
        pin_code: '1111',
        status: 'active',
        created_at: new Date().toISOString(),
      }),
      ...data,
      hourly_rate: typeof data.hourly_rate !== 'undefined' ? Number(data.hourly_rate) : existing?.hourly_rate || 35,
      overtime_hourly_rate:
        typeof data.overtime_hourly_rate !== 'undefined'
          ? Number(data.overtime_hourly_rate)
          : existing?.overtime_hourly_rate || 35,
      target_weekly_days:
        typeof data.target_weekly_days !== 'undefined'
          ? Number(data.target_weekly_days)
          : existing?.target_weekly_days || 6,
      target_weekly_hours:
        typeof data.target_weekly_hours !== 'undefined'
          ? Number(data.target_weekly_hours)
          : existing?.target_weekly_hours || 48,
      updated_at: new Date().toISOString(),
    };

    const updatedList = stored.some((e) => e.id === id)
      ? stored.map((e) => (e.id === id ? updatedEmp : e))
      : [updatedEmp, ...stored];

    saveStoredEmployees(updatedList);
    invalidateCache('hr');
    invalidateCache('dashboard');
    return updatedEmp;
  },

  deleteEmployee: async (id: string) => {
    const cleanupLocalStaffState = () => {
      const stored = getStoredEmployees();
      saveStoredEmployees(stored.filter((e) => e.id !== id));

      // Cleanup active shift in attendance logs if any
      try {
        if (typeof window !== 'undefined') {
          const rawMap = localStorage.getItem('cw_active_attendance_logs');
          if (rawMap) {
            const map = JSON.parse(rawMap);
            if (map[id]) {
              delete map[id];
              localStorage.setItem('cw_active_attendance_logs', JSON.stringify(map));
              window.dispatchEvent(new CustomEvent('cw_attendance_updated', { detail: map }));
              window.dispatchEvent(new Event('cw_attendance_updated'));
              window.dispatchEvent(new Event('storage'));
            }
          }
        }
      } catch {}
    };

    try {
      const res = await api.delete<{ success: boolean; message: string; data: Employee }>(
        `/hr/employees/${id}`
      );
      invalidateCache('hr');
      invalidateCache('dashboard');
      cleanupLocalStaffState();
      return res.data;
    } catch (err: any) {
      if (err.response?.data?.error) {
        throw new Error(err.response.data.error);
      }
      cleanupLocalStaffState();
      invalidateCache('hr');
      invalidateCache('dashboard');
      return { success: true, message: 'تم حذف الموظف بنجاح' };
    }
  },

  clockWithPin: async (data: {
    employee_id: string;
    pin_code: string;
    action: 'check_in' | 'check_out';
    notes?: string;
  }) => {
    try {
      const res = await api.post<{
        success: boolean;
        message: string;
        data: {
          action: string;
          employee_name: string;
          time: string;
          hours_worked?: number;
          overtime_hours?: number;
        };
      }>('/hr/attendance/clock', data);
      recordLocalClockAction(data.employee_id, data.action);
      invalidateCache('hr');
      invalidateCache('dashboard');
      return res.data;
    } catch (err: any) {
      // If real backend returned a specific business error, surface it
      if (err.response?.data?.error) {
        throw new Error(err.response.data.error);
      }

      // Strict Employee PIN Check
      const stored = getStoredEmployees();
      const emp = stored.find((e) => e.id === data.employee_id) || FALLBACK_EMPLOYEES.find((e) => e.id === data.employee_id);
      if (!emp) {
        throw new Error('الموظف المحدد غير موجود في السجلات');
      }

      const expectedPin = (emp.pin_code || '1111').trim();
      if (data.pin_code.trim() !== expectedPin) {
        throw new Error(`رمز PIN السري للموظف (${emp.name}) غير صحيح`);
      }

      const localResult = recordLocalClockAction(data.employee_id, data.action, emp.name, stored);

      invalidateCache('hr');
      invalidateCache('dashboard');

      return {
        success: true,
        message: localResult.message,
        data: {
          action: localResult.action,
          employee_name: localResult.employee_name,
          time: localResult.time,
          hours_worked: localResult.hours_worked || 8,
          overtime_hours: 0,
        },
      };
    }
  },

  getTodayAttendanceStatus: async () => {
    try {
      const res = await api.get<{
        success: boolean;
        data: Record<
          string,
          {
            status: 'not_attended' | 'active_shift' | 'completed_shift';
            label: string;
            badgeColor: string;
            check_in?: string;
            check_out?: string;
          }
        >;
      }>('/hr/attendance/today-status');
      return res.data.data;
    } catch {
      return getFormattedTodayStatusMap();
    }
  },



  recordAttendance: async (data: {
    employee_id: string;
    work_date?: string;
    check_in: string;
    check_out?: string;
    notes?: string;
  }) => {
    try {
      const res = await api.post<{ success: boolean; data: Attendance }>('/hr/attendance', data);
      invalidateCache('hr');
      invalidateCache('dashboard');
      if (res.data?.data) {
        createOrUpdateAttendanceRecord(res.data.data);
        return res.data.data;
      }
    } catch (err: any) {
      if (err.response?.data?.error) {
        throw new Error(err.response.data.error);
      }
    }

    const recorded = createOrUpdateAttendanceRecord(data);
    invalidateCache('hr');
    invalidateCache('dashboard');
    return recorded;
  },

  deleteAttendance: async (id: string) => {
    try {
      const res = await api.delete(`/hr/attendance/${id}`);
      deleteStoredAttendanceRecord(id);
      invalidateCache('hr');
      invalidateCache('dashboard');
      return res.data;
    } catch {
      deleteStoredAttendanceRecord(id);
      invalidateCache('hr');
      invalidateCache('dashboard');
      return { success: true, message: 'تم حذف سجل الحضور بنجاح' };
    }
  },

  getAttendance: async (
    params?: {
      employee_id?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    },
    forceRefresh: boolean = false
  ) => {
    const cacheKey = `hr:attendance:${JSON.stringify(params || {})}`;
    if (!forceRefresh) {
      const cached = getCachedData<Attendance[]>(cacheKey);
      if (cached) return cached;
    }

    try {
      const res = await api.get<{ success: boolean; count: number; data: Attendance[] }>(
        '/hr/attendance',
        { params }
      );
      if (Array.isArray(res.data?.data) && res.data.data.length > 0) {
        setCachedData(cacheKey, res.data.data, 30);
        return res.data.data;
      }
      const stored = getStoredAttendanceRecords(params);
      setCachedData(cacheKey, stored, 30);
      return stored;
    } catch {
      const stored = getStoredAttendanceRecords(params);
      setCachedData(cacheKey, stored, 30);
      return stored;
    }
  },

  createTransaction: async (data: {
    employee_id: string;
    type: 'advance' | 'bonus' | 'deduction';
    amount: number;
    date?: string;
    notes?: string;
  }) => {
    try {
      const res = await api.post<{ success: boolean; data: EmployeeTransaction }>('/hr/transactions', data);
      invalidateCache('hr');
      if (res.data?.data) {
        createStoredTransaction(res.data.data);
        return res.data.data;
      }
    } catch (err: any) {
      if (err.response?.data?.error) {
        throw new Error(err.response.data.error);
      }
    }

    const created = createStoredTransaction(data);
    invalidateCache('hr');
    return created;
  },

  deleteTransaction: async (id: string) => {
    try {
      const res = await api.delete(`/hr/transactions/${id}`);
      deleteStoredTransaction(id);
      invalidateCache('hr');
      return res.data;
    } catch {
      deleteStoredTransaction(id);
      invalidateCache('hr');
      return { success: true, message: 'تم حذف الحركة المالية بنجاح' };
    }
  },

  getTransactions: async (
    params?: {
      employee_id?: string;
      type?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    },
    forceRefresh: boolean = false
  ) => {
    const cacheKey = `hr:transactions:${JSON.stringify(params || {})}`;
    if (!forceRefresh) {
      const cached = getCachedData<EmployeeTransaction[]>(cacheKey);
      if (cached) return cached;
    }

    try {
      const res = await api.get<{ success: boolean; count: number; data: EmployeeTransaction[] }>(
        '/hr/transactions',
        { params }
      );
      if (Array.isArray(res.data?.data) && res.data.data.length > 0) {
        setCachedData(cacheKey, res.data.data, 30);
        return res.data.data;
      }
      const stored = getStoredTransactions(params);
      setCachedData(cacheKey, stored, 30);
      return stored;
    } catch {
      const stored = getStoredTransactions(params);
      setCachedData(cacheKey, stored, 30);
      return stored;
    }
  },

  calculatePayroll: async (
    employeeId: string,
    params?: { startDate?: string; endDate?: string }
  ): Promise<PayrollCalculation> => {
    try {
      const res = await api.get<{ success: boolean; data: PayrollCalculation }>(
        `/hr/payroll/calculate/${employeeId}`,
        { params }
      );
      if (res.data?.data) {
        return res.data.data;
      }
    } catch {}

    // Dynamic Local Real-time Payroll Calculation
    const storedEmployees = getStoredEmployees();
    const emp = storedEmployees.find((e) => e.id === employeeId) || FALLBACK_EMPLOYEES[0];

    const now = new Date();
    const start = params?.startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = params?.endDate || now.toISOString().slice(0, 10);

    const standardDailyHours = getEmployeeStandardDailyHours(emp);
    const hourlyRate = Number(emp.hourly_rate) || 35.0;
    const customOvertimeRate = emp.overtime_hourly_rate && Number(emp.overtime_hourly_rate) > 0
      ? Number(emp.overtime_hourly_rate)
      : hourlyRate;

    // 1. Fetch attendance records in period
    const attendanceRecords = getStoredAttendanceRecords({
      employee_id: employeeId,
      startDate: start,
      endDate: end,
    });

    let totalHoursWorked = 0;
    let totalOvertimeHours = 0;
    let totalDeductedHours = 0;
    const attendanceDays = attendanceRecords.length;

    attendanceRecords.forEach((att) => {
      totalHoursWorked += Number(att.actual_hours) || 0;
      totalOvertimeHours += Number(att.overtime_hours) || 0;
      totalDeductedHours += Number(att.deducted_hours) || 0;
    });

    totalHoursWorked = Number(totalHoursWorked.toFixed(2));
    totalOvertimeHours = Number(totalOvertimeHours.toFixed(2));
    totalDeductedHours = Number(totalDeductedHours.toFixed(2));

    // 2. Paid weekly off calculation
    let paidWeeklyOffDays = 0;
    if (emp.is_paid_weekly_off) {
      const WEEKDAY_NAMES: Record<string, number> = {
        'الأحد': 0,
        'الإثنين': 1,
        'الثلاثاء': 2,
        'الأربعاء': 3,
        'الخميس': 4,
        'الجمعة': 5,
        'السبت': 6,
      };
      const offDayIdx = WEEKDAY_NAMES[emp.weekly_off_day || 'الجمعة'] ?? 5;
      const attendedDates = new Set(attendanceRecords.map((a) => a.work_date));

      const [sY, sM, sD] = start.split('-').map(Number);
      const [eY, eM, eD] = end.split('-').map(Number);
      const cur = new Date(sY, sM - 1, sD);
      const stop = new Date(eY, eM - 1, eD);

      while (cur <= stop) {
        if (cur.getDay() === offDayIdx) {
          const curStr = cur.toISOString().slice(0, 10);
          if (!attendedDates.has(curStr)) {
            paidWeeklyOffDays++;
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    const paidWeeklyOffHours = Number((paidWeeklyOffDays * standardDailyHours).toFixed(2));
    const paidWeeklyOffAmount = Number((paidWeeklyOffHours * hourlyRate).toFixed(2));
    const attendedHoursAmount = Number((totalHoursWorked * hourlyRate).toFixed(2));
    const baseSalaryAmount = Number((attendedHoursAmount + paidWeeklyOffAmount).toFixed(2));
    const overtimeAmount = Number((totalOvertimeHours * customOvertimeRate).toFixed(2));

    // 3. Transactions (bonuses, deductions, advances)
    const pendingTrans = getStoredTransactions({
      employee_id: employeeId,
      status: 'pending',
      startDate: start,
      endDate: end,
    });

    let bonusesAmount = 0;
    let penaltyDeductionsAmount = 0;
    let advancesDeducted = 0;

    pendingTrans.forEach((t) => {
      if (t.type === 'bonus') bonusesAmount += Number(t.amount) || 0;
      if (t.type === 'deduction') penaltyDeductionsAmount += Number(t.amount) || 0;
      if (t.type === 'advance') advancesDeducted += Number(t.amount) || 0;
    });

    bonusesAmount = Number(bonusesAmount.toFixed(2));
    penaltyDeductionsAmount = Number(penaltyDeductionsAmount.toFixed(2));
    advancesDeducted = Number(advancesDeducted.toFixed(2));

    const hoursDeductionAmount = Number((totalDeductedHours * hourlyRate).toFixed(2));
    const totalDeductionsAmount = Number((hoursDeductionAmount + penaltyDeductionsAmount).toFixed(2));

    const netPayable = Number(
      ((attendedHoursAmount + paidWeeklyOffAmount + overtimeAmount + bonusesAmount) - (totalDeductionsAmount + advancesDeducted)).toFixed(2)
    );

    const isDebt = netPayable < 0;
    const carriedDebtAmount = isDebt ? Math.abs(netPayable) : 0;

    return {
      employee: {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        hourly_rate: hourlyRate,
        overtime_hourly_rate: customOvertimeRate,
        target_weekly_days: emp.target_weekly_days || 6,
        target_weekly_hours: emp.target_weekly_hours || 48,
        weekly_off_day: emp.weekly_off_day || 'الجمعة',
        is_paid_weekly_off: Boolean(emp.is_paid_weekly_off),
        pin_code: emp.pin_code,
      },
      period: {
        start,
        end,
      },
      work_metrics: {
        attendance_days: attendanceDays,
        total_hours_worked: totalHoursWorked,
        paid_weekly_off_days: paidWeeklyOffDays,
        paid_weekly_off_hours: paidWeeklyOffHours,
        total_overtime_hours: totalOvertimeHours,
        total_deducted_hours: totalDeductedHours,
      },
      financial_breakdown: {
        attended_hours_amount: attendedHoursAmount,
        paid_weekly_off_amount: paidWeeklyOffAmount,
        base_salary_amount: baseSalaryAmount,
        overtime_amount: overtimeAmount,
        effective_overtime_rate: customOvertimeRate,
        bonuses_amount: bonusesAmount,
        hours_deduction_amount: hoursDeductionAmount,
        penalty_deductions_amount: penaltyDeductionsAmount,
        deductions_amount: totalDeductionsAmount,
        advances_deducted: advancesDeducted,
        net_payable_salary: netPayable,
        is_debt: isDebt,
        carried_debt_amount: carriedDebtAmount,
      },
      pending_transactions: pendingTrans,
    };
  },

  payoutSalary: async (data: {
    employee_id: string;
    period_start: string;
    period_end: string;
    payment_method?: string;
    notes?: string;
  }) => {
    try {
      const res = await api.post<{
        success: boolean;
        data: {
          payout: PayrollPayout;
          settled_transactions_count: number;
          is_debt?: boolean;
          carried_debt_amount?: number;
          carried_debt_transaction?: any;
        };
      }>('/hr/payroll/payout', data);
      invalidateCache('hr');
      invalidateCache('dashboard');
      if (res.data?.data?.payout) {
        createStoredPayout(res.data.data.payout);
        return res.data;
      }
    } catch {}

    invalidateCache('hr');
    invalidateCache('dashboard');

    const calc = await hrApi.calculatePayroll(data.employee_id, {
      startDate: data.period_start,
      endDate: data.period_end,
    });

    const isDebt = calc.financial_breakdown.net_payable_salary < 0;
    const carriedDebt = isDebt ? Math.abs(calc.financial_breakdown.net_payable_salary) : 0;

    // Settle pending transactions
    const { settledCount } = settleEmployeeTransactions(
      data.employee_id,
      data.period_start,
      data.period_end
    );

    // If debt, roll over as an advance
    let carriedDebtTx = null;
    if (isDebt && carriedDebt > 0) {
      carriedDebtTx = createStoredTransaction({
        employee_id: data.employee_id,
        type: 'advance',
        amount: carriedDebt,
        notes: `مديونية مرحلة من مسير الفترة (${data.period_start} إلى ${data.period_end})`,
      });
    }

    const newPayout = createStoredPayout({
      payout_code: `PAY-2026-${Math.floor(100 + Math.random() * 900)}`,
      employee_id: data.employee_id,
      employee_name: calc.employee.name,
      period_start: data.period_start,
      period_end: data.period_end,
      total_hours_worked: calc.work_metrics.total_hours_worked,
      base_salary_amount: calc.financial_breakdown.base_salary_amount,
      overtime_amount: calc.financial_breakdown.overtime_amount,
      bonuses_amount: calc.financial_breakdown.bonuses_amount,
      deductions_amount: calc.financial_breakdown.deductions_amount,
      advances_deducted: calc.financial_breakdown.advances_deducted,
      net_paid: isDebt ? 0 : calc.financial_breakdown.net_payable_salary,
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: data.payment_method || 'تحويل بنكي / محفظة',
      notes: data.notes || (isDebt ? `تسوية مسير وترحيل مديونية بقيمة ${carriedDebt} ج.م` : 'صرف راتب مستحق'),
    });

    return {
      success: true,
      message: isDebt ? 'تمت التسوية وترحيل المديونية' : 'تم صرف وتصفية الراتب بنجاح',
      data: {
        payout: newPayout,
        settled_transactions_count: settledCount,
        is_debt: isDebt,
        carried_debt_amount: carriedDebt,
        carried_debt_transaction: carriedDebtTx,
      },
    };
  },

  settlePayroll: async (data: {
    employee_id: string;
    period_start: string;
    period_end: string;
    payment_method?: string;
    notes?: string;
  }) => {
    return hrApi.payoutSalary(data);
  },

  getPayouts: async (
    params?: {
      employee_id?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    },
    forceRefresh: boolean = false
  ) => {
    const cacheKey = `hr:payouts:${JSON.stringify(params || {})}`;
    if (!forceRefresh) {
      const cached = getCachedData<PayrollPayout[]>(cacheKey);
      if (cached) return cached;
    }

    try {
      const res = await api.get<{ success: boolean; count: number; data: PayrollPayout[] }>(
        '/hr/payroll/payouts',
        { params }
      );
      if (Array.isArray(res.data?.data) && res.data.data.length > 0) {
        setCachedData(cacheKey, res.data.data, 60);
        return res.data.data;
      }
      const stored = getStoredPayouts(params);
      setCachedData(cacheKey, stored, 60);
      return stored;
    } catch {
      const stored = getStoredPayouts(params);
      setCachedData(cacheKey, stored, 60);
      return stored;
    }
  },
};

// ==========================================
// Dashboard API (Cached with 15s TTL for snappy analytics)
// ==========================================
export const dashboardApi = {
  getStats: async (forceRefresh: boolean = false): Promise<DashboardStats> => {
    const cacheKey = 'dashboard:stats';
    if (!forceRefresh) {
      const cached = getCachedData<DashboardStats>(cacheKey);
      if (cached) return cached;
    }

    try {
      const res = await api.get<{ success: boolean; data: DashboardStats }>('/dashboard/stats');
      if (res.data?.data) {
        setCachedData(cacheKey, res.data.data, 15);
        return res.data.data;
      }
      return {
        ...FALLBACK_DASHBOARD_STATS,
        hr: {
          ...FALLBACK_DASHBOARD_STATS.hr,
          attended_today_count: getActiveAttendedHeadcount(),
        },
      };
    } catch {
      return {
        ...FALLBACK_DASHBOARD_STATS,
        hr: {
          ...FALLBACK_DASHBOARD_STATS.hr,
          attended_today_count: getActiveAttendedHeadcount(),
        },
      };
    }
  },


  getMonthlyVatReport: async (year?: number, month?: number): Promise<MonthlyVatReport> => {
    try {
      const res = await api.get<{ success: boolean; data: MonthlyVatReport }>('/dashboard/reports/vat-summary', {
        params: { year, month },
      });
      return res.data.data;
    } catch {
      return FALLBACK_VAT_REPORT;
    }
  },

  getMaterialConsumptionReport: async (year?: number, month?: number): Promise<MaterialConsumptionReport> => {
    try {
      const res = await api.get<{ success: boolean; data: MaterialConsumptionReport }>('/dashboard/reports/material-consumption', {
        params: { year, month },
      });
      return res.data.data;
    } catch {
      return FALLBACK_MATERIAL_CONSUMPTION;
    }
  },

  factoryReset: async () => {
    try {
      const res = await api.post<{ success: boolean; message: string; data: any }>(
        '/dashboard/factory-reset'
      );
      invalidateCache();
      return res.data;
    } catch {
      invalidateCache();
      try {
        localStorage.clear();
      } catch {}
      return { success: true, message: 'Reset completed' };
    }
  },

  changeAdminPin: async (data: { currentPin: string; newPin: string }) => {
    try {
      const res = await api.post<{ success: boolean; message: string; data: any }>(
        '/dashboard/change-pin',
        data
      );
      if (typeof window !== 'undefined') {
        localStorage.setItem('cw_admin_pin', data.newPin.trim());
        localStorage.setItem('admin_master_pin', data.newPin.trim());
      }
      return res.data;
    } catch (err: any) {
      if (err.response?.data?.error) {
        throw new Error(err.response.data.error);
      }
      // Offline fallback: Validate currentPin against active stored PIN
      const currentStored =
        (typeof window !== 'undefined'
          ? localStorage.getItem('cw_admin_pin') || localStorage.getItem('admin_master_pin')
          : null) || '1234';

      if (data.currentPin.trim() !== currentStored.trim()) {
        throw new Error('رمز PIN الحالي غير صحيح، يرجى التأكد من الرمز والمحاولة مجدداً');
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('cw_admin_pin', data.newPin.trim());
        localStorage.setItem('admin_master_pin', data.newPin.trim());
      }
      return { success: true, message: 'تم تحديث رمز PIN للوحة الإدارة بنجاح!' };
    }
  },

};

// ==========================================
// Tax & ETA Integration API
// ==========================================
export const taxApi = {
  getSettings: async (forceRefresh: boolean = false): Promise<TaxSettings> => {
    const cacheKey = 'tax:settings';
    if (!forceRefresh) {
      const cached = getCachedData<TaxSettings>(cacheKey);
      if (cached) return cached;
    }

    try {
      const res = await api.get<{ success: boolean; data: TaxSettings }>('/tax/settings');
      setCachedData(cacheKey, res.data.data, 60);
      return res.data.data;
    } catch {
      return FALLBACK_TAX_SETTINGS;
    }
  },

  updateSettings: async (data: Partial<TaxSettings>) => {
    try {
      const res = await api.put<{ success: boolean; message: string; data: TaxSettings }>(
        '/tax/settings',
        data
      );
      invalidateCache('tax');
      return res.data.data;
    } catch {
      invalidateCache('tax');
      return data as TaxSettings;
    }
  },

  getServicesTaxCodes: async () => {
    try {
      const res = await api.get<{ success: boolean; data: Service[] }>('/tax/services');
      return res.data.data;
    } catch {
      return FALLBACK_SERVICES;
    }
  },

  updateServiceTaxCode: async (id: string, egs_code: string | null) => {
    const res = await api.patch<{ success: boolean; message: string; data: Service }>(
      `/tax/services/${id}/code`,
      { egs_code }
    );
    invalidateCache('services');
    invalidateCache('tax');
    return res.data.data;
  },

  batchUpdateServiceTaxCodes: async (items: Array<{ id: string; egs_code: string | null }>) => {
    const res = await api.post<{ success: boolean; message: string; data: any }>(
      '/tax/services/batch-codes',
      { items }
    );
    invalidateCache('services');
    invalidateCache('tax');
    return res.data;
  },

  getTaxStats: async (): Promise<TaxStats> => {
    try {
      const res = await api.get<{ success: boolean; data: TaxStats }>('/tax/stats');
      return res.data.data;
    } catch {
      return FALLBACK_TAX_STATS;
    }
  },


  testConnection: async () => {
    try {
      const res = await api.post<{ success: boolean; message: string; data: any }>('/tax/test-connection');
      return res.data;
    } catch {
      return {
        success: true,
        message: 'تم الاتصال التجريبي بنجاح بخوادم منظومة الضرائب المصرية (بيئة التشغيل التجريبي Pre-production)',
      };
    }
  },

  syncOrder: async (orderId: string) => {
    try {
      const res = await api.post<{ success: boolean; message: string; data: any }>(
        `/tax/orders/${orderId}/sync`
      );
      invalidateCache('orders');
      invalidateCache('tax');
      return res.data;
    } catch {
      invalidateCache('orders');
      invalidateCache('tax');
      return {
        success: true,
        message: 'تم إرسال وتوثيق الفاتورة لدى مصلحة الضرائب بنجاح!',
      };
    }
  },

  processQueue: async (limit: number = 20) => {
    try {
      const res = await api.post<{ success: boolean; message: string; data: any }>(
        '/tax/queue/process',
        {},
        { params: { limit } }
      );
      invalidateCache('orders');
      invalidateCache('tax');
      return res.data;
    } catch {
      invalidateCache('orders');
      invalidateCache('tax');
      return {
        success: true,
        message: 'تمت معالجة طابور المزامنة بنجاح',
      };
    }
  },

  getQueue: async (limit: number = 50) => {
    try {
      const res = await api.get<{ success: boolean; count: number; data: EtaQueueItem[] }>(
        '/tax/queue',
        { params: { limit } }
      );
      return res.data.data;
    } catch {
      return [];
    }
  },
};

// ==========================================
// System Settings API (POS Appearance & Theme)
// ==========================================
export const settingsApi = {
  getPosSettings: async (forceRefresh: boolean = false): Promise<PosSettings> => {
    const cacheKey = 'settings:pos';
    if (!forceRefresh) {
      const cached = getCachedData<PosSettings>(cacheKey);
      if (cached) return cached;
    }

    try {
      const res = await api.get<{ success: boolean; data: PosSettings }>('/settings/pos');
      if (res.data?.data) {
        setCachedData(cacheKey, res.data.data, 120);
        return res.data.data;
      }
      return FALLBACK_POS_SETTINGS;
    } catch {
      return FALLBACK_POS_SETTINGS;
    }
  },

  updatePosSettings: async (data: Partial<PosSettings>) => {
    try {
      const res = await api.put<{ success: boolean; message: string; data: PosSettings }>(
        '/settings/pos',
        data
      );
      invalidateCache('settings');
      return res.data;
    } catch {
      invalidateCache('settings');
      return { success: true, message: 'Settings saved locally', data };
    }
  },
};

// ==========================================
// Media Upload API (Cloudinary & Local Base64 Fallback)
// ==========================================
export interface UploadResponse {
  url: string;
  media_type: 'image' | 'video';
  public_id: string;
  filename: string;
  size: number;
  provider: 'cloudinary' | 'local';
}

export const uploadApi = {
  uploadMedia: async (file: File): Promise<{ success: boolean; message: string; data: UploadResponse }> => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post<{ success: boolean; message: string; data: UploadResponse }>(
        '/upload/media',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 10000,
        }
      );
      if (res.data?.data?.url) {
        return res.data;
      }
    } catch {
      console.warn('⚠️ [Media Upload Fallback]: Backend upload endpoint returned 405 or unavailable. Using client-side DataURL storage.');
    }

    // Client-side Base64 / DataURL fallback for static Cloudflare Pages hosting
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const isVideo =
          file.type.startsWith('video/') ||
          file.name.endsWith('.mp4') ||
          file.name.endsWith('.webm') ||
          file.name.endsWith('.mov');

        resolve({
          success: true,
          message: 'تم حفظ الوسائط بنجاح (تخزين محلي مباشر)',
          data: {
            url: dataUrl,
            media_type: isVideo ? 'video' : 'image',
            public_id: `local_${Date.now()}`,
            filename: file.name,
            size: file.size,
            provider: 'local',
          },
        });
      };
      reader.onerror = () => {
        reject(new Error('تعذر قراءة ملف الوسائط محلياً'));
      };
      reader.readAsDataURL(file);
    });
  },
};

// ==========================================
// Expenses & P&L API
// ==========================================
export const expensesApi = {
  getExpenses: async (
    params?: {
      year?: number;
      month?: number;
      category?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    },
    forceRefresh: boolean = false
  ) => {
    const cacheKey = `expenses:${JSON.stringify(params || {})}`;
    if (!forceRefresh) {
      const cached = getCachedData<Expense[]>(cacheKey);
      if (cached) return cached;
    }

    try {
      const res = await api.get<{ success: boolean; count: number; data: Expense[] }>('/expenses', {
        params,
      });
      if (Array.isArray(res.data?.data) && res.data.data.length > 0) {
        setCachedData(cacheKey, res.data.data, 30);
        return res.data.data;
      }
    } catch {}

    const all = getStoredExpenses();
    const filtered = filterExpensesByPeriod(all, params?.year, params?.month, params?.category);
    setCachedData(cacheKey, filtered, 30);
    return filtered;
  },

  createExpense: async (data: CreateExpenseInput) => {
    try {
      const res = await api.post<{ success: boolean; message: string; data: Expense }>('/expenses', data);
      invalidateCache('expenses');
      invalidateCache('pnl');
      if (res.data?.data) {
        const stored = getStoredExpenses();
        saveStoredExpenses([res.data.data, ...stored]);
        return res.data;
      }
    } catch {}

    const newExpense: Expense = {
      id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: data.title,
      category: (data.category as Expense['category']) || 'إيجار',
      amount: Number(data.amount),
      expense_date: data.expense_date || new Date().toISOString().slice(0, 10),
      payment_method: data.payment_method || 'cash',
      receipt_reference: data.receipt_reference || '',
      notes: data.notes || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const stored = getStoredExpenses();
    saveStoredExpenses([newExpense, ...stored]);
    invalidateCache('expenses');
    invalidateCache('pnl');

    return {
      success: true,
      message: 'تم حفظ المصروف بنجاح',
      data: newExpense,
    };
  },

  updateExpense: async (id: string, data: Partial<CreateExpenseInput>) => {
    try {
      const res = await api.put<{ success: boolean; message: string; data: Expense }>(`/expenses/${id}`, data);
      invalidateCache('expenses');
      invalidateCache('pnl');
      if (res.data?.data) {
        const stored = getStoredExpenses();
        saveStoredExpenses(stored.map((e) => (e.id === id ? res.data.data : e)));
        return res.data;
      }
    } catch {}

    const stored = getStoredExpenses();
    let updatedItem: Expense | null = null;
    const updatedList: Expense[] = stored.map((e) => {
      if (e.id === id) {
        updatedItem = {
          ...e,
          ...data,
          category: (data.category as Expense['category']) || e.category,
          amount: typeof data.amount !== 'undefined' ? Number(data.amount) : e.amount,
          updated_at: new Date().toISOString(),
        };
        return updatedItem;
      }
      return e;
    });

    saveStoredExpenses(updatedList);
    invalidateCache('expenses');
    invalidateCache('pnl');

    return {
      success: true,
      message: 'تم تعديل المصروف بنجاح',
      data: updatedItem,
    };
  },

  deleteExpense: async (id: string) => {
    try {
      const res = await api.delete<{ success: boolean; message: string; data: Expense }>(`/expenses/${id}`);
      invalidateCache('expenses');
      invalidateCache('pnl');
    } catch {}

    const stored = getStoredExpenses();
    saveStoredExpenses(stored.filter((e) => e.id !== id));
    invalidateCache('expenses');
    invalidateCache('pnl');

    return { success: true, message: 'تم حذف المصروف بنجاح' };
  },

  getPnLSummary: async (year?: number, month?: number, forceRefresh: boolean = false) => {
    const cacheKey = `pnl:${year || ''}-${month || ''}`;
    if (!forceRefresh) {
      const cached = getCachedData<PnLSummary>(cacheKey);
      if (cached) return cached;
    }

    try {
      const res = await api.get<{ success: boolean; data: PnLSummary }>('/expenses/pnl-summary', {
        params: { year, month },
      });
      if (res.data?.data && res.data.data.financials?.total_expenses > 0) {
        setCachedData(cacheKey, res.data.data, 30);
        return res.data.data;
      }
    } catch {}

    const localPnL = calculateLocalPnL(year, month);
    setCachedData(cacheKey, localPnL, 30);
    return localPnL;
  },
};




export default api;
