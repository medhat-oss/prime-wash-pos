import { pool } from '../config/db.js';

export async function closeStaleActiveShifts() {
  console.log('🚀 Checking for stale active shifts in Neon PostgreSQL...');

  const client = await pool.connect();
  try {
    const activeShiftsRes = await client.query(`
      SELECT id, shift_code, cashier_name, shift_start, status 
      FROM shifts 
      WHERE status = 'active'
    `);

    console.log(`Found ${activeShiftsRes.rows.length} active shift(s):`, activeShiftsRes.rows);

    if (activeShiftsRes.rows.length > 0) {
      for (const shift of activeShiftsRes.rows) {
        // Calculate shift orders summary
        const ordersSummary = await client.query(`
          SELECT 
            COUNT(*)::int AS total_orders,
            COALESCE(SUM(total_amount), 0)::float AS gross_sales,
            COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0)::float AS cash_sales,
            COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0)::float AS card_sales,
            COALESCE(SUM(CASE WHEN payment_method IN ('transfer', 'wallet') THEN total_amount ELSE 0 END), 0)::float AS transfer_sales
          FROM orders
          WHERE (shift_id = $1 OR created_at >= $2)
        `, [shift.id, shift.shift_start]);

        const summary = ordersSummary.rows[0] || {
          total_orders: 0,
          gross_sales: 0,
          cash_sales: 0,
          card_sales: 0,
          transfer_sales: 0,
        };

        console.log(`Summary for shift ${shift.shift_code || shift.id}:`, summary);

        await client.query(`
          UPDATE shifts
          SET 
            status = 'closed',
            shift_end = CURRENT_TIMESTAMP,
            gross_sales = $1,
            cash_sales = $2,
            card_sales = $3,
            transfer_sales = $4,
            total_orders = $5,
            expected_cash = $2,
            actual_cash = $2,
            variance = 0,
            closing_notes = 'إغلاق تلقائي للوردية المعلقة وتسوية النظام',
            approved_by = 'الإدارة / مستر فتحي',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $6
        `, [
          summary.gross_sales,
          summary.cash_sales,
          summary.card_sales,
          summary.transfer_sales,
          summary.total_orders,
          shift.id,
        ]);

        console.log(`✅ Closed shift ${shift.shift_code || shift.id} successfully.`);
      }
    }

    // Clock out open attendance records
    const openAttRes = await client.query(`
      SELECT id, employee_id, check_in 
      FROM attendance 
      WHERE check_out IS NULL
    `);

    console.log(`Found ${openAttRes.rows.length} open attendance record(s).`);
    if (openAttRes.rows.length > 0) {
      await client.query(`
        UPDATE attendance 
        SET 
          check_out = CURRENT_TIMESTAMP,
          actual_hours = ROUND((EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - check_in)) / 3600)::numeric, 2),
          notes = COALESCE(notes, '') || ' | تقفيل تلقائي للورديات السابقة'
        WHERE check_out IS NULL
      `);
      console.log('✅ Clocked out all open attendance records.');
    }

    console.log('🎉 Shift & Attendance Cleanup Complete!');
  } catch (err) {
    console.error('❌ Error closing stale shifts:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Run directly
closeStaleActiveShifts()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
