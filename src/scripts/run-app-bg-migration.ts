import { pool } from '../config/db.js';

async function migrateAppBg() {
  console.log('🔄 Running App & Header Background Colors Migration...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('1️⃣ Adding app_bg_color to system_settings...');
    await client.query(`
      ALTER TABLE system_settings 
      ADD COLUMN IF NOT EXISTS app_bg_color TEXT DEFAULT '#090d16';
    `);

    console.log('2️⃣ Adding header_bg_color to system_settings...');
    await client.query(`
      ALTER TABLE system_settings 
      ADD COLUMN IF NOT EXISTS header_bg_color TEXT DEFAULT 'rgba(15, 23, 42, 0.85)';
    `);

    console.log('3️⃣ Updating existing rows with default values if null...');
    await client.query(`
      UPDATE system_settings 
      SET 
        app_bg_color = COALESCE(app_bg_color, '#090d16'),
        header_bg_color = COALESCE(header_bg_color, 'rgba(15, 23, 42, 0.85)')
      WHERE app_bg_color IS NULL OR header_bg_color IS NULL;
    `);

    await client.query('COMMIT');
    console.log('✅ App & Header Background Migration Completed Successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrateAppBg();
