import { EmployeeTransaction, PayrollPayout } from '../types/index.js';
import { getCustomStoredEmployees } from './attendanceStorage.js';

const TRANSACTIONS_KEY = 'cw_employee_transactions';
const PAYOUTS_KEY = 'cw_payroll_payouts';

/**
 * Initial demo transactions
 */
const INITIAL_TRANSACTIONS: EmployeeTransaction[] = [
  {
    id: 'tr-init-1',
    employee_id: '9428f33d-b890-4022-b324-9556c8cf6499', // حسن علي مهران
    employee_name: 'حسن علي مهران',
    type: 'bonus',
    amount: 250,
    date: new Date().toISOString().slice(0, 10),
    notes: 'مكافأة تميز وإدارة وردية الجمعة بكفاءة',
    status: 'pending',
    created_at: new Date().toISOString(),
  },
  {
    id: 'tr-init-2',
    employee_id: 'a1de5f26-6440-49a2-ab38-4e20f03b93a6', // أحمد محمود السعيد
    employee_name: 'أحمد محمود السعيد',
    type: 'advance',
    amount: 300,
    date: new Date().toISOString().slice(0, 10),
    notes: 'سلفة مصروفات شخصية على حساب الراتب',
    status: 'pending',
    created_at: new Date().toISOString(),
  },
  {
    id: 'tr-init-3',
    employee_id: '478ec10b-2715-4db8-a432-ea942440f99e', // كريم عبد العال
    employee_name: 'كريم عبد العال',
    type: 'bonus',
    amount: 150,
    date: new Date().toISOString().slice(0, 10),
    notes: 'مكافأة جودة التلميع وسرعة التسليم',
    status: 'pending',
    created_at: new Date().toISOString(),
  },
];

/**
 * Initial demo payouts
 */
const INITIAL_PAYOUTS: PayrollPayout[] = [
  {
    id: 'pay-init-1',
    payout_code: 'PAY-2026-101',
    employee_id: '9428f33d-b890-4022-b324-9556c8cf6499',
    employee_name: 'حسن علي مهران',
    period_start: '2026-07-01',
    period_end: '2026-07-31',
    total_hours_worked: 208,
    base_salary_amount: 8320,
    overtime_amount: 450,
    bonuses_amount: 500,
    deductions_amount: 0,
    advances_deducted: 400,
    net_paid: 8870,
    payment_date: '2026-08-01',
    payment_method: 'نقدي (Cash)',
    notes: 'مسير راتب شهر يوليو 2026 تم الصرف بالكامل',
    created_at: '2026-08-01T10:00:00.000Z',
  },
];

/**
 * Get all stored financial transactions with optional filtering
 */
export const getStoredTransactions = (filters?: {
  employee_id?: string;
  type?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}): EmployeeTransaction[] => {
  if (typeof window === 'undefined') return INITIAL_TRANSACTIONS;

  let list: EmployeeTransaction[] = [];
  try {
    const raw = localStorage.getItem(TRANSACTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed;
      }
    } else {
      list = INITIAL_TRANSACTIONS;
      localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(INITIAL_TRANSACTIONS));
    }
  } catch {
    list = INITIAL_TRANSACTIONS;
  }

  if (filters) {
    if (filters.employee_id) {
      list = list.filter((t) => t.employee_id === filters.employee_id);
    }
    if (filters.type && filters.type !== 'all') {
      list = list.filter((t) => t.type === filters.type);
    }
    if (filters.status && filters.status !== 'all') {
      list = list.filter((t) => t.status === filters.status);
    }
    if (filters.startDate) {
      list = list.filter((t) => t.date >= filters.startDate!);
    }
    if (filters.endDate) {
      list = list.filter((t) => t.date <= filters.endDate!);
    }
  }

  // Sort descending by date & created_at
  list.sort((a, b) => new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime());

  if (filters?.offset !== undefined || filters?.limit !== undefined) {
    const offset = filters.offset || 0;
    const limit = filters.limit || 100;
    list = list.slice(offset, offset + limit);
  }

  return list;
};

/**
 * Save transactions to localStorage and emit reactive events
 */
export const saveStoredTransactions = (transactions: EmployeeTransaction[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
    window.dispatchEvent(new CustomEvent('cw_transactions_updated', { detail: transactions }));
    window.dispatchEvent(new Event('cw_transactions_updated'));
    window.dispatchEvent(new Event('cw_expenses_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

/**
 * Create a new transaction (advance, bonus, deduction)
 */
export const createStoredTransaction = (data: {
  employee_id: string;
  type: 'advance' | 'bonus' | 'deduction';
  amount: number;
  date?: string;
  notes?: string;
  employee_name?: string;
}): EmployeeTransaction => {
  const current = getStoredTransactions();
  const employees = getCustomStoredEmployees();
  const emp = employees.find((e) => e.id === data.employee_id);

  const newTransaction: EmployeeTransaction = {
    id: `tr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    employee_id: data.employee_id,
    employee_name: data.employee_name || emp?.name || 'موظف',
    type: data.type,
    amount: Math.abs(Number(data.amount) || 0),
    date: data.date || new Date().toISOString().slice(0, 10),
    notes: data.notes || '',
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  const updated = [newTransaction, ...current];
  saveStoredTransactions(updated);
  return newTransaction;
};

/**
 * Delete a transaction (pending or unneeded)
 */
export const deleteStoredTransaction = (id: string): boolean => {
  const current = getStoredTransactions();
  const exists = current.some((t) => t.id === id);
  if (!exists) return false;

  const filtered = current.filter((t) => t.id !== id);
  saveStoredTransactions(filtered);
  return true;
};

/**
 * Settle all pending transactions for an employee within a date range
 */
export const settleEmployeeTransactions = (
  employeeId: string,
  periodStart: string,
  periodEnd: string
): { settledCount: number; settledIds: string[] } => {
  const current = getStoredTransactions();
  const settledIds: string[] = [];

  const updated = current.map((t) => {
    if (
      t.employee_id === employeeId &&
      t.status === 'pending' &&
      t.date >= periodStart &&
      t.date <= periodEnd
    ) {
      settledIds.push(t.id);
      return { ...t, status: 'settled' as const };
    }
    return t;
  });

  saveStoredTransactions(updated);
  return {
    settledCount: settledIds.length,
    settledIds,
  };
};

/**
 * Get all stored payroll payouts
 */
export const getStoredPayouts = (filters?: {
  employee_id?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}): PayrollPayout[] => {
  if (typeof window === 'undefined') return INITIAL_PAYOUTS;

  let list: PayrollPayout[] = [];
  try {
    const raw = localStorage.getItem(PAYOUTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed;
      }
    } else {
      list = INITIAL_PAYOUTS;
      localStorage.setItem(PAYOUTS_KEY, JSON.stringify(INITIAL_PAYOUTS));
    }
  } catch {
    list = INITIAL_PAYOUTS;
  }

  if (filters) {
    if (filters.employee_id) {
      list = list.filter((p) => p.employee_id === filters.employee_id);
    }
    if (filters.startDate) {
      list = list.filter((p) => p.payment_date >= filters.startDate!);
    }
    if (filters.endDate) {
      list = list.filter((p) => p.payment_date <= filters.endDate!);
    }
  }

  // Sort descending by payment date / created_at
  list.sort((a, b) => new Date(b.created_at || b.payment_date).getTime() - new Date(a.created_at || a.payment_date).getTime());

  if (filters?.offset !== undefined || filters?.limit !== undefined) {
    const offset = filters.offset || 0;
    const limit = filters.limit || 100;
    list = list.slice(offset, offset + limit);
  }

  return list;
};

/**
 * Save payouts to localStorage and emit events
 */
export const saveStoredPayouts = (payouts: PayrollPayout[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PAYOUTS_KEY, JSON.stringify(payouts));
    window.dispatchEvent(new CustomEvent('cw_payroll_updated', { detail: payouts }));
    window.dispatchEvent(new Event('cw_payroll_updated'));
    window.dispatchEvent(new Event('cw_expenses_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

/**
 * Add a new payout record
 */
export const createStoredPayout = (payoutData: Omit<PayrollPayout, 'id' | 'created_at'>): PayrollPayout => {
  const current = getStoredPayouts();
  const newPayout: PayrollPayout = {
    ...payoutData,
    id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  };

  const updated = [newPayout, ...current];
  saveStoredPayouts(updated);
  return newPayout;
};
