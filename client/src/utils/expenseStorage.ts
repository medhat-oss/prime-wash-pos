import { Expense, PnLSummary, CreateExpenseInput, ClosedShift, ClosedMonthLedger } from '../types/index.js';
import { FALLBACK_PNL_SUMMARY } from '../api/mockFallbacks.js';
import { getStoredAllOrders } from './orderStorage.js';
import { getStoredPayouts, getStoredTransactions } from './transactionStorage.js';
import {
  getCustomStoredEmployees,
  getStoredAttendanceRecords,
  getEmployeeStandardDailyHours,
  isOwnerEmployee,
} from './attendanceStorage.js';
import { getStoredClosedShifts } from './shiftStorage.js';
import { calculateLocalEmployeePayroll, calculateAccruedPayrollSummary } from './payrollCalculation.js';
import { getStoredTaxSettings } from './taxStorage.js';
import { bulkPutInDb, putInDb, deleteFromDb } from '../db/indexedDB.js';

const EXPENSES_STORAGE_KEY = 'cw_custom_expenses';
const CLOSED_MONTH_LEDGERS_KEY = 'cw_monthly_closed_ledgers';

const DEFAULT_SEED_EXPENSES: Expense[] = [
  {
    id: 'exp-seed-1',
    title: 'إيجار مقر المغسلة والموقع',
    category: 'إيجار',
    expense_type: 'fixed',
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
    expense_type: 'variable',
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
    expense_type: 'variable',
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
  // 1. Asynchronous IndexedDB Persistence
  bulkPutInDb('expenses', items).catch((e) => console.warn('[IDB saveStoredExpenses error]', e));

  // 2. LocalStorage backup snapshot
  try {
    localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('cw_expenses_updated', { detail: items }));
    window.dispatchEvent(new Event('cw_expenses_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

/**
 * Closed Month Ledgers (Archived Monthly Snapshots)
 */
export const getStoredClosedMonthLedgers = (): ClosedMonthLedger[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CLOSED_MONTH_LEDGERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
};

export const saveStoredClosedMonthLedgers = (ledgers: ClosedMonthLedger[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CLOSED_MONTH_LEDGERS_KEY, JSON.stringify(ledgers));
    window.dispatchEvent(new CustomEvent('cw_closed_months_updated', { detail: ledgers }));
    window.dispatchEvent(new Event('cw_expenses_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

export const getClosedMonthLedger = (year: number, month: number): ClosedMonthLedger | null => {
  const ledgers = getStoredClosedMonthLedgers();
  return ledgers.find((l) => Number(l.year) === Number(year) && Number(l.month) === Number(month)) || null;
};

export const isMonthClosed = (year: number, month: number): boolean => {
  return getClosedMonthLedger(year, month) !== null;
};

export const closeMonthLedger = (
  year: number,
  month: number,
  closedBy: string = 'مالك المنشأة',
  notes?: string
): ClosedMonthLedger => {
  const pnl = calculateLocalPnL(year, month);
  const ledgerId = `ledger-${year}-${String(month).padStart(2, '0')}`;

  const newLedger: ClosedMonthLedger = {
    id: ledgerId,
    period: pnl.period,
    year: Number(year),
    month: Number(month),
    financials: {
      gross_revenue: pnl.financials.gross_revenue,
      net_taxable_revenue: pnl.financials.net_taxable_revenue,
      operating_revenue: pnl.financials.operating_revenue,
      effective_vat_deducted: pnl.financials.effective_vat_deducted,
      is_live_tax_mode: pnl.financials.is_live_tax_mode,
      tax_environment: pnl.financials.tax_environment,
      total_salaries: pnl.financials.total_salaries,
      total_expenses: pnl.financials.total_expenses,
      fixed_expenses: pnl.expenses_metrics.fixed_expenses_total || 0,
      variable_expenses: pnl.expenses_metrics.variable_expenses_total || 0,
      net_profit: pnl.financials.net_profit,
      profit_margin: pnl.financials.profit_margin,
      is_profitable: pnl.financials.is_profitable,
      total_operating_costs: pnl.financials.total_operating_costs,
    },
    metrics: {
      orders_count: pnl.revenue_metrics.valid_orders,
      expenses_count: pnl.expenses_metrics.expenses_count,
      payouts_count: pnl.payroll_metrics.payouts_count,
    },
    closed_at: new Date().toISOString(),
    closed_by: closedBy,
    notes: notes || '',
  };

  const existing = getStoredClosedMonthLedgers();
  const filtered = existing.filter((l) => l.id !== ledgerId && !(Number(l.year) === Number(year) && Number(l.month) === Number(month)));
  const updated = [newLedger, ...filtered];
  saveStoredClosedMonthLedgers(updated);
  return newLedger;
};

export const clearStoredTrendSnapshots = (): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CLOSED_MONTH_LEDGERS_KEY);
    window.dispatchEvent(new CustomEvent('cw_closed_months_updated', { detail: [] }));
    window.dispatchEvent(new Event('cw_expenses_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

/**
 * Records an inventory purchase/restock expense in the P&L custom expenses list.
 */
export const recordInventoryPurchaseExpense = (data: {
  itemName: string;
  grams: number;
  costPerGram: number;
  totalCost: number;
  paymentMethod?: 'cash' | 'card' | 'transfer';
  receiptReference?: string;
  notes?: string;
  date?: string;
}): Expense => {
  const newExp: Expense = {
    id: `exp-inv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title: `توريد خامات: ${data.itemName} (${(data.grams / 1000).toFixed(2)} كجم)`,
    category: 'خامات ومواد تشغيل',
    expense_type: 'variable',
    amount: Math.max(0, Number(data.totalCost) || 0),
    expense_date: data.date || new Date().toISOString().slice(0, 10),
    payment_method: data.paymentMethod || 'cash',
    receipt_reference: data.receiptReference || `INV-RESTOCK-${Date.now().toString().slice(-4)}`,
    notes: data.notes || `توريد ${data.grams.toLocaleString()} جرام بسعر ${Number(data.costPerGram).toFixed(4)} ج.م/جرام`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const stored = getStoredExpenses();
  saveStoredExpenses([newExp, ...stored]);
  return newExp;
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

/**
 * Calculates dynamic monthly payroll metrics (Disbursed payouts vs Live Accrued labor).
 * Optimized: Only computes full employee attendance simulations for the active month or when includeAccrued is true.
 */
const computeMonthlyPayrollMetrics = (year: number, month: number, includeAccrued: boolean = true) => {
  const payouts = getStoredPayouts();
  const monthlyPayouts = payouts.filter((p) => {
    const d = p.payment_date || p.created_at;
    if (!d) return false;
    const dateObj = new Date(d);
    return dateObj.getFullYear() === year && dateObj.getMonth() + 1 === month;
  });

  let disbursedNetTotal = 0;
  let disbursedBaseTotal = 0;
  let disbursedOvertimeTotal = 0;
  let disbursedBonusesTotal = 0;
  let disbursedDeductionsTotal = 0;
  let disbursedAdvancesTotal = 0;

  monthlyPayouts.forEach((p) => {
    disbursedNetTotal += Number(p.net_paid) || 0;
    disbursedBaseTotal += Number(p.base_salary_amount) || 0;
    disbursedOvertimeTotal += Number(p.overtime_amount) || 0;
    disbursedBonusesTotal += Number(p.bonuses_amount) || 0;
    disbursedDeductionsTotal += Number(p.deductions_amount) || 0;
    disbursedAdvancesTotal += Number(p.advances_deducted) || 0;
  });

  if (!includeAccrued) {
    const effectiveLaborCost = Number(disbursedNetTotal.toFixed(2));
    return {
      disbursedNetTotal: Number(disbursedNetTotal.toFixed(2)),
      disbursedBaseTotal: Number(disbursedBaseTotal.toFixed(2)),
      disbursedOvertimeTotal: Number(disbursedOvertimeTotal.toFixed(2)),
      disbursedBonusesTotal: Number(disbursedBonusesTotal.toFixed(2)),
      disbursedDeductionsTotal: Number(disbursedDeductionsTotal.toFixed(2)),
      disbursedAdvancesTotal: Number(disbursedAdvancesTotal.toFixed(2)),
      totalAccruedWages: Number(disbursedNetTotal.toFixed(2)),
      totalAccruedBase: Number(disbursedBaseTotal.toFixed(2)),
      totalAccruedOvertime: Number(disbursedOvertimeTotal.toFixed(2)),
      totalAccruedBonuses: Number(disbursedBonusesTotal.toFixed(2)),
      totalAccruedPayable: Number(disbursedNetTotal.toFixed(2)),
      totalPendingDebts: 0,
      effectiveLaborCost,
      unpaidAccrued: 0,
      payoutsCount: monthlyPayouts.length,
      activeStaffCount: 4,
    };
  }

  // Single Source of Truth: Delegate to centralized calculateAccruedPayrollSummary
  const summary = calculateAccruedPayrollSummary(year, month);
  const effectiveLaborCost = Number(disbursedNetTotal.toFixed(2));

  return {
    disbursedNetTotal: Number(disbursedNetTotal.toFixed(2)),
    disbursedBaseTotal: Number(disbursedBaseTotal.toFixed(2)),
    disbursedOvertimeTotal: Number(disbursedOvertimeTotal.toFixed(2)),
    disbursedBonusesTotal: Number(disbursedBonusesTotal.toFixed(2)),
    disbursedDeductionsTotal: Number(disbursedDeductionsTotal.toFixed(2)),
    disbursedAdvancesTotal: Number(disbursedAdvancesTotal.toFixed(2)),
    totalAccruedWages: summary.total_accrued_payable,
    totalAccruedBase: summary.total_accrued_base,
    totalAccruedOvertime: summary.total_accrued_overtime,
    totalAccruedBonuses: summary.total_accrued_bonuses,
    totalAccruedPayable: summary.total_accrued_payable,
    totalPendingDebts: summary.total_pending_debts,
    effectiveLaborCost,
    unpaidAccrued: summary.unpaid_accrued_salaries,
    payoutsCount: monthlyPayouts.length,
    activeStaffCount: summary.total_operational_staff,
  };
};

/**
 * Calculates dynamic shift cash drawer variances (Shortages / Surpluses) for the period.
 */
const computeMonthlyShiftVariances = (year: number, month: number) => {
  const closedShifts = getStoredClosedShifts();
  const monthlyShifts = closedShifts.filter((s) => {
    const d = s.shift_end || s.shift_start || s.created_at;
    if (!d) return false;
    const dateObj = new Date(d);
    return dateObj.getFullYear() === year && dateObj.getMonth() + 1 === month;
  });

  let totalVariance = 0;
  let totalShortage = 0;
  let totalSurplus = 0;

  monthlyShifts.forEach((s) => {
    const v = Number(s.variance) || 0;
    totalVariance += v;
    if (v < 0) totalShortage += Math.abs(v);
    else if (v > 0) totalSurplus += v;
  });

  return {
    totalVariance: Number(totalVariance.toFixed(2)),
    totalShortage: Number(totalShortage.toFixed(2)),
    totalSurplus: Number(totalSurplus.toFixed(2)),
    shiftsCount: monthlyShifts.length,
  };
};

export const calculateLocalPnL = (year?: number, month?: number): PnLSummary => {
  const currentYear = year || new Date().getFullYear();
  const currentMonth = month || new Date().getMonth() + 1;

  const allExpenses = getStoredExpenses();
  const monthlyExpenses = filterExpensesByPeriod(allExpenses, currentYear, currentMonth);

  // Group expenses by category, payment method, and expense_type (Fixed vs Variable)
  const categoryBreakdown: Record<string, { count: number; total: number }> = {};
  let totalExpenses = 0;
  let cashExpenses = 0;
  let cardExpenses = 0;
  let transferExpenses = 0;
  let totalMaterialsPurchased = 0;
  let fixedExpensesTotal = 0;
  let variableExpensesTotal = 0;
  let fixedExpensesCount = 0;
  let variableExpensesCount = 0;

  monthlyExpenses.forEach((exp) => {
    const amt = Number(exp.amount) || 0;
    totalExpenses += amt;
    if (exp.payment_method === 'cash') cashExpenses += amt;
    else if (exp.payment_method === 'card') cardExpenses += amt;
    else if (exp.payment_method === 'transfer') transferExpenses += amt;

    const isFixed = exp.expense_type === 'fixed' || (!exp.expense_type && exp.category === 'إيجار');
    if (isFixed) {
      fixedExpensesTotal += amt;
      fixedExpensesCount += 1;
    } else {
      variableExpensesTotal += amt;
      variableExpensesCount += 1;
    }

    if (exp.category === 'خامات ومواد تشغيل') {
      totalMaterialsPurchased += amt;
    }

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

  // Determine Tax Mode from Stored Settings
  const taxSettings = getStoredTaxSettings();
  const isLiveTaxMode = Boolean(taxSettings.is_enabled && taxSettings.environment === 'production');
  const effectiveVatDeducted = isLiveTaxMode ? totalTax : 0;
  const operatingRevenue = isLiveTaxMode ? netRevenue : totalGrossRevenue;

  // Dynamic Payroll Metrics for Active Selected Month
  const payroll = computeMonthlyPayrollMetrics(currentYear, currentMonth, true);

  // Dynamic Shift Variances
  const shiftVariances = computeMonthlyShiftVariances(currentYear, currentMonth);

  // Accurate Net Profit & Total Operating Costs
  // Operating Costs = Expenses (including raw materials) + Effective Salaries + Cash Drawer Shortages - Cash Drawer Surpluses
  const totalOperatingCosts = Number(
    (totalExpenses + payroll.effectiveLaborCost + shiftVariances.totalShortage - shiftVariances.totalSurplus).toFixed(2)
  );
  const netProfit = Number((operatingRevenue - totalOperatingCosts).toFixed(2));
  const isProfitable = netProfit >= 0;
  const profitMargin = operatingRevenue > 0 ? Number(((netProfit / operatingRevenue) * 100).toFixed(1)) : 0;

  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  // Dynamic 6-Months Trend Calculation (Uses archived closed ledger snapshots if present)
  const sixMonthsTrend: Array<{
    month: string;
    revenue: number;
    payroll: number;
    expenses: number;
    net_profit: number;
  }> = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - 1 - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const mLabel = `${monthNames[m - 1]} ${y}`;

    // 1. Check if an archived closed snapshot exists for (y, m)
    const closedLedger = getClosedMonthLedger(y, m);
    if (closedLedger) {
      sixMonthsTrend.push({
        month: mLabel,
        revenue: closedLedger.financials.gross_revenue,
        payroll: closedLedger.financials.total_salaries,
        expenses: closedLedger.financials.total_expenses,
        net_profit: closedLedger.financials.net_profit,
      });
      continue;
    }

    // 2. Otherwise calculate dynamically from active database/localStorage logs
    const mOrders = allOrders.filter((o) => {
      if (!o.created_at || o.status === 'cancelled') return false;
      const od = new Date(o.created_at);
      return od.getFullYear() === y && od.getMonth() + 1 === m;
    });
    let mRev = 0;
    let mTax = 0;
    mOrders.forEach((o) => {
      mRev += Number(o.total_amount) || 0;
      mTax += Number(o.tax_amount) || 0;
    });
    const mNetRev = mRev - mTax;
    const mOperatingRev = isLiveTaxMode ? mNetRev : mRev;

    // Month expenses
    const mExpList = filterExpensesByPeriod(allExpenses, y, m);
    let mExp = 0;
    mExpList.forEach((e) => {
      mExp += Number(e.amount) || 0;
    });

    // Month payroll (optimized: false flag skips multi-employee live simulation)
    const mPay = computeMonthlyPayrollMetrics(y, m, false);
    const mShift = computeMonthlyShiftVariances(y, m);

    const mCosts = mExp + mPay.effectiveLaborCost + mShift.totalShortage - mShift.totalSurplus;
    const mNet = Number((mOperatingRev - mCosts).toFixed(2));

    sixMonthsTrend.push({
      month: mLabel,
      revenue: mRev,
      payroll: mPay.effectiveLaborCost,
      expenses: mExp,
      net_profit: mNet,
    });
  }

  const closedSnapshot = getClosedMonthLedger(currentYear, currentMonth);

  return {
    period: `${monthNames[currentMonth - 1]} ${currentYear}`,
    year: currentYear,
    month: currentMonth,
    is_month_closed: closedSnapshot !== null,
    closed_ledger_info: closedSnapshot,
    financials: {
      gross_revenue: totalGrossRevenue,
      net_taxable_revenue: netRevenue,
      operating_revenue: operatingRevenue,
      effective_vat_deducted: effectiveVatDeducted,
      is_live_tax_mode: isLiveTaxMode,
      tax_environment: taxSettings.environment,
      total_vat_collected: totalTax,
      total_salaries: payroll.effectiveLaborCost,
      total_expenses: totalExpenses,
      total_materials_purchased: totalMaterialsPurchased,
      total_shift_variance: shiftVariances.totalVariance,
      total_operating_costs: totalOperatingCosts,
      net_profit: netProfit,
      profit_margin: profitMargin,
      is_profitable: isProfitable,
      cash_net_profit: netProfit,
      cash_profit_margin: profitMargin,
      accrual_net_profit: Number((operatingRevenue - (totalExpenses + payroll.totalAccruedWages)).toFixed(2)),
      accrual_profit_margin:
        operatingRevenue > 0
          ? Number((((operatingRevenue - (totalExpenses + payroll.totalAccruedWages)) / operatingRevenue) * 100).toFixed(1))
          : 0,
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
      payouts_count: payroll.payoutsCount,
      base_salaries: payroll.disbursedBaseTotal || payroll.totalAccruedBase,
      overtime_paid: payroll.disbursedOvertimeTotal || payroll.totalAccruedOvertime,
      bonuses_paid: payroll.disbursedBonusesTotal || payroll.totalAccruedBonuses,
      disbursed_salaries: payroll.disbursedNetTotal,
      disbursed_payouts_count: payroll.payoutsCount,
      accrued_salaries: payroll.totalAccruedWages,
      total_accrued_payable: payroll.totalAccruedPayable,
      total_pending_debts: payroll.totalPendingDebts,
      active_staff_count: payroll.activeStaffCount,
      unpaid_accrued_salaries: payroll.unpaidAccrued,
    },
    expenses_metrics: {
      expenses_count: monthlyExpenses.length,
      cash_expenses: cashExpenses,
      card_expenses: cardExpenses,
      transfer_expenses: transferExpenses,
      fixed_expenses_total: Number(fixedExpensesTotal.toFixed(2)),
      variable_expenses_total: Number(variableExpensesTotal.toFixed(2)),
      fixed_expenses_count: fixedExpensesCount,
      variable_expenses_count: variableExpensesCount,
      categories_breakdown: categoriesArray,
    },
    six_months_trend: sixMonthsTrend,
    generated_at: new Date().toISOString(),
  };
};
