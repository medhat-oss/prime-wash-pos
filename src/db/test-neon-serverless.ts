import dotenv from 'dotenv';
dotenv.config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

async function testNeonServerless() {
  const sql = neon(dbUrl);
  const shifts = await sql`SELECT id, cashier_name, status, shift_start, created_at, updated_at FROM shifts WHERE status = 'active'`;
  console.log('Active shifts via neon serverless:', shifts);
  
  if (shifts.length > 0) {
    const updated = await sql`UPDATE shifts SET status = 'closed', shift_end = CURRENT_TIMESTAMP WHERE status = 'active' RETURNING id, status`;
    console.log('Updated via neon serverless:', updated);
  }
}

testNeonServerless().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
