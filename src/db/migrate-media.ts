import { pool } from '../config/db.js';

export async function runMediaMigration() {
  console.log('🚀 Starting Media Backgrounds & POS Appearance Database Migration...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('📦 1. Adding media columns to services table...');
    await client.query(`
      ALTER TABLE services ADD COLUMN IF NOT EXISTS media_url TEXT;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) NOT NULL DEFAULT 'none';
    `);

    console.log('📦 2. Creating/Verifying system_settings table for POS appearance...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          pos_background_url TEXT,
          pos_background_type VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (pos_background_type IN ('none', 'image', 'video')),
          pos_background_opacity NUMERIC(3, 2) NOT NULL DEFAULT 0.25 CHECK (pos_background_opacity >= 0.0 AND pos_background_opacity <= 1.0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('📦 3. Ensuring default system_settings row exists...');
    await client.query(`
      INSERT INTO system_settings (pos_background_type, pos_background_opacity)
      SELECT 'none', 0.25
      WHERE NOT EXISTS (SELECT 1 FROM system_settings);
    `);

    console.log('📦 4. Setting up auto-update triggers...');
    await client.query(`
      DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON system_settings;
      CREATE TRIGGER trg_system_settings_updated_at
          BEFORE UPDATE ON system_settings
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query('COMMIT');
    console.log('✅ Media Backgrounds & POS Appearance database migration applied successfully!');
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ Media migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMediaMigration()
  .then(() => {
    console.log('Migration finished successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed with error:', err);
    process.exit(1);
  });

