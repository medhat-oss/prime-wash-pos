import { pool } from '../config/db.js';

export async function runShiftsMigration() {
  console.log('🚀 Starting Shifts & Cashier Sessions Database Migration...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('📦 1. Creating/Verifying shifts table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS shifts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          shift_code VARCHAR(100) NOT NULL UNIQUE,
          cashier_id UUID REFERENCES employees(id) ON DELETE SET NULL,
          cashier_name VARCHAR(255) NOT NULL,
          cashier_role VARCHAR(100) DEFAULT 'كاشير واستقبال',
          shift_start TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          shift_end TIMESTAMPTZ,
          opening_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          gross_sales NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          cash_sales NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          card_sales NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          transfer_sales NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          total_orders INTEGER NOT NULL DEFAULT 0,
          expected_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          actual_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          variance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
          closing_notes TEXT,
          approved_by VARCHAR(255),
          is_end_of_day BOOLEAN NOT NULL DEFAULT false,
          active_workers_breakdown JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('📦 2. Adding shift & cashier reference columns to orders table...');
    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashier_id UUID REFERENCES employees(id) ON DELETE SET NULL;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashier_name VARCHAR(255);
    `);

    console.log('📦 3. Creating performance indexes on shifts and orders...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
      CREATE INDEX IF NOT EXISTS idx_shifts_start ON shifts(shift_start DESC);
      CREATE INDEX IF NOT EXISTS idx_shifts_cashier ON shifts(cashier_id);
      CREATE INDEX IF NOT EXISTS idx_orders_shift_id ON orders(shift_id);
    `);

    console.log('📦 4. Setting updated_at trigger on shifts...');
    await client.query(`
      DROP TRIGGER IF EXISTS trg_shifts_updated_at ON shifts;
      CREATE TRIGGER trg_shifts_updated_at
          BEFORE UPDATE ON shifts
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query('COMMIT');
    console.log('✅ Shifts Database Migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Shifts Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Standalone execution support
if (process.argv[1]?.endsWith('migrate-shifts.ts') || process.argv[1]?.endsWith('migrate-shifts.js')) {
  runShiftsMigration()
    .then(() => {
      console.log('🎉 Migration finished. Exiting...');
      process.exit(0);
    })
    .catch((err) => {
      console.error('🔥 Fatal migration error:', err);
      process.exit(1);
    });
}
