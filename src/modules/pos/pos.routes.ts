import { Router } from 'express';
import { PosController } from './pos.controller.js';
import { requireFields } from '../../middleware/validate.js';
import { requireAdminAuth } from '../../middleware/adminAuth.js';

const router = Router();

router.post('/orders', requireFields(['service_id']), PosController.createOrder);
router.get('/orders', PosController.getAll);
router.get('/orders/:id', PosController.getById);
router.patch('/orders/:id/status', requireFields(['status']), PosController.updateStatus);
router.post('/orders/:id/cancel', requireAdminAuth, PosController.cancelOrder);

// Shift routes (Multi-Device Active Shift & Archive)
router.get('/shifts/active', PosController.getActiveShift);
router.get('/shifts/current', PosController.getActiveShift);
router.post('/shifts/start', requireFields(['cashier_id', 'cashier_name']), PosController.startActiveShift);
router.post('/shifts/close', PosController.closeActiveShift);
router.get('/shifts/history', PosController.getClosedShifts);
router.delete('/shifts/:id', requireAdminAuth, PosController.deleteClosedShift);

export default router;
