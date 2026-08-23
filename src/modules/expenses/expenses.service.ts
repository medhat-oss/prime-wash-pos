import { query, getClient } from '../../config/db.js';
import { AppError } from '../../middleware/errorHandler.js';
import { toLocalISODate, getMonthRangeParams } from '../../utils/date.js';

export interface CreateExpenseInput {
  title: string;
  category?: 'إيجار' | 'كهرباء ومياه' | 'صيانة ومعدات' | 'أدوات ومواد نظافة' | 'بوفيه ومصاريف إدارية' | 'ضرائب ورسوم' | 'أخرى';
  amount: number;
  expense_date?: string;
  payment_method?: 'cash' | 'card' | 'transfer';
  receipt_reference?: string;
  notes?: string;
}

export class ExpensesService {
  /**
   * Log a new expense
   */
  static async createExpense(data: CreateExpenseInput) {
    if (!data.title || !data.title.trim()) {
      throw new AppError('عنوان / بيان المصروف مطلوب', 400);
    }
    if (!data.amount || Number(data.amount) <= 0) {
      throw new AppError('مبلغ المصروف يجب أن يكون أكبر من الصفر', 400);
    }

    const category = data.category || 'إيجار';
    const paymentMethod = data.payment_method || 'cash';
    const expenseDate = data.expense_date || toLocalISODate();

    const sql = `
      INSERT INTO expenses (
        title, 
        category, 
        amount, 
        expense_date, 
        payment_method, 
        receipt_reference, 
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING 
        id, 
        title, 
        category, 
        amount::float AS amount, 
        expense_date, 
        payment_method, 
        receipt_reference, 
        notes, 
        created_at, 
        updated_at
    `;

    const res = await query(sql, [
      data.title.trim(),
      category,
      Number(data.amount),
      expenseDate,
      paymentMethod,
      data.receipt_reference ? data.receipt_reference.trim() : null,
      data.notes ? data.notes.trim() : null,
    ]);

    return res.rows[0];
  }

  /**
   * Fetch all expenses with optional filters
   */
  static async getExpenses(filters: {
    year?: number;
    month?: number;
    category?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) {
    let sql = `
      SELECT 
        id, 
        title, 
        category, 
        amount::float AS amount, 
        expense_date, 
        payment_method, 
        receipt_reference, 
        notes, 
        created_at, 
        updated_at
      FROM expenses
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (filters.category && filters.category !== 'الكل') {
      sql += ` AND category = $${idx++}`;
      params.push(filters.category);
    }

    if (filters.year && filters.month) {
      const start = `${filters.year}-${String(filters.month).padStart(2, '0')}-01`;
      sql += ` AND expense_date >= $${idx++}::date AND expense_date < ($${idx++}::date + INTERVAL '1 month')`;
      params.push(start, start);
    } else if (filters.year) {
      const start = `${filters.year}-01-01`;
      sql += ` AND expense_date >= $${idx++}::date AND expense_date < ($${idx++}::date + INTERVAL '1 year')`;
      params.push(start, start);
    } else if (filters.startDate && filters.endDate) {
      sql += ` AND expense_date >= $${idx++}::date AND expense_date <= $${idx++}::date`;
      params.push(filters.startDate, filters.endDate);
    }

    sql += ` ORDER BY expense_date DESC, created_at DESC`;

    const limit = filters.limit ? Math.min(filters.limit, 500) : 200;
    sql += ` LIMIT $${idx++}`;
    params.push(limit);

    if (filters.offset) {
      sql += ` OFFSET $${idx++}`;
      params.push(filters.offset);
    }

    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * Get single expense by ID
   */
  static async getExpenseById(id: string) {
    const res = await query(
      `SELECT id, title, category, amount::float AS amount, expense_date, payment_method, receipt_reference, notes, created_at, updated_at FROM expenses WHERE id = $1`,
      [id]
    );
    if (res.rows.length === 0) {
      throw new AppError('المصروف المطلوب غير موجود', 404);
    }
    return res.rows[0];
  }

  /**
   * Delete expense by ID
   */
  static async deleteExpense(id: string) {
    const existing = await this.getExpenseById(id);
    await query(`DELETE FROM expenses WHERE id = $1`, [id]);
    return existing;
  }

  /**
   * Monthly Profit & Loss (P&L) Scorecard & Financial Summary
   */
  static async getPnLSummary(year?: number, month?: number) {
    const { startDateTz: startDate, periodLabel, targetYear, targetMonth } = getMonthRangeParams(year, month);

    const [revenueRes, payrollRes, expensesRes, categoriesRes, accruedPayrollRes, trendRes] = await Promise.all([
      // 1. Gross Revenue from valid orders
      query(
        `SELECT 
          COUNT(id)::int AS total_orders,
          COUNT(id) FILTER (WHERE status != 'cancelled')::int AS valid_orders,
          COUNT(id) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders,
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0)::float AS gross_revenue,
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN subtotal ELSE 0 END), 0)::float AS net_taxable_revenue,
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN tax_amount ELSE 0 END), 0)::float AS total_vat_collected,
          COALESCE(SUM(CASE WHEN status != 'cancelled' AND payment_method = 'cash' THEN total_amount ELSE 0 END), 0)::float AS cash_revenue,
          COALESCE(SUM(CASE WHEN status != 'cancelled' AND payment_method = 'card' THEN total_amount ELSE 0 END), 0)::float AS card_revenue,
          COALESCE(SUM(CASE WHEN status != 'cancelled' AND payment_method = 'transfer' THEN total_amount ELSE 0 END), 0)::float AS transfer_revenue
        FROM orders
        WHERE created_at >= $1::timestamptz 
          AND created_at < ($1::timestamptz + INTERVAL '1 month')`,
        [startDate]
      ),

      // 2. Staff Payroll & Salaries (Paid settlements or accrued)
      query(
        `SELECT 
          COALESCE(SUM(net_paid), 0)::float AS total_salaries_paid,
          COALESCE(SUM(base_salary_amount), 0)::float AS total_base_salaries,
          COALESCE(SUM(overtime_amount), 0)::float AS total_overtime_paid,
          COALESCE(SUM(bonuses_amount), 0)::float AS total_bonuses_paid,
          COUNT(id)::int AS payouts_count
        FROM payroll_payouts
        WHERE period_start >= $1::date 
          AND period_start < ($1::date + INTERVAL '1 month')`,
        [startDate]
      ),

      // 3. Operational Expenses summary for the month
      query(
        `SELECT 
          COALESCE(SUM(amount), 0)::float AS total_expenses,
          COUNT(id)::int AS expenses_count,
          COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END), 0)::float AS cash_expenses,
          COALESCE(SUM(CASE WHEN payment_method = 'card' THEN amount ELSE 0 END), 0)::float AS card_expenses,
          COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount ELSE 0 END), 0)::float AS transfer_expenses
        FROM expenses
        WHERE expense_date >= $1::date 
          AND expense_date < ($1::date + INTERVAL '1 month')`,
        [startDate]
      ),

      // 4. Expenses Breakdown by Category
      query(
        `SELECT 
          category,
          COUNT(id)::int AS count,
          COALESCE(SUM(amount), 0)::float AS total_amount
        FROM expenses
        WHERE expense_date >= $1::date 
          AND expense_date < ($1::date + INTERVAL '1 month')
        GROUP BY category
        ORDER BY total_amount DESC`,
        [startDate]
      ),

      // 5. Real-Time Accrued Payroll from attendance and wage rates
      query(
        `SELECT 
           COALESCE(SUM(a.actual_hours * e.hourly_rate), 0)::float AS accrued_base_salary,
           COALESCE(SUM(a.overtime_hours * COALESCE(e.overtime_hourly_rate, e.hourly_rate)), 0)::float AS accrued_overtime,
           COUNT(DISTINCT a.employee_id)::int AS active_staff_with_attendance,
           (SELECT COUNT(*)::int FROM employees WHERE status = 'active' AND (hourly_rate > 0 OR name != 'مستر فتحي')) AS total_operational_staff,
           (
             SELECT COALESCE(SUM(CASE WHEN t.type = 'bonus' THEN t.amount WHEN t.type IN ('advance', 'deduction') THEN -t.amount ELSE 0 END), 0)::float
             FROM employee_transactions t
             WHERE t.date >= $1::date AND t.date < ($1::date + INTERVAL '1 month')
           ) AS net_transactions_adjustment
         FROM attendance a
         JOIN employees e ON a.employee_id = e.id
         WHERE a.work_date >= $1::date AND a.work_date < ($1::date + INTERVAL '1 month')`,
        [startDate]
      ),

      // 6. Six Months Comparative Trend
      query(
        `WITH months AS (
          SELECT generate_series(
            date_trunc('month', $1::timestamptz) - INTERVAL '5 months',
            date_trunc('month', $1::timestamptz),
            INTERVAL '1 month'
          ) AS month_date
        )
        SELECT 
          to_char(m.month_date, 'YYYY-MM') AS month_label,
          COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total_amount ELSE 0 END), 0)::float AS revenue,
          COALESCE(
            NULLIF((
              SELECT COALESCE(SUM(net_paid), 0)::float 
              FROM payroll_payouts p 
              WHERE date_trunc('month', p.period_start) = date_trunc('month', m.month_date)
            ), 0),
            (
              SELECT COALESCE(SUM(a.actual_hours * e.hourly_rate + a.overtime_hours * COALESCE(e.overtime_hourly_rate, e.hourly_rate)), 0)::float
              FROM attendance a
              JOIN employees e ON a.employee_id = e.id
              WHERE date_trunc('month', a.work_date) = date_trunc('month', m.month_date)
            ),
            0
          ) AS payroll,
          (
            SELECT COALESCE(SUM(amount), 0)::float 
            FROM expenses e 
            WHERE date_trunc('month', e.expense_date) = date_trunc('month', m.month_date)
          ) AS expenses
        FROM months m
        LEFT JOIN orders o ON date_trunc('month', o.created_at) = date_trunc('month', m.month_date)
        GROUP BY m.month_date
        ORDER BY m.month_date ASC`,
        [startDate]
      ),
    ]);

    const rev = revenueRes.rows[0];
    const pay = payrollRes.rows[0];
    const exp = expensesRes.rows[0];
    const accrued = accruedPayrollRes.rows[0];

    const grossRevenue = rev.gross_revenue || 0.0;
    const totalExpenses = exp.total_expenses || 0.0;

    // Disbursed Payroll (Actual cash payout deductions)
    const disbursedSalaries = pay.total_salaries_paid || 0.0;
    const disbursedPayoutsCount = pay.payouts_count || 0;

    // Accrued Payroll (Real-time calculated wages for all active staff)
    const accruedBase = Number(accrued?.accrued_base_salary) || 0.0;
    const accruedOvertime = Number(accrued?.accrued_overtime) || 0.0;
    const netTransactionsAdj = Number(accrued?.net_transactions_adjustment) || 0.0;
    const accruedSalaries = Math.max(Number((accruedBase + accruedOvertime + netTransactionsAdj).toFixed(2)), 0.0);
    const activeStaffCount = Number(accrued?.total_operational_staff) || Number(accrued?.active_staff_with_attendance) || 0;
    const unpaidAccruedSalaries = Math.max(Number((accruedSalaries - disbursedSalaries).toFixed(2)), 0.0);

    // Primary Total Salaries for P&L: Use confirmed disbursed if payouts exist, otherwise fallback to accrued
    const primaryTotalSalaries = disbursedSalaries > 0 ? disbursedSalaries : accruedSalaries;
    const totalOperatingCosts = Number((primaryTotalSalaries + totalExpenses).toFixed(2));

    // Cash-Basis Net Profit = Gross Revenue - (Operating Expenses + Disbursed Salaries)
    const cashNetProfit = Number((grossRevenue - (totalExpenses + disbursedSalaries)).toFixed(2));
    const cashProfitMargin = grossRevenue > 0 ? Number(((cashNetProfit / grossRevenue) * 100).toFixed(2)) : 0.0;

    // Accrual-Basis Net Profit = Gross Revenue - (Operating Expenses + Accrued Salaries)
    const accrualNetProfit = Number((grossRevenue - (totalExpenses + accruedSalaries)).toFixed(2));
    const accrualProfitMargin = grossRevenue > 0 ? Number(((accrualNetProfit / grossRevenue) * 100).toFixed(2)) : 0.0;

    // Process categories percentages
    const categoriesBreakdown = categoriesRes.rows.map((c: any) => ({
      category: c.category,
      count: Number(c.count),
      total_amount: Number(c.total_amount),
      percentage: totalExpenses > 0 ? Number(((c.total_amount / totalExpenses) * 100).toFixed(1)) : 0,
    }));

    // Process 6-month trend with net profit
    const sixMonthsTrend = trendRes.rows.map((row: any) => {
      const r = Number(row.revenue) || 0;
      const p = Number(row.payroll) || 0;
      const e = Number(row.expenses) || 0;
      const np = Number((r - p - e).toFixed(2));
      return {
        month: row.month_label,
        revenue: r,
        payroll: p,
        expenses: e,
        net_profit: np,
      };
    });

    return {
      period: periodLabel,
      year: targetYear,
      month: targetMonth,
      financials: {
        gross_revenue: grossRevenue,
        net_taxable_revenue: rev.net_taxable_revenue || 0.0,
        total_vat_collected: rev.total_vat_collected || 0.0,
        total_salaries: primaryTotalSalaries,
        total_expenses: totalExpenses,
        total_operating_costs: totalOperatingCosts,
        net_profit: cashNetProfit,
        profit_margin: cashProfitMargin,
        is_profitable: cashNetProfit >= 0,
        // Dual-metric additions
        cash_net_profit: cashNetProfit,
        cash_profit_margin: cashProfitMargin,
        accrual_net_profit: accrualNetProfit,
        accrual_profit_margin: accrualProfitMargin,
      },
      revenue_metrics: {
        total_orders: rev.total_orders || 0,
        valid_orders: rev.valid_orders || 0,
        cancelled_orders: rev.cancelled_orders || 0,
        cash_revenue: rev.cash_revenue || 0.0,
        card_revenue: rev.card_revenue || 0.0,
        transfer_revenue: rev.transfer_revenue || 0.0,
      },
      payroll_metrics: {
        payouts_count: disbursedPayoutsCount,
        base_salaries: pay.total_base_salaries || accruedBase,
        overtime_paid: pay.total_overtime_paid || accruedOvertime,
        bonuses_paid: pay.total_bonuses_paid || Math.max(netTransactionsAdj, 0),
        // Explicit Dual Metrics
        disbursed_salaries: disbursedSalaries,
        disbursed_payouts_count: disbursedPayoutsCount,
        accrued_salaries: accruedSalaries,
        active_staff_count: activeStaffCount,
        unpaid_accrued_salaries: unpaidAccruedSalaries,
      },
      expenses_metrics: {
        expenses_count: exp.expenses_count || 0,
        cash_expenses: exp.cash_expenses || 0.0,
        card_expenses: exp.card_expenses || 0.0,
        transfer_expenses: exp.transfer_expenses || 0.0,
        categories_breakdown: categoriesBreakdown,
      },
      six_months_trend: sixMonthsTrend,
      generated_at: new Date().toISOString(),
    };
  }
}
