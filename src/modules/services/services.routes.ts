import { Router } from 'express';
import { ServicesController } from './services.controller.js';
import { requireFields } from '../../middleware/validate.js';
import { requireAdminAuth } from '../../middleware/adminAuth.js';

const router = Router();

// Public Read for POS Cashier Screen
router.get('/', ServicesController.getAll);
router.get('/:id', ServicesController.getById);

// Admin-only Mutation Routes
router.post(
  '/',
  requireAdminAuth,
  requireFields(['name', 'price']),
  ServicesController.create
);
router.put('/:id', requireAdminAuth, ServicesController.update);
router.put(
  '/:id/recipes',
  requireAdminAuth,
  requireFields(['recipes']),
  ServicesController.setRecipes
);
router.delete('/:id', requireAdminAuth, ServicesController.delete);

export default router;
