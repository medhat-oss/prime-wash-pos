import { Request, Response, NextFunction } from 'express';
import { TaxService } from './tax.service.js';
import { EtaAuthService } from './services/etaAuth.service.js';
import { EtaQueueService } from './services/etaQueue.service.js';

export class TaxController {
  static async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await TaxService.getSettings();
      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await TaxService.updateSettings(req.body);
      // Clear token cache whenever credentials or environment change
      EtaAuthService.clearCache();
      res.json({
        success: true,
        message: 'تم حفظ وتحديث إعدادات مصلحة الضرائب المصرية بنجاح',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async testConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await TaxService.getSettings(false);
      const testResult = await EtaAuthService.testConnection(settings);
      res.json({
        success: true,
        message: testResult.message,
        data: testResult,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getServicesTaxCodes(req: Request, res: Response, next: NextFunction) {
    try {
      const services = await TaxService.getServicesTaxCodes();
      res.json({
        success: true,
        data: services,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateServiceTaxCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { egs_code } = req.body;
      const updated = await TaxService.updateServiceTaxCode(id, egs_code);
      res.json({
        success: true,
        message: 'تم تحديث الكود الضريبي للخدمة بنجاح',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async batchUpdateServiceTaxCodes(req: Request, res: Response, next: NextFunction) {
    try {
      const { items } = req.body;
      const result = await TaxService.batchUpdateServiceTaxCodes(items);
      res.json({
        success: true,
        message: `تم تحديث أكواد الضرائب لـ ${result.count} خدمة بنجاح`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async syncOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await EtaQueueService.syncOrder(id);
      res.json({
        success: result.success,
        message: result.success
          ? 'تم توثيق وإرسال الإيصال لمصلحة الضرائب بنجاح'
          : `تمت محاولة الإرسال: ${result.error || 'قيد المعالجة'}`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async processQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const batchSize = req.query.limit ? Number(req.query.limit) : 20;
      const result = await EtaQueueService.processPendingQueue(batchSize);
      res.json({
        success: true,
        message: `تمت معالجة ${result.processedCount} إيصال من طابور المزامنة`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const queue = await EtaQueueService.getQueueItems(limit);
      res.json({
        success: true,
        count: queue.length,
        data: queue,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getTaxStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await TaxService.getTaxStats();
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
}
