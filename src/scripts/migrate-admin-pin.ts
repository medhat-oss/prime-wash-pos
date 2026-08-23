import dotenv from 'dotenv';
dotenv.config();

import { query, pool } from '../config/db.js';

async function migrateAdminPin() {
  console.log('🔑 Adding admin_pin column to system_settings...');
  try {
    await query(`
      ALTER TABLE system_settings 
      ADD COLUMN IF NOT EXISTS admin_pin TEXT DEFAULT '1234';
    `);
    console.log('✅ admin_pin column added/verified successfully in system_settings!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.end();
  }
}

migrateAdminPin();
