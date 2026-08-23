import { Request, Response, NextFunction } from 'express';
import { ExpensesService } from './expenses.service.js';

export class ExpensesController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const expense = await ExpensesService.createExpense(req.body);
      res.status(201).json({
        success: true,
        message: 'تم تسجيل المصروف بنجاح',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { year, month, category, startDate, endDate, limit, offset } = req.query;
      const expenses = await ExpensesService.getExpenses({
        year: year ? Number(year) : undefined,
        month: month ? Number(month) : undefined,
        category: category as string,
        startDate: startDate as string,
        endDate: endDate as string,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });

      res.json({
        success: true,
        count: expenses.length,
        data: expenses,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const expense = await ExpensesService.getExpenseById(id);
      res.json({
        success: true,
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const deleted = await ExpensesService.deleteExpense(id);
      res.json({
        success: true,
        message: 'تم حذف بند المصروف بنجاح',
        data: deleted,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPnLSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { year, month } = req.query;
      const summary = await ExpensesService.getPnLSummary(
        year ? Number(year) : undefined,
        month ? Number(month) : undefined
      );

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }
}
