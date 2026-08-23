import { pool } from '../config/db.js';

async function main() {
  console.log('🚀 Running ETA migration script...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS tax_settings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          is_enabled BOOLEAN NOT NULL DEFAULT false,
          eta_sync_enabled BOOLEAN NOT NULL DEFAULT false,
          environment VARCHAR(20) NOT NULL DEFAULT 'preprod' CHECK (environment IN ('preprod', 'production')),
          client_id TEXT,
          client_secret TEXT,
          tax_registration_number VARCHAR(50),
          pos_serial VARCHAR(50),
          branch_code VARCHAR(50) NOT NULL DEFAULT '0',
          pos_os_version VARCHAR(100) DEFAULT 'Windows',
          remote_signer_url TEXT,
          remote_signer_token TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE tax_settings ADD COLUMN IF NOT EXISTS eta_sync_enabled BOOLEAN NOT NULL DEFAULT false;
    `);

    await client.query(`
      INSERT INTO tax_settings (id, is_enabled, eta_sync_enabled, environment, branch_code, pos_os_version)
      SELECT gen_random_uuid(), false, false, 'preprod', '0', 'Windows'
      WHERE NOT EXISTS (SELECT 1 FROM tax_settings);
    `);

    await client.query(`
      ALTER TABLE services ADD COLUMN IF NOT EXISTS egs_code VARCHAR(100);
    `);

    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_uuid VARCHAR(100);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_submission_id VARCHAR(100);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_status VARCHAR(50) NOT NULL DEFAULT 'not_synced';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_share_url TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_synced_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_error_message TEXT;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS eta_sync_queue (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'synced', 'failed')),
          attempts INTEGER NOT NULL DEFAULT 0,
          last_attempt_at TIMESTAMPTZ,
          next_retry_at TIMESTAMPTZ,
          error_log TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_services_egs_code ON services(egs_code);
      CREATE INDEX IF NOT EXISTS idx_orders_eta_status ON orders(eta_status);
      CREATE INDEX IF NOT EXISTS idx_orders_eta_uuid ON orders(eta_uuid);
      CREATE INDEX IF NOT EXISTS idx_eta_sync_queue_status_retry ON eta_sync_queue(status, next_retry_at);
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trg_tax_settings_updated_at ON tax_settings;
      CREATE TRIGGER trg_tax_settings_updated_at
          BEFORE UPDATE ON tax_settings
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS trg_eta_sync_queue_updated_at ON eta_sync_queue;
      CREATE TRIGGER trg_eta_sync_queue_updated_at
          BEFORE UPDATE ON eta_sync_queue
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query('COMMIT');
    console.log('✅ ETA Migration complete and verified!');

    const res = await client.query('SELECT * FROM tax_settings LIMIT 1');
    console.log('Current Tax Settings in DB:', res.rows[0]);
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('❌ Migration Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
