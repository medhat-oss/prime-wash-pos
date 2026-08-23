import { pool } from '../config/db.js';

async function testConnection() {
  console.log('🔄 Checking connection to Neon PostgreSQL database...');
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT 
        current_database() AS database_name,
        current_user AS user_name,
        NOW() AS server_time,
        version() AS pg_version;
    `);
    
    console.log('✅ Successfully connected to Neon Database!');
    console.log('--------------------------------------------------');
    console.log(`📁 Database Name: ${result.rows[0].database_name}`);
    console.log(`👤 User:          ${result.rows[0].user_name}`);
    console.log(`⏰ Server Time:   ${result.rows[0].server_time}`);
    console.log(`🐘 Version:       ${result.rows[0].pg_version}`);
    console.log('--------------------------------------------------');
    
    client.release();
    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Connection Failed!');
    console.error('Error Details:', error.message);
    if (error.code) {
      console.error(`PostgreSQL Code: ${error.code}`);
    }
    console.error('\n💡 Tip: Please check your DATABASE_URL in .env file.');
    await pool.end();
    process.exit(1);
  }
}

testConnection();
