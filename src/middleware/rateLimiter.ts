import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * General API Rate Limiter
 * Limits standard API traffic to 120 requests per minute per IP.
 */
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'تم تجاوز الحد الأقصى للطلبات (120 طلب في الدقيقة). يرجى الانتظار قليلاً.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'تم تجاوز الحد الأقصى للطلبات (120 طلب في الدقيقة). يرجى الانتظار قليلاً.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  },
});

/**
 * Strict Auth & PIN Brute-Force Rate Limiter
 * Restricts sensitive operations (PIN clock-in, change PIN) to 5 attempts per 15 minutes per IP.
 */
export const authPinRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only failed attempts consume quota
  message: {
    success: false,
    error: 'تم تجاوز الحد الأقصى للمحاولات الخاطئة (5 محاولات). يرجى الانتظار 15 دقيقة قبل المحاولة مجدداً.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'تم تجاوز الحد الأقصى للمحاولات الخاطئة (5 محاولات). يرجى الانتظار 15 دقيقة قبل المحاولة مجدداً.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
    });
  },
});
