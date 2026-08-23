import dotenv from 'dotenv';
dotenv.config();

import { pool, query } from '../config/db.js';
import { HrService } from '../modules/hr/hr.service.js';

async function testPayrollDates() {
  console.log('Testing calculatePayroll date calculations...');
  try {
    const empRes = await query('SELECT id, name FROM employees WHERE status = $1 LIMIT 1', ['active']);
    if (empRes.rows.length === 0) {
      console.log('No active employee found.');
      return;
    }
    const emp = empRes.rows[0];
    const calc = await HrService.calculatePayroll(emp.id);
    console.log('Employee:', emp.name);
    console.log('Calculation Period Start:', calc.period.start);
    console.log('Calculation Period End (Today):', calc.period.end);

    const now = new Date();
    const expectedYear = now.getFullYear();
    const expectedMonth = String(now.getMonth() + 1).padStart(2, '0');
    const expectedDay = String(now.getDate()).padStart(2, '0');
    const expectedStart = `${expectedYear}-${expectedMonth}-01`;
    const expectedEnd = `${expectedYear}-${expectedMonth}-${expectedDay}`;

    if (calc.period.start === expectedStart && calc.period.end === expectedEnd) {
      console.log('✅ PASS: Real-time payroll calculation correctly spans from 1st of month to today without timezone offset!');
    } else {
      console.error(`❌ FAIL: Expected start ${expectedStart} and end ${expectedEnd}, got ${calc.period.start} to ${calc.period.end}`);
    }
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await pool.end();
  }
}

testPayrollDates();
