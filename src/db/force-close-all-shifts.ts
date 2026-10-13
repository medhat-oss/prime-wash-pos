import { pool } from '../config/db.js';

async function forceClose() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      UPDATE shifts 
      SET status = 'closed', shift_end = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE status = 'active'
      RETURNING id, shift_code, cashier_name, status;
    `);
    console.log('Closed active shifts:', res.rows);

    const activeCheck = await client.query(`SELECT id, cashier_name, status FROM shifts WHERE status = 'active'`);
    console.log('Remaining active shifts:', activeCheck.rows);
  } finally {
    client.release();
  }
}

forceClose().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
