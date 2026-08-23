import { Router } from 'express';
import { TaxController } from './tax.controller.js';
import { requireAdminAuth } from '../../middleware/adminAuth.js';
import { requireFields } from '../../middleware/validate.js';

const router = Router();

// Tax & ETA Settings Routes (Admin Only)
router.get('/settings', requireAdminAuth, TaxController.getSettings);
router.put('/settings', requireAdminAuth, TaxController.updateSettings);
router.post('/test-connection', requireAdminAuth, TaxController.testConnection);

// Services EGS Tax Codes Routes (Admin Only)
router.get('/services', requireAdminAuth, TaxController.getServicesTaxCodes);
router.patch('/services/:id/code', requireAdminAuth, TaxController.updateServiceTaxCode);
router.post(
  '/services/batch-codes',
  requireAdminAuth,
  requireFields(['items']),
  TaxController.batchUpdateServiceTaxCodes
);

// Orders ETA Synchronization & Queue Routes
router.post('/orders/:id/sync', requireAdminAuth, TaxController.syncOrder);
router.post('/queue/process', requireAdminAuth, TaxController.processQueue);
router.get('/queue', requireAdminAuth, TaxController.getQueue);

// Integration & Queue Statistics (Admin Only)
router.get('/stats', requireAdminAuth, TaxController.getTaxStats);

export default router;

