import { Request, Response, NextFunction } from 'express';
import { DashboardService } from './dashboard.service.js';

export class DashboardController {
  static async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await DashboardService.getSummaryStats();
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getMonthlyVatReport(req: Request, res: Response, next: NextFunction) {
    try {
      const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
      const month = req.query.month ? parseInt(req.query.month as string, 10) : undefined;
      const report = await DashboardService.getMonthlyVatReport(year, month);
      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getRawMaterialConsumptionReport(req: Request, res: Response, next: NextFunction) {
    try {
      const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
      const month = req.query.month ? parseInt(req.query.month as string, 10) : undefined;
      const report = await DashboardService.getRawMaterialConsumptionReport(year, month);
      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  static async factoryReset(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await DashboardService.factoryReset();
      res.json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async changeAdminPin(req: Request, res: Response, next: NextFunction) {
    try {
      const { currentPin, newPin } = req.body;
      const result = await DashboardService.changeAdminPin(currentPin, newPin);
      res.json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
