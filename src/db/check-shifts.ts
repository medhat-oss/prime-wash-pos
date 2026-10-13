import { pool } from '../config/db.js';

async function check() {
  const client = await pool.connect();
  try {
    const res = await client.query(`SELECT id, shift_code, cashier_name, status, shift_start, created_at, updated_at FROM shifts ORDER BY created_at DESC LIMIT 10;`);
    console.log('Shifts in DB:', res.rows);
  } finally {
    client.release();
  }
}

check().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
