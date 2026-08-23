import { Request, Response, NextFunction } from 'express';
import { InventoryService } from './inventory.service.js';

export class InventoryController {
  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const lowStockOnly = req.query.lowStock === 'true';
      const items = await InventoryService.getAll(lowStockOnly);
      res.json({
        success: true,
        count: items.length,
        data: items,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const item = await InventoryService.getById(id);
      res.json({
        success: true,
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const newItem = await InventoryService.create(req.body);
      res.status(201).json({
        success: true,
        message: 'تم إضافة المادة الخام بنجاح',
        data: newItem,
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const updated = await InventoryService.update(id, req.body);
      res.json({
        success: true,
        message: 'تم تعديل بيانات المادة بنجاح',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const result = await InventoryService.delete(id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  static async restock(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { grams, costPerGram } = req.body;
      const result = await InventoryService.restock(
        id,
        Number(grams),
        costPerGram !== undefined ? Number(costPerGram) : undefined
      );
      res.json({
        success: true,
        message: 'تم توريد وزيادة رصيد المادة بالجرامات بنجاح',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
