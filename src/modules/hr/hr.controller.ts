import { Request, Response, NextFunction } from 'express';
import { HrService } from './hr.service.js';

export class HrController {
  // Employees
  static async getEmployees(req: Request, res: Response, next: NextFunction) {
    try {
      const status = req.query.status as string;
      const employees = await HrService.getEmployees(status);
      res.json({
        success: true,
        count: employees.length,
        data: employees,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getEmployeeById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const employee = await HrService.getEmployeeById(id);
      res.json({
        success: true,
        data: employee,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createEmployee(req: Request, res: Response, next: NextFunction) {
    try {
      const employee = await HrService.createEmployee(req.body);
      res.status(201).json({
        success: true,
        message: 'تم إضافة الموظف بنجاح',
        data: employee,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateEmployee(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const updated = await HrService.updateEmployee(id, req.body);
      res.json({
        success: true,
        message: 'تم تحديث بيانات الموظف بنجاح',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteEmployee(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const deleted = await HrService.deleteEmployee(id);
      res.json({
        success: true,
        message: 'تم حذف الموظف وكافة سجلاته بنجاح',
        data: deleted,
      });
    } catch (error) {
      next(error);
    }
  }

  // Attendance & Quick PIN Clock In/Out
  static async clockWithPin(req: Request, res: Response, next: NextFunction) {
    try {
      const { employee_id, pin_code, action, notes } = req.body;
      const result = await HrService.clockWithPin({
        employee_id,
        pin_code,
        action,
        notes,
      });
      res.json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getTodayStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const statusMap = await HrService.getTodayAttendanceStatus();
      res.json({
        success: true,
        data: statusMap,
      });
    } catch (error) {
      next(error);
    }
  }

  static async recordAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await HrService.recordAttendance(req.body);
      res.status(201).json({
        success: true,
        message: 'تم تسجيل حركة الدوام وحساب الساعات بنجاح',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getAttendanceList(req: Request, res: Response, next: NextFunction) {
    try {
      const { employee_id, startDate, endDate } = req.query;
      const records = await HrService.getAttendanceList({
        employee_id: employee_id as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      res.json({
        success: true,
        count: records.length,
        data: records,
      });
    } catch (error) {
      next(error);
    }
  }

  // Transactions
  static async createTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await HrService.createTransaction(req.body);
      res.status(201).json({
        success: true,
        message: 'تم تسجيل الحركة المالية للموظف بنجاح',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const { employee_id, type, status, startDate, endDate } = req.query;
      const transactions = await HrService.getTransactions({
        employee_id: employee_id as string,
        type: type as string,
        status: status as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      res.json({
        success: true,
        count: transactions.length,
        data: transactions,
      });
    } catch (error) {
      next(error);
    }
  }

  // Payroll
  static async calculatePayroll(req: Request, res: Response, next: NextFunction) {
    try {
      const employeeId = req.params.employeeId as string;
      const { startDate, endDate } = req.query;
      const calculation = await HrService.calculatePayroll(
        employeeId,
        startDate as string,
        endDate as string
      );
      res.json({
        success: true,
        data: calculation,
      });
    } catch (error) {
      next(error);
    }
  }

  static async payoutSalary(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await HrService.payoutSalary(req.body);
      res.status(201).json({
        success: true,
        message: 'تم صرف وتصفية الراتب وتسوية الحركات المالية بنجاح',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPayouts(req: Request, res: Response, next: NextFunction) {
    try {
      const { employee_id, startDate, endDate } = req.query;
      const payouts = await HrService.getPayouts({
        employee_id: employee_id as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      res.json({
        success: true,
        count: payouts.length,
        data: payouts,
      });
    } catch (error) {
      next(error);
    }
  }
}
