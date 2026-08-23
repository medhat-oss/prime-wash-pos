import { pool } from '../config/db.js';

export async function runThemeMigration() {
  console.log('🚀 Starting Theme & Color Palette Database Migration...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('🎨 Adding theme color columns to system_settings table...');
    await client.query(`
      ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#06b6d4';
      ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#3b82f6';
      ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#10b981';
      ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS card_bg_color TEXT DEFAULT 'rgba(15, 23, 42, 0.75)';
      ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS border_color TEXT DEFAULT 'rgba(51, 65, 85, 0.6)';
    `);

    // Ensure default settings row has color defaults if null
    await client.query(`
      UPDATE system_settings 
      SET 
        primary_color = COALESCE(primary_color, '#06b6d4'),
        secondary_color = COALESCE(secondary_color, '#3b82f6'),
        accent_color = COALESCE(accent_color, '#10b981'),
        card_bg_color = COALESCE(card_bg_color, 'rgba(15, 23, 42, 0.75)'),
        border_color = COALESCE(border_color, 'rgba(51, 65, 85, 0.6)');
    `);

    await client.query('COMMIT');
    console.log('✅ Theme & Color Palette migration applied successfully!');
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ Theme migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runThemeMigration()
  .then(() => {
    console.log('Migration finished successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
  });
