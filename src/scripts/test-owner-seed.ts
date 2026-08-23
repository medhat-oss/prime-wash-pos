import dotenv from 'dotenv';
dotenv.config();

import { pool, query } from '../config/db.js';

async function check() {
  console.log('Verifying employees in database...');
  try {
    const res = await query('SELECT name, role, hourly_rate, pin_code, status FROM employees ORDER BY created_at ASC');
    console.table(res.rows);
    const owner = res.rows.find((r: any) => r.name === 'مستر فتحي');
    if (owner && Number(owner.hourly_rate) === 0) {
      console.log('✅ Owner "مستر فتحي" successfully verified with 0.00 hourly rate and PIN', owner.pin_code);
    } else {
      console.error('❌ Owner record mismatch');
    }
  } catch (err) {
    console.error('Check error:', err);
  } finally {
    await pool.end();
  }
}

check();
