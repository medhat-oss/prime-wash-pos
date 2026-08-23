import { query, getClient } from '../../../config/db.js';
import { TaxService } from '../tax.service.js';
import { EtaAuthService } from './etaAuth.service.js';
import { ReceiptBuilderService, OrderForEta } from './receiptBuilder.service.js';
import { EtaSignerService } from './etaSigner.service.js';
import { EtaSubmitterService, SubmissionResult } from './etaSubmitter.service.js';
import { AppError } from '../../../middleware/errorHandler.js';

export class EtaQueueService {
  /**
   * Enqueue order into sync queue (deduplicated)
   */
  static async enqueueOrder(orderId: string) {
    const existing = await query(
      `SELECT id, status FROM eta_sync_queue 
       WHERE order_id = $1 AND status IN ('pending', 'processing', 'synced') 
       LIMIT 1`,
      [orderId]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    const res = await query(
      `INSERT INTO eta_sync_queue (order_id, status, attempts, next_retry_at)
       VALUES ($1, 'pending', 0, NOW())
       RETURNING *`,
      [orderId]
    );
    return res.rows[0];
  }


  /**
   * Sync single order immediately to Egyptian Tax Authority
   */
  static async syncOrder(orderId: string): Promise<SubmissionResult> {
    // 1. Fetch Tax Settings
    const settings = await TaxService.getSettings(false);
    if (!settings.is_enabled || !settings.eta_sync_enabled) {
      console.log(`[ETA Queue] ETA sync is disabled in settings. Skipping sync for order: ${orderId}`);
      return {
        success: false,
        submissionId: '',
        uuid: '',
        status: 'pending',
        shareUrl: '',
        error: !settings.is_enabled
          ? 'منظومة الضرائب معطلة حالياً في الإعدادات'
          : 'مزامنة مصلحة الضرائب (ETA Sync) معطلة حالياً في الإعدادات',
      };
    }

    // 2. Fetch Order Data
    const orderRes = await query(
      `SELECT 
        o.id,
        o.order_code,
        o.subtotal::float AS subtotal,
        o.tax_amount::float AS tax_amount,
        o.total_amount::float AS total_amount,
        o.payment_method,
        o.service_id,
        s.name AS service_name,
        s.egs_code AS service_egs_code,
        o.customer_name,
        o.customer_phone,
        o.created_at
       FROM orders o
       LEFT JOIN services s ON o.service_id = s.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      throw new AppError('الفاتورة المحددة غير موجودة', 404);
    }

    const order: OrderForEta = orderRes.rows[0];

    try {
      // 3. Mark queue item as processing
      await query(
        `UPDATE eta_sync_queue 
         SET status = 'processing', last_attempt_at = NOW(), attempts = attempts + 1 
         WHERE order_id = $1`,
        [orderId]
      );

      // 4. Obtain Access Token
      const accessToken = await EtaAuthService.getAccessToken(settings);

      // 5. Build Receipt Document
      const receiptDoc = ReceiptBuilderService.buildReceipt(order, settings);

      // 6. Sign Receipt
      const signedReceipt = await EtaSignerService.signReceipt(receiptDoc, settings);

      // 7. Submit to ETA
      const result = await EtaSubmitterService.submitReceipt(
        orderId,
        signedReceipt,
        accessToken,
        settings
      );

      // 8. Update queue status
      if (result.success) {
        await query(
          `UPDATE eta_sync_queue 
           SET status = 'synced', error_log = NULL, updated_at = NOW() 
           WHERE order_id = $1`,
          [orderId]
        );
      } else {
        await query(
          `UPDATE eta_sync_queue 
           SET status = 'failed', error_log = $1, updated_at = NOW() 
           WHERE order_id = $2`,
          [result.error || 'Unknown submission error', orderId]
        );
      }

      return result;
    } catch (error: any) {
      console.error(`[ETA Queue Sync Error for order ${orderId}]:`, error.message);

      // Schedule next retry with exponential backoff (e.g. attempts * 5 minutes)
      await query(
        `UPDATE eta_sync_queue 
         SET status = 'failed', 
             error_log = $1, 
             next_retry_at = NOW() + (attempts * INTERVAL '5 minutes'), 
             updated_at = NOW() 
         WHERE order_id = $2`,
        [error.message.slice(0, 1000), orderId]
      );

      throw error;
    }
  }

  /**
   * Process all pending or failed items in sync queue
   */
  static async processPendingQueue(batchSize: number = 20) {
    const queueItemsRes = await query(
      `SELECT q.id, q.order_id, q.attempts 
       FROM eta_sync_queue q
       JOIN orders o ON q.order_id = o.id
       WHERE q.status IN ('pending', 'failed')
         AND q.attempts < 6
         AND (q.next_retry_at IS NULL OR q.next_retry_at <= NOW())
       ORDER BY q.created_at ASC
       LIMIT $1`,
      [batchSize]
    );

    const items = queueItemsRes.rows;
    console.log(`[ETA Queue Worker] Found ${items.length} pending receipts to process.`);

    const results: Array<{ orderId: string; success: boolean; error?: string }> = [];

    for (const item of items) {
      try {
        const res = await this.syncOrder(item.order_id);
        results.push({ orderId: item.order_id, success: res.success, error: res.error });
      } catch (err: any) {
        results.push({ orderId: item.order_id, success: false, error: err.message });
      }
    }

    return {
      processedCount: items.length,
      results,
    };
  }

  /**
   * List sync queue items with order details
   */
  static async getQueueItems(limit: number = 50) {
    const sql = `
      SELECT 
        q.id,
        q.order_id,
        q.status,
        q.attempts,
        q.last_attempt_at,
        q.next_retry_at,
        q.error_log,
        q.created_at,
        q.updated_at,
        o.order_code,
        o.customer_name,
        o.total_amount::float AS total_amount,
        o.eta_status,
        o.eta_uuid,
        s.name AS service_name
      FROM eta_sync_queue q
      LEFT JOIN orders o ON q.order_id = o.id
      LEFT JOIN services s ON o.service_id = s.id
      ORDER BY q.created_at DESC
      LIMIT $1
    `;

    const res = await query(sql, [limit]);
    return res.rows;
  }
}
