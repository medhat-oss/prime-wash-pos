import { query, getClient } from '../../config/db.js';
import { AppError } from '../../middleware/errorHandler.js';

export interface TaxSettings {
  id?: string;
  is_enabled: boolean;
  eta_sync_enabled: boolean;
  environment: 'preprod' | 'production';
  client_id?: string | null;
  client_secret?: string | null;
  tax_registration_number?: string | null;
  pos_serial?: string | null;
  branch_code?: string;
  pos_os_version?: string;
  remote_signer_url?: string | null;
  remote_signer_token?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TaxSettingsData {
  is_enabled?: boolean;
  eta_sync_enabled?: boolean;
  environment?: 'preprod' | 'production';
  client_id?: string | null;
  client_secret?: string | null;
  tax_registration_number?: string | null;
  pos_serial?: string | null;
  branch_code?: string | null;
  pos_os_version?: string | null;
  remote_signer_url?: string | null;
  remote_signer_token?: string | null;
}

export class TaxService {
  /**
   * Helper to mask secrets for safe external delivery
   */
  private static maskSettingsSecrets(settings: TaxSettings): TaxSettings {
    return {
      ...settings,
      client_secret: settings.client_secret ? '********' : null,
      remote_signer_token: settings.remote_signer_token ? '********' : null,
    };
  }

  /**
   * Get current tax settings or initialize a default row if none exists
   * @param maskSecrets Defaults to true for secure client responses
   */
  static async getSettings(maskSecrets: boolean = true) {
    const res = await query(`SELECT * FROM tax_settings ORDER BY created_at ASC LIMIT 1`);
    if (res.rows.length === 0) {
      const initRes = await query(`
        INSERT INTO tax_settings (is_enabled, eta_sync_enabled, environment, branch_code, pos_os_version)
        VALUES (false, false, 'preprod', '0', 'Windows')
        RETURNING *
      `);
      const row = initRes.rows[0];
      return maskSecrets ? this.maskSettingsSecrets(row) : row;
    }
    const row = res.rows[0];
    return maskSecrets ? this.maskSettingsSecrets(row) : row;
  }

  /**
   * Update or upsert tax settings
   */
  static async updateSettings(data: TaxSettingsData) {
    const current = await this.getSettings(false);

    const sanitize = (val: any): string | null => {
      if (val === null || val === undefined) return null;
      const str = String(val).trim();
      return str === '' ? null : str;
    };

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.is_enabled !== undefined) {
      fields.push(`is_enabled = $${idx++}`);
      values.push(Boolean(data.is_enabled));
    }
    if (data.eta_sync_enabled !== undefined) {
      fields.push(`eta_sync_enabled = $${idx++}`);
      values.push(Boolean(data.eta_sync_enabled));
    }
    if (data.environment !== undefined) {
      if (!['preprod', 'production'].includes(data.environment)) {
        throw new AppError('بيئة التشغيل يجب أن تكون إما preprod أو production', 400);
      }
      fields.push(`environment = $${idx++}`);
      values.push(data.environment);
    }
    if (data.client_id !== undefined) {
      fields.push(`client_id = $${idx++}`);
      values.push(sanitize(data.client_id));
    }
    if (data.client_secret !== undefined) {
      const sec = sanitize(data.client_secret);
      // Do not overwrite secret if client submitted the masked placeholder
      if (sec !== '********') {
        fields.push(`client_secret = $${idx++}`);
        values.push(sec);
      }
    }
    if (data.tax_registration_number !== undefined) {
      fields.push(`tax_registration_number = $${idx++}`);
      values.push(sanitize(data.tax_registration_number));
    }
    if (data.pos_serial !== undefined) {
      fields.push(`pos_serial = $${idx++}`);
      values.push(sanitize(data.pos_serial));
    }
    if (data.branch_code !== undefined) {
      fields.push(`branch_code = $${idx++}`);
      values.push(sanitize(data.branch_code) || '0');
    }
    if (data.pos_os_version !== undefined) {
      fields.push(`pos_os_version = $${idx++}`);
      values.push(sanitize(data.pos_os_version) || 'Windows');
    }
    if (data.remote_signer_url !== undefined) {
      fields.push(`remote_signer_url = $${idx++}`);
      values.push(sanitize(data.remote_signer_url));
    }
    if (data.remote_signer_token !== undefined) {
      const tok = sanitize(data.remote_signer_token);
      // Do not overwrite token if client submitted the masked placeholder
      if (tok !== '********') {
        fields.push(`remote_signer_token = $${idx++}`);
        values.push(tok);
      }
    }

    if (fields.length === 0) {
      return this.maskSettingsSecrets(current);
    }

    values.push(current.id);
    const sql = `
      UPDATE tax_settings 
      SET ${fields.join(', ')} 
      WHERE id = $${idx}
      RETURNING *
    `;

    const updateRes = await query(sql, values);
    return this.maskSettingsSecrets(updateRes.rows[0]);
  }

  /**
   * Get all services with their current EGS / GS1 tax coding
   */
  static async getServicesTaxCodes() {
    const sql = `
      SELECT 
        s.id,
        s.name,
        s.price::float AS price,
        s.category,
        s.status,
        s.egs_code,
        s.updated_at,
        COUNT(sr.id)::int AS recipes_count
      FROM services s
      LEFT JOIN service_recipes sr ON s.id = sr.service_id
      GROUP BY s.id
      ORDER BY s.price ASC
    `;
    const res = await query(sql);
    return res.rows;
  }

  /**
   * Update EGS code for a specific service
   */
  static async updateServiceTaxCode(serviceId: string, egs_code: string | null) {
    const cleanCode = egs_code != null && String(egs_code).trim() !== '' ? String(egs_code).trim() : null;

    const res = await query(
      `UPDATE services 
       SET egs_code = $1 
       WHERE id = $2 
       RETURNING id, name, price::float AS price, category, egs_code, status, updated_at`,
      [cleanCode, serviceId]
    );

    if (res.rows.length === 0) {
      throw new AppError('خدمة الغسيل المطلوبة غير موجودة', 404);
    }

    return res.rows[0];
  }

  /**
   * Batch update EGS codes for multiple services
   */
  static async batchUpdateServiceTaxCodes(items: Array<{ id: string; egs_code: string | null }>) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError('يجب تقديم قائمة بأكواد الخدمات للتحديث', 400);
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      const updatedList: any[] = [];

      for (const item of items) {
        if (item.id) {
          const cleanCode = item.egs_code != null && String(item.egs_code).trim() !== '' ? String(item.egs_code).trim() : null;
          const res = await client.query(
            `UPDATE services SET egs_code = $1 WHERE id = $2 RETURNING id, name, egs_code`,
            [cleanCode, item.id]
          );
          if (res.rows.length > 0) {
            updatedList.push(res.rows[0]);
          }
        }
      }

      await client.query('COMMIT');
      return {
        success: true,
        count: updatedList.length,
        updated: updatedList,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get ETA integration statistics and queue metrics
   */
  static async getTaxStats() {
    const [ordersStatsRes, queueStatsRes] = await Promise.all([
      query(`
        SELECT 
          COUNT(*)::int AS total_orders,
          COUNT(*) FILTER (WHERE eta_status = 'valid')::int AS synced_valid_count,
          COUNT(*) FILTER (WHERE eta_status = 'pending')::int AS pending_count,
          COUNT(*) FILTER (WHERE eta_status IN ('invalid', 'failed'))::int AS failed_count,
          COUNT(*) FILTER (WHERE eta_status = 'not_synced' OR eta_status IS NULL)::int AS not_synced_count
        FROM orders
      `),
      query(`
        SELECT 
          COUNT(*)::int AS total_queue_items,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS queue_pending,
          COUNT(*) FILTER (WHERE status = 'processing')::int AS queue_processing,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS queue_failed
        FROM eta_sync_queue
      `),
    ]);

    const orderMetrics = ordersStatsRes.rows[0] || {
      total_orders: 0,
      synced_valid_count: 0,
      pending_count: 0,
      failed_count: 0,
      not_synced_count: 0,
    };

    const queueMetrics = queueStatsRes.rows[0] || {
      total_queue_items: 0,
      queue_pending: 0,
      queue_processing: 0,
      queue_failed: 0,
    };

    return {
      orders: orderMetrics,
      queue: queueMetrics,
    };
  }
}
