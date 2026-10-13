import { query } from '../../config/db.js';
import { AppError } from '../../middleware/errorHandler.js';

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  current_stock_grams: number;
  reorder_threshold_grams: number;
  cost_per_gram: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export class InventoryService {
  static async getAll(lowStockOnly: boolean = false) {
    let sql = `
      SELECT 
        id, 
        name, 
        unit, 
        current_stock_grams::float AS current_stock_grams, 
        reorder_threshold_grams::float AS reorder_threshold_grams, 
        cost_per_gram::float AS cost_per_gram, 
        notes,
        created_at,
        updated_at,
        (current_stock_grams <= reorder_threshold_grams) AS is_low_stock
      FROM inventory_items
    `;

    if (lowStockOnly) {
      sql += ` WHERE current_stock_grams <= reorder_threshold_grams`;
    }

    sql += ` ORDER BY name ASC`;

    const res = await query(sql);
    return res.rows;
  }

  static async getById(id: string) {
    const res = await query(
      `SELECT 
        id, 
        name, 
        unit, 
        current_stock_grams::float AS current_stock_grams, 
        reorder_threshold_grams::float AS reorder_threshold_grams, 
        cost_per_gram::float AS cost_per_gram, 
        notes,
        created_at,
        updated_at,
        (current_stock_grams <= reorder_threshold_grams) AS is_low_stock
      FROM inventory_items 
      WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) {
      throw new AppError('المادة الخام المطلوبة غير موجودة في المخزن', 404);
    }

    return res.rows[0];
  }

  static async create(data: {
    name: string;
    unit?: string;
    current_stock_grams?: number;
    reorder_threshold_grams?: number;
    cost_per_gram?: number;
    notes?: string;
  }) {
    const unit = data.unit || 'gram';
    const stock = data.current_stock_grams ?? 0;
    const threshold = data.reorder_threshold_grams ?? 1000;
    const cost = data.cost_per_gram ?? 0;

    const res = await query(
      `INSERT INTO inventory_items (name, unit, current_stock_grams, reorder_threshold_grams, cost_per_gram, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING 
        id, 
        name, 
        unit, 
        current_stock_grams::float AS current_stock_grams, 
        reorder_threshold_grams::float AS reorder_threshold_grams, 
        cost_per_gram::float AS cost_per_gram, 
        notes,
        created_at,
        updated_at`,
      [data.name, unit, stock, threshold, cost, data.notes || null]
    );

    return res.rows[0];
  }

  static async update(
    id: string,
    data: {
      name?: string;
      unit?: string;
      current_stock_grams?: number;
      reorder_threshold_grams?: number;
      cost_per_gram?: number;
      notes?: string;
    }
  ) {
    await this.getById(id);

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.unit !== undefined) {
      fields.push(`unit = $${idx++}`);
      values.push(data.unit);
    }
    if (data.current_stock_grams !== undefined) {
      fields.push(`current_stock_grams = $${idx++}`);
      values.push(data.current_stock_grams);
    }
    if (data.reorder_threshold_grams !== undefined) {
      fields.push(`reorder_threshold_grams = $${idx++}`);
      values.push(data.reorder_threshold_grams);
    }
    if (data.cost_per_gram !== undefined) {
      fields.push(`cost_per_gram = $${idx++}`);
      values.push(data.cost_per_gram);
    }
    if (data.notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(data.notes);
    }

    if (fields.length === 0) {
      throw new AppError('لا توجد بيانات مقدمة للتعديل', 400);
    }

    values.push(id);
    const sql = `
      UPDATE inventory_items 
      SET ${fields.join(', ')} 
      WHERE id = $${idx}
      RETURNING 
        id, 
        name, 
        unit, 
        current_stock_grams::float AS current_stock_grams, 
        reorder_threshold_grams::float AS reorder_threshold_grams, 
        cost_per_gram::float AS cost_per_gram, 
        notes,
        created_at,
        updated_at
    `;

    const res = await query(sql, values);
    return res.rows[0];
  }

  static async delete(id: string) {
    await this.getById(id);
    await query(`DELETE FROM inventory_items WHERE id = $1`, [id]);
    return { success: true, message: 'تم حذف المادة بنجاح' };
  }

  static async restock(id: string, gramsToAdd: number, newCostPerGram?: number) {
    if (gramsToAdd <= 0) {
      throw new AppError('يجب أن تكون كمية التوريد أكبر من صفر', 400);
    }

    const currentItem = await this.getById(id);

    let sql: string;
    let params: any[];

    if (newCostPerGram !== undefined && newCostPerGram >= 0) {
      sql = `
        UPDATE inventory_items
        SET 
          current_stock_grams = current_stock_grams + $1,
          cost_per_gram = $2
        WHERE id = $3
        RETURNING 
          id, 
          name, 
          unit, 
          current_stock_grams::float AS current_stock_grams, 
          reorder_threshold_grams::float AS reorder_threshold_grams, 
          cost_per_gram::float AS cost_per_gram, 
          notes,
          created_at,
          updated_at
      `;
      params = [gramsToAdd, newCostPerGram, id];
    } else {
      sql = `
        UPDATE inventory_items
        SET current_stock_grams = current_stock_grams + $1
        WHERE id = $2
        RETURNING 
          id, 
          name, 
          unit, 
          current_stock_grams::float AS current_stock_grams, 
          reorder_threshold_grams::float AS reorder_threshold_grams, 
          cost_per_gram::float AS cost_per_gram, 
          notes,
          created_at,
          updated_at
      `;
      params = [gramsToAdd, id];
    }

    const res = await query(sql, params);
    
    // Insert audit log in inventory_transactions
    try {
      await query(
        `INSERT INTO inventory_transactions (
          inventory_item_id, transaction_type, quantity_grams,
          previous_stock_grams, new_stock_grams, cost_impact, notes
        ) VALUES ($1, 'restock', $2, $3, $4, $5, $6)`,
        [
          id,
          gramsToAdd,
          currentItem.current_stock_grams,
          res.rows[0].current_stock_grams,
          Number((gramsToAdd * (newCostPerGram ?? currentItem.cost_per_gram ?? 0)).toFixed(2)),
          `توريد ${gramsToAdd.toLocaleString()} جرام لمادة ${currentItem.name}`,
        ]
      );
    } catch (e: any) {
      console.warn('[Inventory Restock Audit Warning]', e.message);
    }

    return {
      item: res.rows[0],
      addedGrams: gramsToAdd,
      previousStockGrams: currentItem.current_stock_grams,
      newStockGrams: res.rows[0].current_stock_grams,
    };
  }
}
