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

export default router;
