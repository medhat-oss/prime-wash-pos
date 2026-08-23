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

      // 7. Insert order
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
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        ]
      );

      const createdOrder = insertOrderRes.rows[0];

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
}


