import { Router } from 'express';
import { SettingsController } from './settings.controller.js';
import { requireAdminAuth } from '../../middleware/adminAuth.js';

const router = Router();

// GET /api/settings/pos - Publicly accessible for POS client layout
router.get('/pos', SettingsController.getPosSettings);

// PUT /api/settings/pos - Admin protected
router.put('/pos', requireAdminAuth, SettingsController.updatePosSettings);

export default router;
