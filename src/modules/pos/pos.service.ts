import { query, getClient } from '../../config/db.js';
import { AppError } from '../../middleware/errorHandler.js';
import { EtaQueueService } from '../tax/services/etaQueue.service.js';
import { generateReferenceCode } from '../../utils/codeGenerator.js';


export interface CreateOrderInput {
  service_id: string;
  car_plate?: string;
  car_type?: string;
  customer_name?: string;
  customer_phone?: string;
  payment_method?: 'cash' | 'card' | 'transfer' | 'split';
  assigned_employee_id?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  shift_id?: string;
  cashier_id?: string;
  cashier_name?: string;
}

export class PosService {
  static async createOrder(data: CreateOrderInput) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Fetch and validate service
      const serviceRes = await client.query(
        `SELECT id, name, price::float AS price, status FROM services WHERE id = $1`,
        [data.service_id]
      );

      if (serviceRes.rows.length === 0) {
        throw new AppError('خدمة الغسيل المحددة غير موجودة', 404);
      }

      const service = serviceRes.rows[0];
      if (service.status !== 'active') {
        throw new AppError('خدمة الغسيل المحددة معطلة حالياً ولا يمكن إنشاء طلب عليها', 400);
      }

      // 2. Fetch service recipes (BOM)
      const recipesRes = await client.query(
        `SELECT 
          sr.inventory_item_id, 
          sr.quantity_grams::float AS quantity_grams,
          i.name AS item_name
         FROM service_recipes sr
         JOIN inventory_items i ON sr.inventory_item_id = i.id
         WHERE sr.service_id = $1`,
        [data.service_id]
      );

      const deductedItems: Array<{
        inventory_item_id: string;
        name: string;
        deducted_grams: number;
        remaining_stock_grams: number;
        is_low_stock: boolean;
      }> = [];

      // 3. For each recipe item: lock row, check availability, and deduct
      for (const recipe of recipesRes.rows) {
        const itemLockRes = await client.query(
          `SELECT 
            id, 
            name, 
            current_stock_grams::float AS current_stock_grams,
            reorder_threshold_grams::float AS reorder_threshold_grams
           FROM inventory_items 
           WHERE id = $1 
           FOR UPDATE`,
          [recipe.inventory_item_id]
        );

        if (itemLockRes.rows.length === 0) {
          throw new AppError(`المادة الخام (${recipe.item_name}) غير موجودة في المخزن`, 404);
        }

        const stockItem = itemLockRes.rows[0];
        const requiredGrams = recipe.quantity_grams;

        if (stockItem.current_stock_grams < requiredGrams) {
          throw new AppError(
            `عفواً، رصيد المادة الخام (${stockItem.name}) بالمخزن غير كافٍ لإتمام الغسلة. ` +
              `المطلوب: ${requiredGrams} جرام، المتبقي الحالي: ${stockItem.current_stock_grams} جرام. ` +
              `يرجى توريد المخزن قبل إصدار الفاتورة.`,
            400,
            {
              item_id: stockItem.id,
              item_name: stockItem.name,
              current_stock: stockItem.current_stock_grams,
              required: requiredGrams,
            }
          );
        }

        const newStockGrams = Number(
          (stockItem.current_stock_grams - requiredGrams).toFixed(2)
        );

        await client.query(
          `UPDATE inventory_items 
           SET current_stock_grams = $1 
           WHERE id = $2`,
          [newStockGrams, stockItem.id]
        );

        deductedItems.push({
          inventory_item_id: stockItem.id,
          name: stockItem.name,
          deducted_grams: requiredGrams,
          remaining_stock_grams: newStockGrams,
          is_low_stock: newStockGrams <= stockItem.reorder_threshold_grams,
        });
      }

      // 4. Generate unique high-entropy order code
      const orderCode = generateReferenceCode('CW');


      // 5. Calculate financials (Egyptian VAT 14% inclusive)
      const totalPrice = Number(service.price);
      const subtotal = Number((totalPrice / 1.14).toFixed(2));
      const taxAmount = Number((totalPrice - subtotal).toFixed(2));

      // 6. Validate employee if provided
      if (data.assigned_employee_id) {
        const empCheck = await client.query(`SELECT id, name FROM employees WHERE id = $1`, [
          data.assigned_employee_id,
        ]);
        if (empCheck.rows.length === 0) {
          throw new AppError('الموظف المحدد غير موجود في النظام', 404);
        }
      }

      // 7. Auto resolve active shift if not passed
      let orderShiftId = data.shift_id || null;
      let orderCashierId = data.cashier_id || null;
      let orderCashierName = data.cashier_name ? data.cashier_name.trim() : null;

      if (!orderShiftId) {
        const activeShiftCheck = await client.query(
          `SELECT id, cashier_id, cashier_name FROM shifts WHERE status = 'active' ORDER BY shift_start DESC LIMIT 1`
        );
        if (activeShiftCheck.rows.length > 0) {
          orderShiftId = activeShiftCheck.rows[0].id;
          if (!orderCashierId) orderCashierId = activeShiftCheck.rows[0].cashier_id;
          if (!orderCashierName) orderCashierName = activeShiftCheck.rows[0].cashier_name;
        }
      }

      // 8. Insert order
      const orderStatus = data.status || 'completed';
      const paymentMethod = data.payment_method || 'cash';

      const insertOrderRes = await client.query(
        `INSERT INTO orders (
          order_code, 
          car_plate, 
          car_type, 
          customer_name, 
          customer_phone, 
          service_id, 
          subtotal, 
          tax_amount, 
          total_amount, 
          payment_method, 
          status, 
          assigned_employee_id, 
          notes,
          shift_id,
          cashier_id,
          cashier_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING 
          id, 
          order_code, 
          car_plate, 
          car_type, 
          customer_name, 
          customer_phone, 
          service_id, 
          subtotal::float AS subtotal, 
          tax_amount::float AS tax_amount, 
          total_amount::float AS total_amount, 
          payment_method, 
          status, 
          assigned_employee_id, 
          notes,
          shift_id,
          cashier_id,
          cashier_name,
          created_at, 
          updated_at`,
        [
          orderCode,
          data.car_plate ? data.car_plate.trim() : null,
          data.car_type ? data.car_type.trim() : 'سيدان',
          data.customer_name ? data.customer_name.trim() : null,
          data.customer_phone ? data.customer_phone.trim() : null,
          service.id,
          subtotal,
          taxAmount,
          totalPrice,
          paymentMethod,
          orderStatus,
          data.assigned_employee_id || null,
          data.notes ? data.notes.trim() : null,
          orderShiftId,
          orderCashierId,
          orderCashierName,
        ]
      );

      const createdOrder = insertOrderRes.rows[0];

      // Insert audit trail logs in inventory_transactions
      for (const item of deductedItems) {
        await client.query(
          `INSERT INTO inventory_transactions (
            inventory_item_id, order_id, transaction_type, quantity_grams,
            previous_stock_grams, new_stock_grams, cost_impact, notes
          ) VALUES ($1, $2, 'deduction_order', $3, $4, $5, $6, $7)`,
          [
            item.inventory_item_id,
            createdOrder.id,
            item.deducted_grams,
            Number((item.remaining_stock_grams + item.deducted_grams).toFixed(2)),
            item.remaining_stock_grams,
            0,
            `خصم مواد استهلاك لطلب رقم ${createdOrder.order_code}`,
          ]
        );
      }

      // Commit atomic transaction
      await client.query('COMMIT');

      // 4. Non-blocking ETA e-Receipt submission & queueing (optional based on eta_sync_enabled)
      try {
        const taxSettingsRes = await query(`SELECT is_enabled, eta_sync_enabled FROM tax_settings LIMIT 1`);
        if (
          taxSettingsRes.rows.length > 0 &&
          taxSettingsRes.rows[0].is_enabled &&
          taxSettingsRes.rows[0].eta_sync_enabled
        ) {
          await EtaQueueService.enqueueOrder(createdOrder.id);
          // Trigger sync asynchronously in background without blocking POS response
          EtaQueueService.syncOrder(createdOrder.id).catch((err) => {
            console.warn(`[POS ETA Background Sync] Async sync for order ${createdOrder.id} queued with message:`, err.message);
          });
        }
      } catch (queueErr: any) {
        console.warn('[POS ETA Enqueue Error]', queueErr.message);
      }

      // Fetch employee name if assigned
      let employeeName: string | undefined;
      if (createdOrder.assigned_employee_id) {
        const empNameRes = await query(`SELECT name FROM employees WHERE id = $1`, [
          createdOrder.assigned_employee_id,
        ]);
        if (empNameRes.rows.length > 0) {
          employeeName = empNameRes.rows[0].name;
        }
      }

      return {
        order: {
          ...createdOrder,
          service_name: service.name,
          assigned_employee_name: employeeName,
        },
        inventory_deductions: deductedItems,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getOrders(filters: {
    status?: string;
    date?: string;
    employee_id?: string;
    shift_id?: string;
    limit?: number;
    offset?: number;
  }) {
    let sql = `
      SELECT 
        o.id,
        o.order_code,
        o.car_plate,
        o.car_type,
        o.customer_name,
        o.customer_phone,
        o.service_id,
        s.name AS service_name,
        s.egs_code AS service_egs_code,
        o.subtotal::float AS subtotal,
        o.tax_amount::float AS tax_amount,
        o.total_amount::float AS total_amount,
        o.payment_method,
        o.status,
        o.assigned_employee_id,
        e.name AS assigned_employee_name,
        o.shift_id,
        o.cashier_id,
        o.cashier_name,
        o.eta_uuid,
        o.eta_submission_id,
        o.eta_status,
        o.eta_share_url,
        o.eta_synced_at,
        o.eta_error_message,
        o.notes,
        o.created_at,
        o.updated_at
      FROM orders o
      LEFT JOIN services s ON o.service_id = s.id
      LEFT JOIN employees e ON o.assigned_employee_id = e.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let idx = 1;

    if (filters.status) {
      sql += ` AND o.status = $${idx++}`;
      params.push(filters.status);
    }
    if (filters.date) {
      sql += ` AND DATE(o.created_at) = $${idx++}`;
      params.push(filters.date);
    }
    if (filters.employee_id) {
      sql += ` AND o.assigned_employee_id = $${idx++}`;
      params.push(filters.employee_id);
    }
    if (filters.shift_id) {
      sql += ` AND o.shift_id = $${idx++}`;
      params.push(filters.shift_id);
    }

    sql += ` ORDER BY o.created_at DESC`;

    const limit = filters.limit ? Math.min(filters.limit, 250) : 250;
    sql += ` LIMIT $${idx++}`;

    params.push(limit);

    if (filters.offset) {
      sql += ` OFFSET $${idx++}`;
      params.push(filters.offset);
    }

    const res = await query(sql, params);
    return res.rows;
  }

  static async getOrderById(id: string) {
    const sql = `
      SELECT 
        o.id,
        o.order_code,
        o.car_plate,
        o.car_type,
        o.customer_name,
        o.customer_phone,
        o.service_id,
        s.name AS service_name,
        s.egs_code AS service_egs_code,
        o.subtotal::float AS subtotal,
        o.tax_amount::float AS tax_amount,
        o.total_amount::float AS total_amount,
        o.payment_method,
        o.status,
        o.assigned_employee_id,
        e.name AS assigned_employee_name,
        o.shift_id,
        o.cashier_id,
        o.cashier_name,
        o.eta_uuid,
        o.eta_submission_id,
        o.eta_status,
        o.eta_share_url,
        o.eta_synced_at,
        o.eta_error_message,
        o.notes,
        o.created_at,
        o.updated_at
      FROM orders o
      LEFT JOIN services s ON o.service_id = s.id
      LEFT JOIN employees e ON o.assigned_employee_id = e.id
      WHERE o.id = $1
    `;

    const res = await query(sql, [id]);
    if (res.rows.length === 0) {
      throw new AppError('الفاتورة المطلوبة غير موجودة', 404);
    }

    return res.rows[0];
  }

  static async updateOrderStatus(id: string, status: string) {
    if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      throw new AppError('حالة الفاتورة غير صالحة', 400);
    }

    await this.getOrderById(id);

    const res = await query(
      `UPDATE orders 
       SET status = $1 
       WHERE id = $2 
       RETURNING id, order_code, status, updated_at`,
      [status, id]
    );

    return res.rows[0];
  }

  static async cancelOrder(id: string, reason?: string) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Fetch order with row lock
      const orderRes = await client.query(
        `SELECT id, order_code, service_id, status, total_amount, notes 
         FROM orders 
         WHERE id = $1 
         FOR UPDATE`,
        [id]
      );

      if (orderRes.rows.length === 0) {
        throw new AppError('الفاتورة المراد إلغاؤها غير موجودة', 404);
      }

      const order = orderRes.rows[0];
      if (order.status === 'cancelled') {
        throw new AppError('هذه الفاتورة ملغاة بالفعل مسبقاً', 400);
      }

      // 2. Fetch service recipe (BOM) to reverse inventory deduction
      const recipesRes = await client.query(
        `SELECT inventory_item_id, quantity_grams::float AS quantity_grams 
         FROM service_recipes 
         WHERE service_id = $1`,
        [order.service_id]
      );

      const restoredItems: Array<{ inventory_item_id: string; restored_grams: number }> = [];

      for (const recipe of recipesRes.rows) {
        await client.query(
          `UPDATE inventory_items 
           SET current_stock_grams = current_stock_grams + $1 
           WHERE id = $2`,
          [recipe.quantity_grams, recipe.inventory_item_id]
        );
        restoredItems.push({
          inventory_item_id: recipe.inventory_item_id,
          restored_grams: recipe.quantity_grams,
        });
      }

      // 3. Update order status and append cancellation reason in notes
      const cancelNote = reason
        ? `[إلغاء واسترجاع]: ${reason}`
        : `[إلغاء واسترجاع]: تم إلغاء الطلب وإعادة المواد الخام للمخزن`;

      const updatedNotes = order.notes ? `${order.notes} | ${cancelNote}` : cancelNote;

      const updateRes = await client.query(
        `UPDATE orders 
         SET status = 'cancelled', 
             notes = $1, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2 
         RETURNING id, order_code, service_id, total_amount, status, notes, updated_at`,
        [updatedNotes, id]
      );

      // Insert audit logs for restored inventory
      for (const item of restoredItems) {
        await client.query(
          `INSERT INTO inventory_transactions (
            inventory_item_id, order_id, transaction_type, quantity_grams,
            cost_impact, notes
          ) VALUES ($1, $2, 'cancel_restore', $3, 0, $4)`,
          [
            item.inventory_item_id,
            id,
            item.restored_grams,
            `إعادة المواد الخام للمخزن لإلغاء طلب رقم ${order.order_code || id}`,
          ]
        );
      }

      await client.query('COMMIT');

      return {
        order: updateRes.rows[0],
        restored_items_count: restoredItems.length,
        restored_items: restoredItems,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================
  // Active Shift & Cashier Session Management (PostgreSQL Neon DB)
  // ==========================================

  static async getActiveShift() {
    const shiftRes = await query(
      `SELECT 
        id,
        id AS shift_id,
        shift_code,
        cashier_id,
        cashier_name,
        COALESCE(cashier_role, 'كاشير واستقبال') AS cashier_role,
        shift_start,
        opening_cash::float AS opening_cash,
        active_device_id,
        status,
        created_at,
        updated_at
       FROM shifts
       WHERE status = 'active'
       ORDER BY shift_start DESC
       LIMIT 1`
    );

    if (shiftRes.rows.length === 0) {
      return null;
    }

    const shift = shiftRes.rows[0];

    // Auto-archive stale zombie shift older than 24 hours
    const shiftStartTime = new Date(shift.shift_start || shift.created_at).getTime();
    const ageHours = (Date.now() - shiftStartTime) / (1000 * 60 * 60);

    if (ageHours > 24) {
      await query(
        `UPDATE shifts
         SET status = 'closed',
             shift_end = CURRENT_TIMESTAMP,
             closing_notes = 'إغلاق تلقائي لانتهاء صلاحية الجلسة (>24 ساعة)',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [shift.id]
      );
      return null;
    }

    // Compute live metrics from orders associated with this active shift
    let m = {
      total_orders: 0,
      gross_sales: 0,
      cash_sales: 0,
      card_sales: 0,
      transfer_sales: 0,
    };

    try {
      const metricsRes = await query(
        `SELECT 
          COUNT(*)::int AS total_orders,
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0)::float AS gross_sales,
          COALESCE(SUM(CASE WHEN status != 'cancelled' AND payment_method = 'cash' THEN total_amount ELSE 0 END), 0)::float AS cash_sales,
          COALESCE(SUM(CASE WHEN status != 'cancelled' AND payment_method = 'card' THEN total_amount ELSE 0 END), 0)::float AS card_sales,
          COALESCE(SUM(CASE WHEN status != 'cancelled' AND payment_method IN ('transfer', 'wallet') THEN total_amount ELSE 0 END), 0)::float AS transfer_sales
         FROM orders
         WHERE ((shift_id IS NOT NULL AND shift_id = $1) OR (cashier_id = $3 AND created_at >= $2))`,
        [shift.id, shift.shift_start, shift.cashier_id]
      );
      if (metricsRes.rows.length > 0) {
        m = metricsRes.rows[0];
      }
    } catch (metricsErr) {
      console.warn('[Non-Fatal Metrics Query Warning in pos.service.ts]', metricsErr);
    }

    return {
      ...shift,
      id: shift.id,
      shift_id: shift.id,
      name: shift.cashier_name,
      role: shift.cashier_role,
      active_device_id: shift.active_device_id || null,
      gross_sales: m.gross_sales,
      cash_sales: m.cash_sales,
      card_sales: m.card_sales,
      transfer_sales: m.transfer_sales,
      total_orders: m.total_orders,
    };
  }

  static async startActiveShift(data: {
    shift_id?: string;
    shift_code?: string;
    cashier_id: string;
    cashier_name: string;
    cashier_role?: string;
    shift_start?: string;
    opening_cash?: number;
    device_id?: string;
    active_device_id?: string;
  }) {
    const cashierId = data.cashier_id;
    const cashierName = (data.cashier_name || 'الكاشير').trim();
    const cashierRole = (data.cashier_role || 'كاشير واستقبال').trim();
    const shiftStart = data.shift_start || new Date().toISOString();
    const openingCash = Number(data.opening_cash) || 0;
    const deviceId = (data.device_id || data.active_device_id || '').trim() || null;
    const todayStr = new Date(shiftStart).toISOString().slice(0, 10);

    // 1. Check for any currently active shift in DB (Single Active Shift Rule)
    const activeShiftsRes = await query(
      `SELECT s.*, COALESCE(s.cashier_name, 'الكاشير') AS active_cashier_name
       FROM shifts s
       WHERE s.status = 'active'
       ORDER BY s.shift_start DESC
       LIMIT 1`
    );

    if (activeShiftsRes.rows.length > 0) {
      const existing = activeShiftsRes.rows[0];
      const existingStartTime = new Date(existing.shift_start || existing.created_at).getTime();
      const existingAgeHours = (Date.now() - existingStartTime) / (1000 * 60 * 60);

      if (existingAgeHours > 24) {
        // Auto-archive stale zombie shift older than 24 hours
        await query(
          `UPDATE shifts
           SET status = 'closed',
               shift_end = CURRENT_TIMESTAMP,
               closing_notes = 'إغلاق تلقائي لانتهاء صلاحية الجلسة (>24 ساعة)',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [existing.id]
        );
      } else {
        const normalizeStr = (s: any) => String(s || '').trim().toLowerCase();
        const normalizeArabic = (s: any) =>
          normalizeStr(s)
            .replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/[\u064B-\u065F]/g, '') // remove Arabic tashkeel/diacritics
            .replace(/\s+/g, ' ');

        const normReqId = normalizeStr(cashierId);
        const normExistId = normalizeStr(existing.cashier_id);
        const normReqName = normalizeArabic(cashierName);
        const normExistName = normalizeArabic(existing.cashier_name || existing.active_cashier_name);

        const isSameCashier =
          (normReqId && normExistId && normReqId === normExistId) ||
          (normReqName && normExistName && normReqName === normExistName);

        if (!isSameCashier) {
          // Strictly reject conflicting cashier shift with 409 Conflict
          throw new AppError(
            `يوجد شفت كاشير نشط بالفعل للموظف: (${existing.active_cashier_name}). يجب تقفيل الشفت الحالي أولاً قبل بدء شفت جديد.`,
            409,
            {
              error: 'active_shift_exists',
              active_cashier_name: existing.active_cashier_name,
              active_cashier_id: existing.cashier_id,
              shift_id: existing.id,
              shift_code: existing.shift_code,
            }
          );
        }

        // Same cashier resuming / transferring session to this device:
        let resolvedDeviceId = existing.active_device_id;
        if (deviceId && deviceId !== existing.active_device_id) {
          await query(
            `UPDATE shifts
             SET active_device_id = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [deviceId, existing.id]
          );
          resolvedDeviceId = deviceId;
        }

        return {
          ...existing,
          id: existing.id,
          shift_id: existing.id,
          cashier_id: existing.cashier_id,
          cashier_name: existing.cashier_name,
          cashier_role: existing.cashier_role,
          name: existing.cashier_name,
          role: existing.cashier_role,
          active_device_id: resolvedDeviceId,
          opening_cash: Number(existing.opening_cash) || 0,
          status: 'active',
          updated_at: new Date().toISOString(),
        };
      }
    }

    const shiftCode =
      data.shift_code ||
      data.shift_id ||
      `SHIFT-${todayStr.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const insertRes = await query(
      `INSERT INTO shifts (
        shift_code, cashier_id, cashier_name, cashier_role, shift_start, opening_cash, active_device_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
      RETURNING id, shift_code, cashier_id, cashier_name, cashier_role, shift_start, opening_cash::float AS opening_cash, active_device_id, status, created_at, updated_at`,
      [shiftCode, cashierId, cashierName, cashierRole, shiftStart, openingCash, deviceId]
    );
    const activeShiftRecord = insertRes.rows[0];

    // 2. Ensure auto-attendance check-in for the cashier in Neon DB attendance table
    if (cashierId) {
      try {
        const attCheck = await query(
          `SELECT id FROM attendance WHERE employee_id = $1 AND work_date = $2 AND check_out IS NULL LIMIT 1`,
          [cashierId, todayStr]
        );
        if (attCheck.rows.length === 0) {
          await query(
            `INSERT INTO attendance (
              employee_id, work_date, check_in, actual_hours, overtime_hours, deducted_hours, notes
            ) VALUES ($1, $2, $3, 0, 0, 0, $4)`,
            [cashierId, todayStr, shiftStart, 'تسجيل حضور تلقائي عند بدء شفت الكاشير']
          );
        }
      } catch (attErr: any) {
        console.warn('[Attendance Auto-Clock In Error]', attErr.message);
      }
    }

    return {
      ...activeShiftRecord,
      id: activeShiftRecord.id,
      shift_id: activeShiftRecord.id,
      cashier_id: activeShiftRecord.cashier_id,
      cashier_name: activeShiftRecord.cashier_name,
      cashier_role: activeShiftRecord.cashier_role,
      name: activeShiftRecord.cashier_name,
      role: activeShiftRecord.cashier_role,
      active_device_id: activeShiftRecord.active_device_id,
      status: 'active',
      updated_at: new Date().toISOString(),
    };
  }

  static async closeActiveShift(shiftRecord: any) {
    const shiftId = shiftRecord?.id || shiftRecord?.shift_id;
    const shiftCode = shiftRecord?.shift_code;
    const shiftEnd = shiftRecord?.shift_end || new Date().toISOString();
    const grossSales = Number(shiftRecord?.gross_sales) || 0;
    const cashSales = Number(shiftRecord?.cash_sales) || 0;
    const cardSales = Number(shiftRecord?.card_sales) || 0;
    const transferSales = Number(shiftRecord?.transfer_sales) || 0;
    const totalOrders = Number(shiftRecord?.total_orders) || 0;
    const expectedCash = Number(shiftRecord?.expected_cash) || 0;
    const actualCash = Number(shiftRecord?.actual_cash) || 0;
    const variance = Number(shiftRecord?.variance) || 0;
    const closingNotes = shiftRecord?.closing_notes || null;
    const approvedBy = shiftRecord?.approved_by || 'الإدارة';
    const isEndOfDay = !!shiftRecord?.is_end_of_day;
    const workersBreakdown = JSON.stringify(shiftRecord?.active_workers_breakdown || []);

    const updateRes = await query(
      `UPDATE shifts
       SET 
         status = 'closed',
         shift_end = $1,
         gross_sales = $2,
         cash_sales = $3,
         card_sales = $4,
         transfer_sales = $5,
         total_orders = $6,
         expected_cash = $7,
         actual_cash = $8,
         variance = $9,
         closing_notes = $10,
         approved_by = $11,
         is_end_of_day = $12,
         active_workers_breakdown = $13,
         updated_at = CURRENT_TIMESTAMP
       WHERE (
         ($14 != '' AND id::text = $14)
         OR ($15 != '' AND shift_code = $15)
         OR status = 'active'
       )
       RETURNING *`,
      [
        shiftEnd,
        grossSales,
        cashSales,
        cardSales,
        transferSales,
        totalOrders,
        expectedCash,
        actualCash,
        variance,
        closingNotes,
        approvedBy,
        isEndOfDay,
        workersBreakdown,
        String(shiftId || ''),
        String(shiftCode || ''),
      ]
    );

    // Auto clock-out cashier or all open attendance if end of day
    const cashierId = shiftRecord?.cashier_id || updateRes.rows[0]?.cashier_id;
    if (isEndOfDay) {
      try {
        const openAtts = await query(`SELECT id, employee_id, check_in FROM attendance WHERE check_out IS NULL`);
        for (const att of openAtts.rows) {
          const inTime = new Date(att.check_in).getTime();
          const outTime = new Date(shiftEnd).getTime();
          const actualHours = Number((Math.max(outTime - inTime, 0) / (1000 * 60 * 60)).toFixed(2));
          await query(
            `UPDATE attendance SET check_out = $1, actual_hours = $2, notes = COALESCE(notes, '') || ' | تقفيل نهاية اليوم' WHERE id = $3`,
            [shiftEnd, actualHours, att.id]
          );
        }
      } catch (attCloseErr: any) {
        console.warn('[End-Of-Day Attendance Clock-out Error]', attCloseErr.message);
      }
    } else if (cashierId) {
      try {
        const openAtt = await query(
          `SELECT id, check_in FROM attendance WHERE employee_id = $1 AND check_out IS NULL ORDER BY check_in DESC LIMIT 1`,
          [cashierId]
        );
        if (openAtt.rows.length > 0) {
          const checkInDate = new Date(openAtt.rows[0].check_in);
          const outDate = new Date(shiftEnd);
          const diffMs = Math.max(outDate.getTime() - checkInDate.getTime(), 0);
          const actualHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
          await query(
            `UPDATE attendance SET check_out = $1, actual_hours = $2, notes = COALESCE(notes, '') || ' | تقفيل وردية الكاشير' WHERE id = $3`,
            [shiftEnd, actualHours, openAtt.rows[0].id]
          );
        }
      } catch (attCloseErr: any) {
        console.warn('[Attendance Auto-Clock Out Error]', attCloseErr.message);
      }
    }

    return {
      success: true,
      message: 'تم إقفال الوردية النشطة وأرشفتها بنجاح في قاعدة البيانات',
      data: updateRes.rows[0] || shiftRecord,
    };
  }

  static async getClosedShifts(filters?: {
    startDate?: string;
    endDate?: string;
    cashierId?: string;
    search?: string;
  }) {
    let sql = `
      SELECT 
        id,
        shift_code,
        cashier_id,
        cashier_name,
        COALESCE(cashier_role, 'كاشير واستقبال') AS cashier_role,
        shift_start,
        shift_end,
        opening_cash::float AS opening_cash,
        gross_sales::float AS gross_sales,
        cash_sales::float AS cash_sales,
        card_sales::float AS card_sales,
        transfer_sales::float AS transfer_sales,
        total_orders::int AS total_orders,
        expected_cash::float AS expected_cash,
        actual_cash::float AS actual_cash,
        variance::float AS variance,
        status,
        closing_notes,
        approved_by,
        is_end_of_day,
        active_workers_breakdown,
        created_at,
        updated_at
      FROM shifts
      WHERE status = 'closed'
    `;

    const params: any[] = [];
    let idx = 1;

    if (filters?.cashierId) {
      sql += ` AND cashier_id = $${idx++}`;
      params.push(filters.cashierId);
    }
    if (filters?.startDate) {
      sql += ` AND (shift_start >= $${idx} OR created_at >= $${idx})`;
      params.push(filters.startDate);
      idx++;
    }
    if (filters?.endDate) {
      sql += ` AND (shift_end <= $${idx} OR created_at <= $${idx})`;
      params.push(filters.endDate);
      idx++;
    }
    if (filters?.search && filters.search.trim()) {
      sql += ` AND (LOWER(shift_code) LIKE $${idx} OR LOWER(cashier_name) LIKE $${idx} OR LOWER(closing_notes) LIKE $${idx})`;
      params.push(`%${filters.search.trim().toLowerCase()}%`);
      idx++;
    }

    sql += ` ORDER BY shift_start DESC LIMIT 100`;

    const res = await query(sql, params);
    return res.rows;
  }

  static async deleteClosedShift(id: string) {
    const shiftIdStr = String(id || '');
    await query(`UPDATE orders SET shift_id = NULL WHERE shift_id::text = $1`, [shiftIdStr]);
    await query(`DELETE FROM shifts WHERE id::text = $1 OR shift_code = $1`, [shiftIdStr]);
    return { success: true, message: 'تم حذف سجل الوردية بنجاح من قاعدة البيانات' };
  }
}


