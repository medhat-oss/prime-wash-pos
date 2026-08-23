import { Router } from 'express';
import { DashboardController } from './dashboard.controller.js';
import { requireAdminAuth } from '../../middleware/adminAuth.js';

const router = Router();

// Dashboard Summary Stats (Admin Protected)
router.get('/stats', requireAdminAuth, DashboardController.getStats);

// Monthly VAT 14% Declaration Summary Report (Admin Protected)
router.get('/reports/vat-summary', requireAdminAuth, DashboardController.getMonthlyVatReport);

// Raw Material Consumption Logs Report (Admin Protected)
router.get('/reports/material-consumption', requireAdminAuth, DashboardController.getRawMaterialConsumptionReport);

// Factory Reset / Transaction Data Wipe (Admin Protected)
router.post('/factory-reset', requireAdminAuth, DashboardController.factoryReset);

// Change Admin PIN (Admin Protected)
router.post('/change-pin', requireAdminAuth, DashboardController.changeAdminPin);

export default router;
