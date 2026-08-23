import { Router } from 'express';
import { ExpensesController } from './expenses.controller.js';
import { requireFields } from '../../middleware/validate.js';
import { requireAdminAuth } from '../../middleware/adminAuth.js';

const router = Router();

// Admin Protected Expense & PnL routes
router.get('/', requireAdminAuth, ExpensesController.getAll);
router.get('/pnl-summary', requireAdminAuth, ExpensesController.getPnLSummary);
router.get('/:id', requireAdminAuth, ExpensesController.getById);

// Admin action routes
router.post('/', requireAdminAuth, requireFields(['title', 'amount']), ExpensesController.create);
router.delete('/:id', requireAdminAuth, ExpensesController.delete);

export default router;
