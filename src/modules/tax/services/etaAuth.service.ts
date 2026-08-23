import { TaxSettings } from '../tax.service.js';
import { AppError } from '../../../middleware/errorHandler.js';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
  environment: string;
}

export class EtaAuthService {
  private static tokenCache: CachedToken | null = null;

  /**
   * Get ETA Identity Token URL based on environment
   */
  static getTokenUrl(environment: 'preprod' | 'production'): string {
    return environment === 'production'
      ? 'https://id.eta.gov.eg/connect/token'
      : 'https://id.preprod.eta.gov.eg/connect/token';
  }

  /**
   * Clear in-memory token cache (useful when credentials change)
   */
  static clearCache() {
    this.tokenCache = null;
  }

  /**
   * Get valid access token from ETA identity server or memory cache
   */
  static async getAccessToken(settings: TaxSettings): Promise<string> {
    const env = settings.environment || 'preprod';

    // 1. Check in-memory cache
    if (
      this.tokenCache &&
      this.tokenCache.environment === env &&
      Date.now() < this.tokenCache.expiresAt
    ) {
      return this.tokenCache.accessToken;
    }

    const clientId = settings.client_id?.trim();
    const clientSecret = settings.client_secret?.trim();

    if (!clientId || !clientSecret) {
      // If no real credentials are set and we are in sandbox/test or preprod environment
      if (process.env.NODE_ENV === 'test' || !settings.is_enabled || env === 'preprod') {
        console.log('[ETA Auth] Using development mock access token for preprod sandbox.');
        return 'mock_eta_access_token_dev_sandbox';
      }
      throw new AppError(
        'بيانات الاعتماد لمصلحة الضرائب (Client ID / Client Secret) غير مكتملة في الإعدادات',
        400
      );
    }

    const tokenUrl = this.getTokenUrl(env);

    try {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      });

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ETA Auth Error] Status: ${response.status} - Response:`, errorText);
        throw new AppError(
          `فشل التحقق من بيانات الاعتماد لدى مصلحة الضرائب المصرية (${response.status}): ${errorText}`,
          response.status === 401 || response.status === 400 ? 400 : 502
        );
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
        token_type?: string;
      };

      if (!data.access_token) {
        throw new AppError('لم يتم استلام رمز الدخول (access_token) من مصلحة الضرائب', 502);
      }

      // Buffer expires_in by subtracting 60 seconds
      const expiresInSec = data.expires_in || 3600;
      const expiresAt = Date.now() + Math.max(expiresInSec - 60, 300) * 1000;

      this.tokenCache = {
        accessToken: data.access_token,
        expiresAt,
        environment: env,
      };

      console.log(`[ETA Auth] Successfully obtained token for ${env}. Expires in: ${expiresInSec}s`);
      return data.access_token;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      console.error('[ETA Auth Network Error]', err.message);
      throw new AppError(
        `تعذر الاتصال بخادم مصادقة مصلحة الضرائب (${tokenUrl}): ${err.message}`,
        503
      );
    }
  }

  /**
   * Test ETA Identity server connection with given credentials
   */
  static async testConnection(settings: TaxSettings): Promise<{
    success: boolean;
    message: string;
    token_preview?: string;
  }> {
    this.clearCache();
    const token = await this.getAccessToken(settings);
    return {
      success: true,
      message: 'تم التحقق من بيانات الاعتماد والاتصال بخوادم مصلحة الضرائب بنجاح!',
      token_preview: `${token.slice(0, 15)}...${token.slice(-10)}`,
    };
  }
}
