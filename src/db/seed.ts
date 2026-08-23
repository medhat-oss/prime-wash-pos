import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSeed() {
  console.log('🌱 Starting Database Seeding...');
  const seedPath = path.join(__dirname, 'seed.sql');

  if (!fs.existsSync(seedPath)) {
    console.error(`❌ Seed file not found at: ${seedPath}`);
    process.exit(1);
  }

  const seedSql = fs.readFileSync(seedPath, 'utf8');

  const client = await pool.connect();
  try {
    console.log('📦 Executing seed.sql script...');
    await client.query('BEGIN');
    await client.query(seedSql);
    await client.query('COMMIT');
    console.log('✅ Seeding completed successfully!');

    // Check counts in each table
    const tableCounts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM inventory_items) AS inventory_items_count,
        (SELECT COUNT(*) FROM services) AS services_count,
        (SELECT COUNT(*) FROM service_recipes) AS service_recipes_count,
        (SELECT COUNT(*) FROM employees) AS employees_count,
        (SELECT COUNT(*) FROM orders) AS orders_count,
        (SELECT COUNT(*) FROM attendance) AS attendance_count,
        (SELECT COUNT(*) FROM employee_transactions) AS transactions_count,
        (SELECT COUNT(*) FROM payroll_payouts) AS payroll_payouts_count;
    `);

    const c = tableCounts.rows[0];
    console.log('\n📊 Seed Records Summary:');
    console.log('--------------------------------------------------');
    console.log(` 🧴 Inventory Items (المواد الخام بالجرام): ${c.inventory_items_count}`);
    console.log(` 🚗 Services (أنواع الغسيل):                 ${c.services_count}`);
    console.log(` 🧪 Service Recipes / BOM (الوصفات والمكونات):${c.service_recipes_count}`);
    console.log(` 👨‍💼 Employees (سجل الموظفين):               ${c.employees_count}`);
    console.log(` 🧾 Orders / POS (فواتير نقاط البيع):        ${c.orders_count}`);
    console.log(` ⏰ Attendance (الحضور والانصراف):           ${c.attendance_count}`);
    console.log(` 💰 Employee Transactions (الحركات المالية): ${c.transactions_count}`);
    console.log(` 📑 Payroll Payouts (مسير الرواتب):          ${c.payroll_payouts_count}`);
    console.log('--------------------------------------------------');
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed and was rolled back!');
    console.error('Error Details:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runSeed();
