import { query, getClient } from '../../config/db.js';
import { AppError } from '../../middleware/errorHandler.js';

export interface RecipeInput {
  inventory_item_id: string;
  quantity_grams: number;
  notes?: string;
}

export class ServicesService {
  static async getAll(status?: 'active' | 'inactive') {
    let sql = `
      SELECT 
        s.id,
        s.name,
        s.price::float AS price,
        s.description,
        s.category,
        s.egs_code,
        s.media_url,
        s.media_type,
        s.status,
        s.created_at,
        s.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', sr.id,
              'inventory_item_id', sr.inventory_item_id,
              'inventory_name', i.name,
              'quantity_grams', sr.quantity_grams::float,
              'cost_per_gram', i.cost_per_gram::float,
              'item_cost', (sr.quantity_grams * i.cost_per_gram)::float,
              'notes', sr.notes
            )
          ) FILTER (WHERE sr.id IS NOT NULL),
          '[]'
        ) AS recipes,
        COALESCE(SUM(sr.quantity_grams * i.cost_per_gram)::float, 0) AS estimated_material_cost
      FROM services s
      LEFT JOIN service_recipes sr ON s.id = sr.service_id
      LEFT JOIN inventory_items i ON sr.inventory_item_id = i.id
    `;

    const params: any[] = [];
    if (status) {
      sql += ` WHERE s.status = $1`;
      params.push(status);
    }

    sql += ` GROUP BY s.id ORDER BY s.price ASC`;

    const res = await query(sql, params);
    return res.rows;
  }

  static async getById(id: string) {
    const sql = `
      SELECT 
        s.id,
        s.name,
        s.price::float AS price,
        s.description,
        s.category,
        s.egs_code,
        s.media_url,
        s.media_type,
        s.status,
        s.created_at,
        s.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', sr.id,
              'inventory_item_id', sr.inventory_item_id,
              'inventory_name', i.name,
              'quantity_grams', sr.quantity_grams::float,
              'cost_per_gram', i.cost_per_gram::float,
              'item_cost', (sr.quantity_grams * i.cost_per_gram)::float,
              'notes', sr.notes
            )
          ) FILTER (WHERE sr.id IS NOT NULL),
          '[]'
        ) AS recipes,
        COALESCE(SUM(sr.quantity_grams * i.cost_per_gram)::float, 0) AS estimated_material_cost
      FROM services s
      LEFT JOIN service_recipes sr ON s.id = sr.service_id
      LEFT JOIN inventory_items i ON sr.inventory_item_id = i.id
      WHERE s.id = $1
      GROUP BY s.id
    `;

    const res = await query(sql, [id]);
    if (res.rows.length === 0) {
      throw new AppError('خدمة الغسيل المطلوبة غير موجودة', 404);
    }

    return res.rows[0];
  }

  static async create(data: {
    name: string;
    price: number;
    description?: string;
    category?: string;
    egs_code?: string;
    media_url?: string;
    media_type?: string;
    status?: string;
    recipes?: RecipeInput[];
  }) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const sRes = await client.query(
        `INSERT INTO services (name, price, description, category, egs_code, media_url, media_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, price::float AS price, description, category, egs_code, media_url, media_type, status, created_at, updated_at`,
        [
          data.name,
          data.price,
          data.description || null,
          data.category || 'عام',
          data.egs_code || null,
          data.media_url || null,
          data.media_type || 'none',
          data.status || 'active',
        ]
      );

      const newService = sRes.rows[0];

      if (data.recipes && data.recipes.length > 0) {
        for (const r of data.recipes) {
          if (r.inventory_item_id && r.quantity_grams > 0) {
            await client.query(
              `INSERT INTO service_recipes (service_id, inventory_item_id, quantity_grams, notes)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (service_id, inventory_item_id) DO UPDATE SET quantity_grams = EXCLUDED.quantity_grams`,
              [newService.id, r.inventory_item_id, r.quantity_grams, r.notes || null]
            );
          }
        }
      }

      await client.query('COMMIT');
      return await this.getById(newService.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async update(
    id: string,
    data: {
      name?: string;
      price?: number;
      description?: string;
      category?: string;
      egs_code?: string;
      media_url?: string;
      media_type?: string;
      status?: string;
      recipes?: RecipeInput[];
    }
  ) {
    await this.getById(id);

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (data.name !== undefined) {
        fields.push(`name = $${idx++}`);
        values.push(data.name);
      }
      if (data.price !== undefined) {
        fields.push(`price = $${idx++}`);
        values.push(data.price);
      }
      if (data.description !== undefined) {
        fields.push(`description = $${idx++}`);
        values.push(data.description);
      }
      if (data.category !== undefined) {
        fields.push(`category = $${idx++}`);
        values.push(data.category);
      }
      if (data.egs_code !== undefined) {
        fields.push(`egs_code = $${idx++}`);
        values.push(data.egs_code ? data.egs_code.trim() : null);
      }
      if (data.media_url !== undefined) {
        fields.push(`media_url = $${idx++}`);
        values.push(data.media_url ? data.media_url.trim() : null);
      }
      if (data.media_type !== undefined) {
        fields.push(`media_type = $${idx++}`);
        values.push(data.media_type || 'none');
      }
      if (data.status !== undefined) {
        fields.push(`status = $${idx++}`);
        values.push(data.status);
      }


      if (fields.length > 0) {
        values.push(id);
        const sql = `
          UPDATE services 
          SET ${fields.join(', ')} 
          WHERE id = $${idx}
        `;
        await client.query(sql, values);
      }

      // Update recipes atomically if provided
      if (data.recipes !== undefined) {
        await client.query('DELETE FROM service_recipes WHERE service_id = $1', [id]);
        for (const r of data.recipes) {
          if (r.inventory_item_id && r.quantity_grams > 0) {
            await client.query(
              `INSERT INTO service_recipes (service_id, inventory_item_id, quantity_grams, notes)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (service_id, inventory_item_id) DO UPDATE SET quantity_grams = EXCLUDED.quantity_grams`,
              [id, r.inventory_item_id, r.quantity_grams, r.notes || null]
            );
          }
        }
      }

      await client.query('COMMIT');
      return await this.getById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async setRecipes(serviceId: string, recipes: RecipeInput[]) {
    await this.getById(serviceId);

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM service_recipes WHERE service_id = $1', [serviceId]);

      for (const r of recipes) {
        if (!r.inventory_item_id || !r.quantity_grams || r.quantity_grams <= 0) {
          throw new AppError('بيانات وصفة المادة الخام غير صحيحة (المعرف أو كمية الجرامات)', 400);
        }

        await client.query(
          `INSERT INTO service_recipes (service_id, inventory_item_id, quantity_grams, notes)
           VALUES ($1, $2, $3, $4)`,
          [serviceId, r.inventory_item_id, r.quantity_grams, r.notes || null]
        );
      }

      await client.query('COMMIT');
      return await this.getById(serviceId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async delete(id: string) {
    await this.getById(id);
    await query('DELETE FROM services WHERE id = $1', [id]);
    return { success: true, message: 'تم حذف الخدمة بنجاح' };
  }
}
