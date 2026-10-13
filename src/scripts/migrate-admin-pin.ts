import dotenv from 'dotenv';
dotenv.config();

import { query, pool } from '../config/db.js';

async function migrateAdminPin() {
  console.log('🔑 Force-setting Admin PIN to 159357 in Neon DB...');
  try {
    const s = await query(`
      UPDATE system_settings 
      SET admin_pin = '159357', updated_at = NOW()
      RETURNING id, admin_pin, updated_at
    `);
    console.log('✅ system_settings updated:', s.rows);

    const e = await query(`
      UPDATE employees 
      SET pin_code = '159357', updated_at = NOW() 
      WHERE system_role = 'owner' OR role ILIKE '%مالك%' OR name = 'مستر فتحي'
      RETURNING id, name, role, system_role, pin_code, updated_at
    `);
    console.log('✅ employees updated:', e.rows);

    console.log('🎉 Successfully force-set Admin PIN to 159357 across Neon DB!');
  } catch (error) {
    console.error('❌ Update failed:', error);
  } finally {
    await pool.end();
  }
}

migrateAdminPin();
