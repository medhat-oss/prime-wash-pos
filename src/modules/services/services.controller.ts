import { Request, Response, NextFunction } from 'express';
import { ServicesService } from './services.service.js';

export class ServicesController {
  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const status = req.query.status as 'active' | 'inactive' | undefined;
      const services = await ServicesService.getAll(status);
      res.json({
        success: true,
        count: services.length,
        data: services,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const service = await ServicesService.getById(id);
      res.json({
        success: true,
        data: service,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const newService = await ServicesService.create(req.body);
      res.status(201).json({
        success: true,
        message: 'تم إضافة الخدمة بنجاح',
        data: newService,
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const updated = await ServicesService.update(id, req.body);
      res.json({
        success: true,
        message: 'تم تحديث بيانات الخدمة بنجاح',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async setRecipes(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { recipes } = req.body;
      if (!Array.isArray(recipes)) {
        return res.status(400).json({
          success: false,
          error: 'يجب إرسال مصفوفة الوصفات recipes بشكل صحيح',
        });
      }
      const updated = await ServicesService.setRecipes(id, recipes);
      res.json({
        success: true,
        message: 'تم تحديث وصفات استهلاك الجرامات (BOM) للخدمة بنجاح',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const result = await ServicesService.delete(id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}
