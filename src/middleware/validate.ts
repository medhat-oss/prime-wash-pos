import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

export const requireFields = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing: string[] = [];
    for (const field of fields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return next(
        new AppError(
          `الحقول التالية مطلوبة لإتمام العملية: ${missing.join(', ')}`,
          400,
          { missingFields: missing }
        )
      );
    }

    next();
  };
};
