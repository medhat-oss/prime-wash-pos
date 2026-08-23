import { pool } from '../config/db.js';

async function migrate() {
  console.log('🚀 Running Overtime Rate Migration for Employees...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE employees 
      ADD COLUMN IF NOT EXISTS overtime_hourly_rate NUMERIC(10, 2) DEFAULT NULL;
    `);

    await client.query('COMMIT');
    console.log('✅ Overtime column migration completed successfully!');

    const res = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'employees' AND column_name = 'overtime_hourly_rate';
    `);

    console.log('Verified column:', res.rows);
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
