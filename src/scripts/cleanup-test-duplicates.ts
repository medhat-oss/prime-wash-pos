import dotenv from 'dotenv';
dotenv.config();

import { pool, query } from '../config/db.js';

async function cleanupDuplicates() {
  console.log('🧹 Executing database cleanup for test duplicates...');

  try {
    // 1. Delete orphan test employees (role = 'فني تلميع ساطع' with PIN 5555)
    // that were created by previous test runs and have no real order history
    const deleteRes = await query(`
      DELETE FROM employees 
      WHERE name = 'حسن علي مهران' 
        AND role = 'فني تلميع ساطع'
        AND id NOT IN (
          SELECT DISTINCT employee_id FROM attendance WHERE employee_id IS NOT NULL
          UNION
          SELECT DISTINCT employee_id FROM employee_transactions WHERE employee_id IS NOT NULL
          UNION
          SELECT DISTINCT employee_id FROM payroll_payouts WHERE employee_id IS NOT NULL
          UNION
          SELECT DISTINCT assigned_employee_id FROM orders WHERE assigned_employee_id IS NOT NULL
        )
      RETURNING id, name, role
    `);

    console.log(`✅ Removed ${deleteRes.rows.length} duplicate test employee records.`);

    // 2. Fetch and verify current active employees
    const remainingRes = await query(`
      SELECT id, name, role, hourly_rate, pin_code, status 
      FROM employees 
      ORDER BY CASE WHEN name = 'مستر فتحي' OR role LIKE '%مالك%' THEN 0 ELSE 1 END, created_at ASC
    `);

    console.log(`\n📋 Current Legitimate Staff Members (${remainingRes.rows.length}):`);
    console.table(remainingRes.rows);

    if (remainingRes.rows.length === 5) {
      console.log('🎉 Core roster successfully verified with strictly 5 members!');
    }
  } catch (err: any) {
    console.error('❌ Cleanup error:', err.message);
  } finally {
    await pool.end();
  }
}

cleanupDuplicates();
