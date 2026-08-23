import { Request, Response, NextFunction } from 'express';
import { PosService } from './pos.service.js';

export class PosController {
  static async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await PosService.createOrder(req.body);
      res.status(201).json({
        success: true,
        message: 'تم إصدار الفاتورة وخصم كميات الجرامات من المخزون بنجاح',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, date, employee_id, limit, offset } = req.query;
      const orders = await PosService.getOrders({
        status: status as string,
        date: date as string,
        employee_id: employee_id as string,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });

      res.json({
        success: true,
        count: orders.length,
        data: orders,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const order = await PosService.getOrderById(id);
      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { status } = req.body;
      const order = await PosService.updateOrderStatus(id, status);
      res.json({
        success: true,
        message: 'تم تحديث حالة الفاتورة بنجاح',
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  static async cancelOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { reason } = req.body;
      const result = await PosService.cancelOrder(id, reason);
      res.json({
        success: true,
        message: 'تم إلغاء الفاتورة واسترجاع أرصدة المواد الخام إلى المخزن بنجاح',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
