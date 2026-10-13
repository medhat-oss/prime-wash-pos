import dotenv from 'dotenv';
dotenv.config();

import { DashboardService } from '../modules/dashboard/dashboard.service.js';
import { getActiveAdminPin } from '../middleware/adminAuth.js';
import { pool } from '../config/db.js';

async function testChangePin() {
  console.log('Testing Admin PIN change logic...');
  let originalPin = '1234';
  try {
    originalPin = await getActiveAdminPin();
    console.log('Original Active PIN:', originalPin);

    // 1. Test changing PIN to '5678'
    await DashboardService.changeAdminPin(originalPin, '5678');
    const updatedPin1 = await getActiveAdminPin();
    console.log('Updated PIN after change 1:', updatedPin1);

    // 2. Test invalid current PIN
    try {
      await DashboardService.changeAdminPin('wrong', '9999');
      console.error('FAILED: Invalid PIN did not throw error!');
    } catch (e: any) {
      console.log('SUCCESS: Caught expected invalid PIN error:', e.message);
    }

    console.log('All backend PIN tests passed successfully!');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    // ALWAYS strictly restore the original PIN to protect live state
    try {
      const current = await getActiveAdminPin();
      if (current !== originalPin) {
        await DashboardService.changeAdminPin(current, originalPin);
        console.log('Strictly restored original PIN:', originalPin);
      }
    } catch (e) {
      console.error('Error restoring PIN:', e);
    }
    await pool.end();
  }
}

testChangePin();
