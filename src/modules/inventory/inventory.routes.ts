import { Router } from 'express';
import { InventoryController } from './inventory.controller.js';
import { requireFields } from '../../middleware/validate.js';
import { requireAdminAuth } from '../../middleware/adminAuth.js';

const router = Router();

// Public / POS view for available materials in recipes
router.get('/', InventoryController.getAll);
router.get('/:id', InventoryController.getById);

// Admin-only mutation routes
router.post('/', requireAdminAuth, requireFields(['name']), InventoryController.create);
router.put('/:id', requireAdminAuth, InventoryController.update);
router.delete('/:id', requireAdminAuth, InventoryController.delete);
router.post(
  '/:id/restock',
  requireAdminAuth,
  requireFields(['grams']),
  InventoryController.restock
);

export default router;
