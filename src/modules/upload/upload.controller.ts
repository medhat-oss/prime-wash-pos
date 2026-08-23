import { Request, Response, NextFunction } from 'express';
import { UploadService } from './upload.service.js';
import { AppError } from '../../middleware/errorHandler.js';

export class UploadController {
  static async uploadMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new AppError('يرجى اختيار ملف صالح للرفع (صورة أو فيديو)', 400);
      }

      const result = await UploadService.uploadMedia(req.file);

      res.status(201).json({
        success: true,
        message: 'تم رفع وتجهيز ملف الوسائط بنجاح',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
