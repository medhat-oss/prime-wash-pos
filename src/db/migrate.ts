import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('🚀 Starting Database Schema Migration...');
  const schemaPath = path.join(__dirname, 'schema.sql');

  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ Schema file not found at: ${schemaPath}`);
    process.exit(1);
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    console.log('📦 Executing schema.sql script...');
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');
    console.log('✅ Schema migration completed successfully!');

    // Query list of created tables to display
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log('\n📋 Verified Public Tables in Database:');
    console.log('--------------------------------------------------');
    tablesRes.rows.forEach((row, i) => {
      console.log(` ${i + 1}. 📄 ${row.table_name}`);
    });
    console.log('--------------------------------------------------');
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed and was rolled back!');
    console.error('Error Details:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
