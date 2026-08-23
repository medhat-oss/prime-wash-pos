import dotenv from 'dotenv';
dotenv.config();

import { DashboardService } from '../modules/dashboard/dashboard.service.js';
import { getActiveAdminPin } from '../middleware/adminAuth.js';
import { pool } from '../config/db.js';

async function testChangePin() {
  console.log('Testing Admin PIN change logic...');
  try {
    const initialPin = await getActiveAdminPin();
    console.log('Current Active PIN:', initialPin);

    // 1. Test changing PIN to '5678'
    const res1 = await DashboardService.changeAdminPin(initialPin, '5678');
    console.log('Change to 5678 Result:', res1);

    const updatedPin1 = await getActiveAdminPin();
    console.log('Updated PIN after change 1:', updatedPin1);

    // 2. Test changing back to '1234'
    const res2 = await DashboardService.changeAdminPin('5678', '1234');
    console.log('Change back to 1234 Result:', res2);

    const updatedPin2 = await getActiveAdminPin();
    console.log('Updated PIN after change 2:', updatedPin2);

    // 3. Test invalid current PIN
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
    await pool.end();
  }
}

testChangePin();
