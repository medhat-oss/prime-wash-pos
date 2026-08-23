import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  public statusCode: number;
  public details?: any;

  constructor(message: string, statusCode: number = 400, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);

  const isDev = process.env.NODE_ENV !== 'production';

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      details: err.details || null,
    });
  }

  // Handle common PostgreSQL errors
  if (err.code === '23505') {
    // Unique violation
    return res.status(409).json({
      success: false,
      error: 'تعارض في البيانات: السجل أو الكود المدخل موجود مسبقاً.',
      ...(isDev && err.detail ? { detail: err.detail } : {}),
    });
  }

  if (err.code === '23503') {
    // Foreign key violation
    return res.status(400).json({
      success: false,
      error: 'خطأ في الربط: العنصر المرتبط غير موجود أو لا يمكن حذفه لوجود سجلات تابعة.',
      ...(isDev && err.detail ? { detail: err.detail } : {}),
    });
  }

  if (err.code === '23514') {
    // Check constraint violation
    return res.status(400).json({
      success: false,
      error: 'البيانات المدخلة تخالف شروط الصحة.',
      ...(isDev && err.detail ? { detail: err.detail } : {}),
    });
  }

  return res.status(500).json({
    success: false,
    error: 'حدث خطأ داخلي في الخادم (Internal Server Error)',
    ...(isDev ? { message: err.message || 'Unknown error occurred' } : {}),
  });
};

