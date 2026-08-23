import { Router } from 'express';
import { HrController } from './hr.controller.js';
import { requireFields } from '../../middleware/validate.js';
import { requireAdminAuth } from '../../middleware/adminAuth.js';
import { authPinRateLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

// Employees (Public read for POS assignment; Admin-protected for create/update)
router.get('/employees', HrController.getEmployees);
router.get('/employees/:id', HrController.getEmployeeById);
router.post('/employees', requireAdminAuth, requireFields(['name']), HrController.createEmployee);
router.put('/employees/:id', requireAdminAuth, HrController.updateEmployee);
router.delete('/employees/:id', requireAdminAuth, HrController.deleteEmployee);

// Quick PIN Attendance Clock In / Out (Public for workers on POS, rate-limited against brute force)
router.get('/attendance/today-status', HrController.getTodayStatus);
router.post(
  '/attendance/clock',
  authPinRateLimiter,
  requireFields(['employee_id', 'pin_code', 'action']),
  HrController.clockWithPin
);
router.put(
  '/attendance/clock',
  authPinRateLimiter,
  requireFields(['employee_id', 'pin_code', 'action']),
  HrController.clockWithPin
);

// Attendance Detailed
router.post(
  '/attendance',
  requireAdminAuth,
  requireFields(['employee_id', 'check_in']),
  HrController.recordAttendance
);
router.put(
  '/attendance',
  requireAdminAuth,
  requireFields(['employee_id', 'check_in']),
  HrController.recordAttendance
);
router.get('/attendance', requireAdminAuth, HrController.getAttendanceList);


// Transactions (Advance, Bonus, Deduction - Admin only)
router.post(
  '/transactions',
  requireAdminAuth,
  requireFields(['employee_id', 'type', 'amount']),
  HrController.createTransaction
);
router.get('/transactions', requireAdminAuth, HrController.getTransactions);

// Payroll calculation & payout (Admin only)
router.get('/payroll/calculate/:employeeId', requireAdminAuth, HrController.calculatePayroll);
router.post(
  '/payroll/payout',
  requireAdminAuth,
  requireFields(['employee_id', 'period_start', 'period_end']),
  HrController.payoutSalary
);
router.get('/payroll/payouts', requireAdminAuth, HrController.getPayouts);

export default router;
