import { Expense, PnLSummary, CreateExpenseInput } from '../types/index.js';
import { FALLBACK_PNL_SUMMARY } from '../api/mockFallbacks.js';
import { getStoredAllOrders } from './orderStorage.js';

const EXPENSES_STORAGE_KEY = 'cw_custom_expenses';

const DEFAULT_SEED_EXPENSES: Expense[] = [
  {
    id: 'exp-seed-1',
    title: 'إيجار مقر المغسلة والموقع',
    category: 'إيجار',
    amount: 15000,
    expense_date: '2026-08-01',
    payment_method: 'transfer',
    receipt_reference: 'REC-RENT-08',
    notes: 'إيجار شهر أغسطس 2026',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'exp-seed-2',
    title: 'فاتورة الكهرباء والمياه والإنترنت',
    category: 'كهرباء ومياه',
    amount: 3200,
    expense_date: '2026-08-05',
    payment_method: 'cash',
    receipt_reference: 'UTIL-082026',
    notes: 'سداد فواتير الشهر',
    created_at: '2026-08-05T00:00:00.000Z',
    updated_at: '2026-08-05T00:00:00.000Z',
  },
  {
    id: 'exp-seed-3',
    title: 'شراء أدوات نظافة وفوط مايكروفايبر جديدة',
    category: 'أدوات ومواد نظافة',
    amount: 1550,
    expense_date: '2026-08-10',
    payment_method: 'cash',
    receipt_reference: 'SUP-7712',
    notes: 'تجديد الفوط والمستلزمات',
    created_at: '2026-08-10T00:00:00.000Z',
    updated_at: '2026-08-10T00:00:00.000Z',
  },
];

export const getStoredExpenses = (): Expense[] => {
  if (typeof window === 'undefined') return DEFAULT_SEED_EXPENSES;
  try {
    const raw = localStorage.getItem(EXPENSES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  try {
    localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(DEFAULT_SEED_EXPENSES));
  } catch {}
  return DEFAULT_SEED_EXPENSES;
};

export const saveStoredExpenses = (items: Expense[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('cw_expenses_updated', { detail: items }));
    window.dispatchEvent(new Event('cw_expenses_updated'));
  } catch {}
};

export const filterExpensesByPeriod = (
  items: Expense[],
  year?: number,
  month?: number,
  category?: string
): Expense[] => {
  return items.filter((exp) => {
    if (!exp.expense_date) return true;
    const expDate = new Date(exp.expense_date);
    const expYear = expDate.getFullYear();
    const expMonth = expDate.getMonth() + 1;

    if (year && expYear !== Number(year)) return false;
    if (month && expMonth !== Number(month)) return false;
    if (category && category !== 'الكل' && exp.category !== category) return false;
    return true;
  });
};

export const calculateLocalPnL = (year?: number, month?: number): PnLSummary => {
  const currentYear = year || new Date().getFullYear();
  const currentMonth = month || new Date().getMonth() + 1;

  const allExpenses = getStoredExpenses();
  const monthlyExpenses = filterExpensesByPeriod(allExpenses, currentYear, currentMonth);

  // Group by category and payment method
  const categoryBreakdown: Record<string, { count: number; total: number }> = {};
  let totalExpenses = 0;
  let cashExpenses = 0;
  let cardExpenses = 0;
  let transferExpenses = 0;

  monthlyExpenses.forEach((exp) => {
    const amt = Number(exp.amount) || 0;
    totalExpenses += amt;
    if (exp.payment_method === 'cash') cashExpenses += amt;
    else if (exp.payment_method === 'card') cardExpenses += amt;
    else if (exp.payment_method === 'transfer') transferExpenses += amt;

    if (!categoryBreakdown[exp.category]) {
      categoryBreakdown[exp.category] = { count: 0, total: 0 };
    }
    categoryBreakdown[exp.category].count += 1;
    categoryBreakdown[exp.category].total += amt;
  });

  const categoriesArray = Object.entries(categoryBreakdown).map(([cat, val]) => ({
    category: cat,
    count: val.count,
    total_amount: val.total,
    percentage: totalExpenses > 0 ? Number(((val.total / totalExpenses) * 100).toFixed(1)) : 0,
  }));

  // Calculate revenue from all stored orders for this month
  const allOrders = getStoredAllOrders();
  const monthlyOrders = allOrders.filter((o) => {
    if (!o.created_at || o.status === 'cancelled') return false;
    const d = new Date(o.created_at);
    return d.getFullYear() === currentYear && d.getMonth() + 1 === currentMonth;
  });

  let cashRevenue = 0;
  let cardRevenue = 0;
  let transferRevenue = 0;
  let totalGrossRevenue = 0;
  let totalTax = 0;

  monthlyOrders.forEach((o) => {
    const amt = Number(o.total_amount) || 0;
    const tax = Number(o.tax_amount) || 0;
    totalGrossRevenue += amt;
    totalTax += tax;
    if (o.payment_method === 'cash') cashRevenue += amt;
    else if (o.payment_method === 'card') cardRevenue += amt;
    else if (o.payment_method === 'transfer' || (o.payment_method as any) === 'wallet') transferRevenue += amt;
  });

  const netRevenue = Number((totalGrossRevenue - totalTax).toFixed(2));
  const estimatedSalaries = FALLBACK_PNL_SUMMARY.financials.total_salaries || 0;
  const totalOperatingCosts = Number((totalExpenses + estimatedSalaries).toFixed(2));
  const netProfit = Number((netRevenue - totalOperatingCosts).toFixed(2));
  const isProfitable = netProfit >= 0;
  const profitMargin = netRevenue > 0 ? Number(((netProfit / netRevenue) * 100).toFixed(1)) : 0;

  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  return {
    period: `${monthNames[currentMonth - 1]} ${currentYear}`,
    year: currentYear,
    month: currentMonth,
    financials: {
      gross_revenue: totalGrossRevenue,
      net_taxable_revenue: netRevenue,
      total_vat_collected: totalTax,
      total_salaries: estimatedSalaries,
      total_expenses: totalExpenses,
      total_operating_costs: totalOperatingCosts,
      net_profit: netProfit,
      profit_margin: profitMargin,
      is_profitable: isProfitable,
      cash_net_profit: netProfit,
      cash_profit_margin: profitMargin,
    },
    revenue_metrics: {
      total_orders: monthlyOrders.length,
      valid_orders: monthlyOrders.length,
      cancelled_orders: 0,
      cash_revenue: cashRevenue,
      card_revenue: cardRevenue,
      transfer_revenue: transferRevenue,
    },
    payroll_metrics: {
      ...FALLBACK_PNL_SUMMARY.payroll_metrics,
    },
    expenses_metrics: {
      expenses_count: monthlyExpenses.length,
      cash_expenses: cashExpenses,
      card_expenses: cardExpenses,
      transfer_expenses: transferExpenses,
      categories_breakdown: categoriesArray,
    },
    six_months_trend: FALLBACK_PNL_SUMMARY.six_months_trend,
    generated_at: new Date().toISOString(),
  };
};
