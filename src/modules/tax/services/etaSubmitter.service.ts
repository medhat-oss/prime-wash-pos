import crypto from 'crypto';
import { query } from '../../../config/db.js';
import { TaxSettings } from '../tax.service.js';
import { SignedEtaReceipt } from './etaSigner.service.js';
import { AppError } from '../../../middleware/errorHandler.js';

export interface SubmissionResult {
  success: boolean;
  submissionId: string;
  uuid: string;
  status: 'valid' | 'pending' | 'invalid' | 'failed';
  shareUrl: string;
  rawResponse?: any;
  error?: string;
}

export class EtaSubmitterService {
  /**
   * Get submission endpoint URL based on environment
   */
  static getSubmissionUrl(environment: 'preprod' | 'production'): string {
    return environment === 'production'
      ? 'https://api.invoicing.eta.gov.eg/api/v1/receiptsubmissions'
      : 'https://api.preprod.invoicing.eta.gov.eg/api/v1/receiptsubmissions';
  }

  /**
   * Get public receipt portal viewer URL
   */
  static getReceiptShareBaseUrl(environment: 'preprod' | 'production'): string {
    return environment === 'production'
      ? 'https://invoicing.eta.gov.eg/receipts/search'
      : 'https://preprod.invoicing.eta.gov.eg/receipts/search';
  }

  private static sanitizeErrorMessage(err: any): string {
    if (!err) return 'خطأ غير معروف في مزامنة الضرائب';
    if (typeof err === 'string') {
      return err.replace(/<[^>]*>?/gm, '').trim().slice(0, 500);
    }
    try {
      return JSON.stringify(err).slice(0, 500);
    } catch {
      return String(err).slice(0, 500);
    }
  }

  /**
   * Submit signed receipt to Egyptian Tax Authority
   */
  static async submitReceipt(
    orderId: string,
    signedReceipt: SignedEtaReceipt,
    accessToken: string,
    settings: TaxSettings
  ): Promise<SubmissionResult> {
    const env = settings.environment || 'preprod';
    const submissionUrl = this.getSubmissionUrl(env);
    const shareBaseUrl = this.getReceiptShareBaseUrl(env);

    // Merge signatures into document payload
    const receiptPayload = {
      ...signedReceipt.receipt,
      signatures: signedReceipt.signatures,
    };

    // If using mock dev token or sandbox test mode without live ETA endpoints
    if (accessToken.includes('mock_') || !settings.client_id) {
      const mockUuid = `ETA-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      const mockSubmissionId = `SUB-${Date.now()}`;
      const mockShareUrl = `${shareBaseUrl}/${mockUuid}/share/${mockUuid}`;

      await query(
        `UPDATE orders 
         SET eta_uuid = $1, 
             eta_submission_id = $2, 
             eta_status = $3, 
             eta_share_url = $4, 
             eta_synced_at = NOW(), 
             eta_error_message = NULL 
         WHERE id = $5`,
        [mockUuid, mockSubmissionId, 'valid', mockShareUrl, orderId]
      );

      return {
        success: true,
        submissionId: mockSubmissionId,
        uuid: mockUuid,
        status: 'valid',
        shareUrl: mockShareUrl,
      };
    }

    try {
      console.log(`[ETA Submitter] Submitting receipt for order ${orderId} to: ${submissionUrl}`);

      const response = await fetch(submissionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          receipts: [receiptPayload],
        }),
      });

      const responseData = (await response.json()) as any;

      if (!response.ok) {
        const errorMsg = this.sanitizeErrorMessage(responseData);
        console.error(`[ETA Submitter Error] HTTP ${response.status}:`, errorMsg);

        await query(
          `UPDATE orders 
           SET eta_status = 'failed', 
               eta_error_message = $1 
           WHERE id = $2`,
          [errorMsg, orderId]
        );

        throw new AppError(`فشل إرسال الإيصال لمصلحة الضرائب: ${errorMsg}`, 502);
      }

      // Process ETA response
      const submissionId = responseData.submissionId || `SUB-${Date.now()}`;
      let uuid = '';
      let status: 'valid' | 'pending' | 'invalid' | 'failed' = 'valid';
      let errorMsg: string | undefined;

      if (responseData.submittedReceipts && responseData.submittedReceipts.length > 0) {
        const submitted = responseData.submittedReceipts[0];
        uuid = submitted.uuid || submitted.receiptNumber || `ETA-${Date.now()}`;
        status = submitted.status?.toLowerCase() === 'invalid' ? 'invalid' : 'valid';
      } else if (responseData.rejectedReceipts && responseData.rejectedReceipts.length > 0) {
        const rejected = responseData.rejectedReceipts[0];
        status = 'invalid';
        errorMsg = this.sanitizeErrorMessage(rejected.errors || rejected);
      } else {
        uuid = `ETA-${Date.now()}`;
      }

      const shareUrl = `${shareBaseUrl}/${uuid}/share/${uuid}`;

      // Update database order record
      await query(
        `UPDATE orders 
         SET eta_uuid = $1, 
             eta_submission_id = $2, 
             eta_status = $3, 
             eta_share_url = $4, 
             eta_synced_at = NOW(), 
             eta_error_message = $5 
         WHERE id = $6`,
        [uuid, submissionId, status, shareUrl, errorMsg || null, orderId]
      );

      return {
        success: status === 'valid',
        submissionId,
        uuid,
        status,
        shareUrl,
        rawResponse: responseData,
        error: errorMsg,
      };
    } catch (err: any) {
      console.error('[ETA Submitter Exception]', err.message);
      const sanitizedErr = this.sanitizeErrorMessage(err.message);

      await query(
        `UPDATE orders 
         SET eta_status = 'failed', 
             eta_error_message = $1 
         WHERE id = $2`,
        [sanitizedErr, orderId]
      );

      if (err instanceof AppError) throw err;
      throw new AppError(`حدث خطأ أثناء التواصل مع خوادم إرسال الضرائب: ${sanitizedErr}`, 500);
    }
  }
}
