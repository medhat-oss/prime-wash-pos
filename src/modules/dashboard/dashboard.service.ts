import { query, getClient } from '../../config/db.js';
import { AppError } from '../../middleware/errorHandler.js';
import { getActiveAdminPin, updateCachedAdminPin } from '../../middleware/adminAuth.js';
import { safeTimingEqual } from '../../utils/crypto.js';
import { getMonthRangeParams } from '../../utils/date.js';

export class DashboardService {
  static async getSummaryStats() {
    // Run all dashboard aggregate queries in parallel to drastically improve response time
    const [
      todayRes,
      totalSalesRes,
      lowStockRes,
      employeeStatsRes,
      topServicesRes,
      recentOrdersRes,
      cashierSalesRes,
    ] = await Promise.all([
      // 1. Today's orders & revenue (Indexed range scan)
      query(`
        SELECT 
          COUNT(id)::int AS today_orders_count,
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0)::float AS today_revenue,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0)::int AS today_completed_washes,
          COALESCE(SUM(CASE WHEN status IN ('pending', 'in_progress') THEN 1 ELSE 0 END), 0)::int AS today_in_progress
        FROM orders
        WHERE created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day'
      `),

      // 2. All-time revenue and count
      query(`
        SELECT 
          COUNT(id)::int AS total_all_time_orders,
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0)::float AS total_all_time_revenue
        FROM orders
      `),

      // 3. Low stock raw materials
      query(`
        SELECT 
          id, 
          name, 
          unit, 
          current_stock_grams::float AS current_stock_grams, 
          reorder_threshold_grams::float AS reorder_threshold_grams,
          cost_per_gram::float AS cost_per_gram
        FROM inventory_items
        WHERE current_stock_grams <= reorder_threshold_grams
        ORDER BY (current_stock_grams / NULLIF(reorder_threshold_grams, 0)) ASC
      `),

      // 4. Employee stats (Operational staff strictly excluding Owner)
      query(`
        SELECT 
          (SELECT COUNT(*)::int FROM employees WHERE status = 'active' AND name != 'مستر فتحي' AND role NOT LIKE '%مالك%') AS active_employees_count,
          (SELECT COUNT(DISTINCT a.employee_id)::int FROM attendance a JOIN employees e ON a.employee_id = e.id WHERE a.work_date = CURRENT_DATE AND e.name != 'مستر فتحي' AND e.role NOT LIKE '%مالك%') AS attended_today_count
        `),

      // 5. Top 5 popular services
      query(`
        SELECT 
          s.id,
          s.name,
          COUNT(o.id)::int AS total_orders,
          COALESCE(SUM(o.total_amount), 0)::float AS total_revenue
        FROM services s
        LEFT JOIN orders o ON s.id = o.service_id AND o.status != 'cancelled'
        GROUP BY s.id
        ORDER BY total_orders DESC
        LIMIT 5
      `),

      // 6. Recent 5 orders
      query(`
        SELECT 
          o.id,
          o.order_code,
          o.car_plate,
          o.car_type,
          o.customer_name,
          s.name AS service_name,
          o.total_amount::float AS total_amount,
          o.payment_method,
          o.status,
          o.created_at
        FROM orders o
        LEFT JOIN services s ON o.service_id = s.id
        ORDER BY o.created_at DESC
        LIMIT 5
      `),

      // 7. Cashier & Staff Sales Breakdown
      query(`
        SELECT 
          COALESCE(e.id::text, 'unassigned') AS cashier_id,
          COALESCE(e.name, 'بدون تحديد عامل (عام)') AS cashier_name,
          COALESCE(e.role, 'فني / كاشير') AS cashier_role,
          COUNT(o.id)::int AS orders_count,
          COALESCE(SUM(o.total_amount), 0)::float AS total_sales,
          COALESCE(SUM(CASE WHEN o.payment_method = 'cash' THEN o.total_amount ELSE 0 END), 0)::float AS cash_sales,
          COALESCE(SUM(CASE WHEN o.payment_method = 'card' THEN o.total_amount ELSE 0 END), 0)::float AS card_sales,
          COALESCE(SUM(CASE WHEN o.payment_method = 'transfer' THEN o.total_amount ELSE 0 END), 0)::float AS transfer_sales
        FROM orders o
        LEFT JOIN employees e ON o.assigned_employee_id = e.id
        WHERE o.status != 'cancelled'
        GROUP BY e.id, e.name, e.role
        ORDER BY total_sales DESC
      `),
    ]);

    return {
      today: todayRes.rows[0],
      all_time: totalSalesRes.rows[0],
      inventory: {
        low_stock_count: lowStockRes.rows.length,
        low_stock_items: lowStockRes.rows,
      },
      hr: employeeStatsRes.rows[0],
      top_services: topServicesRes.rows,
      recent_orders: recentOrdersRes.rows,
      cashier_sales: cashierSalesRes.rows,
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Monthly VAT 14% Declaration Summary and Detailed Audit Log
   */
  static async getMonthlyVatReport(year?: number, month?: number) {
    const { startDateTz: startDate, periodLabel, targetYear, targetMonth } = getMonthRangeParams(year, month);

    const [summaryRes, paymentsRes, servicesRes, invoicesRes, taxSettingsRes] = await Promise.all([
      // 1. Overall VAT and Sales Metrics for the month
      query(
        `SELECT 
          COUNT(id)::int AS total_orders_count,
          COUNT(id) FILTER (WHERE status != 'cancelled')::int AS valid_orders_count,
          COUNT(id) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders_count,
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0)::float AS total_sales_gross,
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN subtotal ELSE 0 END), 0)::float AS total_taxable_base,
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN tax_amount ELSE 0 END), 0)::float AS total_vat_14,
          COALESCE(SUM(CASE WHEN status = 'cancelled' THEN total_amount ELSE 0 END), 0)::float AS cancelled_total_amount,
          COUNT(id) FILTER (WHERE eta_status = 'valid' AND status != 'cancelled')::int AS eta_valid_count,
          COALESCE(SUM(CASE WHEN eta_status = 'valid' AND status != 'cancelled' THEN tax_amount ELSE 0 END), 0)::float AS eta_valid_vat,
          COUNT(id) FILTER (WHERE eta_status = 'pending' AND status != 'cancelled')::int AS eta_pending_count,
          COUNT(id) FILTER (WHERE eta_status IN ('invalid', 'failed') AND status != 'cancelled')::int AS eta_failed_count,
          COUNT(id) FILTER (WHERE (eta_status = 'not_synced' OR eta_status IS NULL) AND status != 'cancelled')::int AS eta_not_synced_count
        FROM orders
        WHERE created_at >= $1::timestamptz 
          AND created_at < ($1::timestamptz + INTERVAL '1 month')`,
        [startDate]
      ),

      // 2. Payments Method Breakdown
      query(
        `SELECT 
          payment_method,
          COUNT(id)::int AS count,
          COALESCE(SUM(total_amount), 0)::float AS total_gross,
          COALESCE(SUM(subtotal), 0)::float AS total_net,
          COALESCE(SUM(tax_amount), 0)::float AS total_vat
        FROM orders
        WHERE created_at >= $1::timestamptz 
          AND created_at < ($1::timestamptz + INTERVAL '1 month')
          AND status != 'cancelled'
        GROUP BY payment_method
        ORDER BY total_gross DESC`,
        [startDate]
      ),

      // 3. Service Packages Breakdown
      query(
        `SELECT 
          s.id,
          s.name,
          s.category,
          s.egs_code,
          COUNT(o.id)::int AS orders_count,
          COALESCE(SUM(o.total_amount), 0)::float AS total_gross,
          COALESCE(SUM(o.subtotal), 0)::float AS total_net,
          COALESCE(SUM(o.tax_amount), 0)::float AS total_vat
        FROM orders o
        JOIN services s ON o.service_id = s.id
        WHERE o.created_at >= $1::timestamptz 
          AND o.created_at < ($1::timestamptz + INTERVAL '1 month')
          AND o.status != 'cancelled'
        GROUP BY s.id, s.name, s.category, s.egs_code
        ORDER BY total_gross DESC`,
        [startDate]
      ),

      // 4. Invoices Log for the Month
      query(
        `SELECT 
          o.id,
          o.order_code,
          o.car_plate,
          o.car_type,
          o.customer_name,
          o.customer_phone,
          s.name AS service_name,
          s.egs_code,
          o.payment_method,
          o.subtotal::float AS subtotal,
          o.tax_amount::float AS tax_amount,
          o.total_amount::float AS total_amount,
          o.status,
          o.eta_status,
          o.eta_uuid,
          o.eta_share_url,
          o.created_at
        FROM orders o
        LEFT JOIN services s ON o.service_id = s.id
        WHERE o.created_at >= $1::timestamptz 
          AND o.created_at < ($1::timestamptz + INTERVAL '1 month')
        ORDER BY o.created_at ASC`,
        [startDate]
      ),

      // 5. Active Tax Registration Details
      query(`SELECT tax_registration_number, branch_code, environment, eta_sync_enabled FROM tax_settings LIMIT 1`),
    ]);

    const taxSettings = taxSettingsRes.rows[0] || {};

    return {
      period: periodLabel,
      year: targetYear,
      month: targetMonth,
      tax_rate_percent: 14,
      tax_registration_number: taxSettings.tax_registration_number || 'غير مسجل',
      branch_code: taxSettings.branch_code || '0',
      eta_sync_enabled: taxSettings.eta_sync_enabled ?? false,
      summary: summaryRes.rows[0] || {
        total_orders_count: 0,
        valid_orders_count: 0,
        cancelled_orders_count: 0,
        total_sales_gross: 0,
        total_taxable_base: 0,
        total_vat_14: 0,
        cancelled_total_amount: 0,
        eta_valid_count: 0,
        eta_valid_vat: 0,
        eta_pending_count: 0,
        eta_failed_count: 0,
        eta_not_synced_count: 0,
      },
      payment_breakdown: paymentsRes.rows,
      service_breakdown: servicesRes.rows,
      invoices: invoicesRes.rows,
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Raw Material Consumption Logs & Inventory Cost Analysis
   */
  static async getRawMaterialConsumptionReport(year?: number, month?: number) {
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || now.getMonth() + 1;

    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01 00:00:00+00`;
    const periodLabel = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

    const [materialsSummaryRes, serviceMaterialsRes, detailedLogsRes, completedWashesCountRes] = await Promise.all([
      // 1. Consumption per Inventory Item
      query(
        `SELECT 
          i.id,
          i.name,
          i.unit,
          i.cost_per_gram::float AS cost_per_gram,
          i.current_stock_grams::float AS current_stock_grams,
          i.reorder_threshold_grams::float AS reorder_threshold_grams,
          (i.current_stock_grams <= i.reorder_threshold_grams) AS is_low_stock,
          COALESCE(SUM(sr.quantity_grams), 0)::float AS total_consumed_grams,
          COALESCE(SUM(sr.quantity_grams * i.cost_per_gram), 0)::float AS total_consumed_cost,
          COUNT(DISTINCT o.id)::int AS washes_count
        FROM inventory_items i
        LEFT JOIN service_recipes sr ON i.id = sr.inventory_item_id
        LEFT JOIN orders o ON sr.service_id = o.service_id 
          AND o.status = 'completed'
          AND o.created_at >= $1::timestamptz 
          AND o.created_at < ($1::timestamptz + INTERVAL '1 month')
        GROUP BY i.id, i.name, i.unit, i.cost_per_gram, i.current_stock_grams, i.reorder_threshold_grams
        ORDER BY total_consumed_grams DESC, i.name ASC`,
        [startDate]
      ),

      // 2. Breakdown of consumption by service package
      query(
        `SELECT 
          s.id AS service_id,
          s.name AS service_name,
          i.id AS item_id,
          i.name AS item_name,
          sr.quantity_grams::float AS recipe_grams_per_wash,
          COUNT(o.id)::int AS completed_washes_count,
          (sr.quantity_grams * COUNT(o.id))::float AS total_grams_consumed,
          (sr.quantity_grams * COUNT(o.id) * i.cost_per_gram)::float AS total_cost_egp
        FROM orders o
        JOIN services s ON o.service_id = s.id
        JOIN service_recipes sr ON s.id = sr.service_id
        JOIN inventory_items i ON sr.inventory_item_id = i.id
        WHERE o.status = 'completed'
          AND o.created_at >= $1::timestamptz 
          AND o.created_at < ($1::timestamptz + INTERVAL '1 month')
        GROUP BY s.id, s.name, i.id, i.name, sr.quantity_grams, i.cost_per_gram
        ORDER BY s.name ASC, total_grams_consumed DESC`,
        [startDate]
      ),

      // 3. Itemized consumption logs per wash
      query(
        `SELECT 
          o.id AS order_id,
          o.order_code,
          o.car_plate,
          o.car_type,
          o.created_at,
          s.name AS service_name,
          i.id AS item_id,
          i.name AS item_name,
          sr.quantity_grams::float AS quantity_grams,
          (sr.quantity_grams * i.cost_per_gram)::float AS cost_egp
        FROM orders o
        JOIN services s ON o.service_id = s.id
        JOIN service_recipes sr ON s.id = sr.service_id
        JOIN inventory_items i ON sr.inventory_item_id = i.id
        WHERE o.status = 'completed'
          AND o.created_at >= $1::timestamptz 
          AND o.created_at < ($1::timestamptz + INTERVAL '1 month')
        ORDER BY o.created_at DESC, o.order_code ASC
        LIMIT 500`,
        [startDate]
      ),

      // 4. Total completed washes count in period
      query(
        `SELECT COUNT(*)::int AS count 
         FROM orders 
         WHERE status = 'completed' 
           AND created_at >= $1::timestamptz 
           AND created_at < ($1::timestamptz + INTERVAL '1 month')`,
        [startDate]
      ),
    ]);

    const materials = materialsSummaryRes.rows;
    const totalGramsConsumed = materials.reduce((acc, m) => acc + (m.total_consumed_grams || 0), 0);
    const totalCostEGP = materials.reduce((acc, m) => acc + (m.total_consumed_cost || 0), 0);

    return {
      period: periodLabel,
      year: targetYear,
      month: targetMonth,
      total_completed_washes: completedWashesCountRes.rows[0]?.count || 0,
      total_grams_consumed: totalGramsConsumed,
      total_cost_egp: totalCostEGP,
      materials,
      service_consumption: serviceMaterialsRes.rows,
      detailed_logs: detailedLogsRes.rows,
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Factory Reset / Wipe transaction records while preserving base catalog and settings
   */
  static async factoryReset() {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 1. Wipe transaction logs
      await client.query('DELETE FROM eta_sync_queue');
      await client.query('DELETE FROM orders');
      await client.query('DELETE FROM expenses');
      await client.query('DELETE FROM attendance');
      await client.query('DELETE FROM employee_transactions');
      await client.query('DELETE FROM payroll_payouts');

      // 2. Reset raw material stocks to default healthy quantities
      await client.query(`
        UPDATE inventory_items 
        SET current_stock_grams = GREATEST(current_stock_grams, 50000.00)
      `);

      await client.query('COMMIT');

      return {
        message: 'تم تصفير سجلات المعاملات والفواتير والمصروفات والمسيرات بنجاح، مع الحفاظ على الخدمات والموظفين وإعدادات النظام',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Change Admin PIN
   */
  static async changeAdminPin(currentPin: string, newPin: string) {
    const activePin = await getActiveAdminPin();
    const cleanCurrent = String(currentPin || '').trim();
    const cleanNew = String(newPin || '').trim();

    if (!safeTimingEqual(cleanCurrent, activePin)) {
      throw new AppError('رمز الـ PIN الحالي غير صحيح', 400, { code: 'INVALID_CURRENT_PIN' });
    }

    if (!/^\d{4,6}$/.test(cleanNew)) {
      throw new AppError('رمز الـ PIN الجديد يجب أن يتكون من 4 إلى 6 أرقام فقط', 400, {
        code: 'INVALID_NEW_PIN_FORMAT',
      });
    }

    await query(
      `UPDATE system_settings 
       SET admin_pin = $1, updated_at = CURRENT_TIMESTAMP`,
      [cleanNew]
    );

    await query(
      `UPDATE employees 
       SET pin_code = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE system_role = 'owner' OR role ILIKE '%مالك%' OR name = 'مستر فتحي'`,
      [cleanNew]
    );

    updateCachedAdminPin(cleanNew);

    return {
      success: true,
      message: 'تم تغيير رمز الـ PIN للإدارة بنجاح',
    };
  }
}
