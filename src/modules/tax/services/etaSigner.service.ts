import crypto from 'crypto';
import { TaxSettings } from '../tax.service.js';
import { EtaReceiptDocument } from './receiptBuilder.service.js';

export interface SignedEtaReceipt {
  receipt: EtaReceiptDocument;
  signatures: Array<{
    signatureType: string;
    value: string;
  }>;
}

export class EtaSignerService {
  /**
   * Serialize document to Egyptian Tax Authority Canonical JSON structure (C14N)
   */
  static serializeCanonicalJson(obj: any): string {
    if (obj === null || obj === undefined) {
      return '""';
    }
    if (typeof obj === 'string') {
      return JSON.stringify(obj);
    }
    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return JSON.stringify(obj.toString());
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => this.serializeCanonicalJson(item)).join('') + ']';
    }
    if (typeof obj === 'object') {
      const keys = Object.keys(obj).sort();
      let res = '';
      for (const k of keys) {
        if (obj[k] !== undefined) {
          res += `"${k}"${this.serializeCanonicalJson(obj[k])}`;
        }
      }
      return res;
    }
    return JSON.stringify(obj);
  }

  /**
   * Sign e-Receipt document using configured Remote Cloud Signer or local HSM Bridge
   */
  static async signReceipt(
    document: EtaReceiptDocument,
    settings: TaxSettings
  ): Promise<SignedEtaReceipt> {
    const signerUrl = settings.remote_signer_url?.trim();
    const signerToken = settings.remote_signer_token?.trim();

    // 1. If Remote Signer URL is configured, call the bridge
    if (signerUrl) {
      try {
        console.log(`[ETA Signer] Forwarding canonical receipt to Remote Signer at: ${signerUrl}`);
        const response = await fetch(signerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(signerToken ? { Authorization: `Bearer ${signerToken}` } : {}),
          },
          body: JSON.stringify({
            document,
            canonical: this.serializeCanonicalJson(document),
          }),
        });

        if (response.ok) {
          const signerResult = (await response.json()) as any;
          if (signerResult.signatures && Array.isArray(signerResult.signatures)) {
            return {
              receipt: signerResult.receipt || document,
              signatures: signerResult.signatures,
            };
          }
          if (signerResult.signatureValue) {
            return {
              receipt: document,
              signatures: [
                {
                  signatureType: 'I',
                  value: signerResult.signatureValue,
                },
              ],
            };
          }
        } else {
          console.warn(
            `[ETA Signer Warning] Remote Signer returned status ${response.status}. Falling back to simulation mode.`
          );
        }
      } catch (err: any) {
        console.warn(`[ETA Signer Error] Failed to reach Remote Signer at ${signerUrl}: ${err.message}`);
      }
    }

    // 2. Mock / Dev Fallback Signing (Generates CAdES-BES signature simulation)
    const canonicalString = this.serializeCanonicalJson(document);
    const hash = crypto.createHash('sha256').update(canonicalString).digest('hex');
    const mockSignature = Buffer.from(`MII_ETA_CADES_BES_SIGNATURE_${hash}_${Date.now()}`).toString(
      'base64'
    );

    return {
      receipt: document,
      signatures: [
        {
          signatureType: 'I', // 'I' stands for Issuer Digital Signature
          value: mockSignature,
        },
      ],
    };
  }
}
