import dotenv from 'dotenv';
dotenv.config();

import { pool } from '../config/db.js';

async function runMigration() {
  console.log('🔄 Running migration: Creating expenses table and indexes...');

  const sql = `
    CREATE TABLE IF NOT EXISTS expenses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'إيجار' CHECK (category IN ('إيجار', 'كهرباء ومياه', 'صيانة ومعدات', 'أدوات ومواد نظافة', 'بوفيه ومصاريف إدارية', 'ضرائب ورسوم', 'أخرى')),
        amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
        expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
        payment_method VARCHAR(50) NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'transfer')),
        receipt_reference VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

    DROP TRIGGER IF EXISTS trg_expenses_updated_at ON expenses;
    CREATE TRIGGER trg_expenses_updated_at
        BEFORE UPDATE ON expenses
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `;

  try {
    await pool.query(sql);
    console.log('✅ Expenses table, indexes, and triggers created successfully in database!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
