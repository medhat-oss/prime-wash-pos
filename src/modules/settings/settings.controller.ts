import { Request, Response, NextFunction } from 'express';
import { SettingsService } from './settings.service.js';

export class SettingsController {
  static async getPosSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await SettingsService.getPosSettings();
      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updatePosSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await SettingsService.updatePosSettings(req.body);
      res.json({
        success: true,
        message: 'تم حفظ إعدادات مظهر شاشة الكاشير بنجاح',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
}
