import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import { query } from '../config/db.js';
import { safeTimingEqual } from '../utils/crypto.js';
import { adminPinRateLimiter } from '../utils/rateLimiter.js';

let cachedDbAdminPin: string | null = null;
let cachedPinTimestamp: number = 0;
const PIN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

export async function getActiveAdminPin(): Promise<string> {
  const now = Date.now();
  if (cachedDbAdminPin && (now - cachedPinTimestamp < PIN_CACHE_TTL_MS)) {
    return cachedDbAdminPin;
  }
  try {
    const res = await query('SELECT admin_pin FROM system_settings LIMIT 1');
    if (res.rows[0]?.admin_pin) {
      cachedDbAdminPin = String(res.rows[0].admin_pin).trim();
      cachedPinTimestamp = now;
      return cachedDbAdminPin;
    }
  } catch {
    // fallback if table is not yet migrated
  }
  return (process.env.ADMIN_PIN || '').trim();
}

export function updateCachedAdminPin(newPin: string) {
  cachedDbAdminPin = newPin.trim();
  cachedPinTimestamp = Date.now();
}

export const requireAdminAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    if (adminPinRateLimiter.isRateLimited(ip)) {
      return next(
        new AppError(
          'تم تجاوز الحد الأقصى للمحاولات الخاطئة. يرجى الانتظار دقيقة قبل المحاولة مجدداً.',
          429,
          { code: 'RATE_LIMIT_EXCEEDED' }
        )
      );
    }

    const adminPinHeader = req.headers['x-admin-pin'] as string | undefined;
    const configuredAdminPin = await getActiveAdminPin();

    if (!adminPinHeader) {
      return next(
        new AppError(
          'غير مصرح بالوصول: يتطلب هذا الإجراء صلاحيات لوحة الإدارة ورمز PIN الصحيح',
          403,
          { code: 'ADMIN_AUTH_REQUIRED' }
        )
      );
    }

    let isAuthorized = safeTimingEqual(adminPinHeader, configuredAdminPin);

    if (!isAuthorized) {
      try {
        const ownerRes = await query(
          `SELECT pin_code FROM employees 
           WHERE (system_role = 'owner' OR role ILIKE '%مالك%' OR name = 'مستر فتحي') 
             AND status = 'active'`
        );
        isAuthorized = ownerRes.rows.some((o: any) =>
          safeTimingEqual(adminPinHeader, String(o.pin_code || '').trim())
        );
      } catch {}
    }

    if (!isAuthorized) {
      adminPinRateLimiter.recordFailure(ip);
      return next(
        new AppError(
          'غير مصرح بالوصول: رمز PIN غير صحيح',
          403,
          { code: 'INVALID_ADMIN_PIN' }
        )
      );
    }

    adminPinRateLimiter.reset(ip);
    next();
  } catch (error) {
    next(error);
  }
};
