import { pool } from '../config/db.js';

export async function runRolesMigration() {
  console.log('🚀 Starting Employee System Roles Database Migration...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('📦 1. Adding system_role column to employees table...');
    await client.query(`
      ALTER TABLE employees 
      ADD COLUMN IF NOT EXISTS system_role VARCHAR(50) NOT NULL DEFAULT 'worker';
    `);

    console.log('📦 2. Backfilling existing employees with structured system roles...');
    // Owner
    await client.query(`
      UPDATE employees 
      SET system_role = 'owner' 
      WHERE name = 'مستر فتحي' OR role LIKE '%مالك%' OR role LIKE '%مدير عام%' OR role LIKE '%Owner%';
    `);

    // Manager
    await client.query(`
      UPDATE employees 
      SET system_role = 'manager' 
      WHERE (role LIKE '%مدير%' OR role LIKE '%مشرف%') AND system_role != 'owner';
    `);

    // Cashier
    await client.query(`
      UPDATE employees 
      SET system_role = 'cashier' 
      WHERE (role LIKE '%كاشير%' OR role LIKE '%استقبال%' OR name LIKE '%حسن علي%') AND system_role NOT IN ('owner', 'manager');
    `);

    // Others default to worker
    await client.query(`
      UPDATE employees 
      SET system_role = 'worker' 
      WHERE system_role IS NULL;
    `);

    console.log('📦 3. Creating index on system_role...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employees_system_role ON employees(system_role);
    `);

    await client.query('COMMIT');
    console.log('✅ Employee System Roles Migration Completed Successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed, rolled back changes:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Direct execution support
if (process.argv[1]?.includes('migrate-roles')) {
  runRolesMigration()
    .then(() => {
      console.log('🎉 Done! Exiting...');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration execution error:', err);
      process.exit(1);
    });
}
