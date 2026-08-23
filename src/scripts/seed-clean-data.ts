import dotenv from 'dotenv';
dotenv.config();

import { pool, query } from '../config/db.js';

async function seedData() {
  console.log('🔄 Cleaning up duplicate employees and seeding realistic staff...');

  try {
    // 1. Fetch current employees
    const empRes = await query('SELECT id, name, role, phone, hourly_rate, pin_code, status FROM employees ORDER BY created_at ASC');
    console.log('Current employees count:', empRes.rows.length);

    // 2. Clean up redundant duplicate employees
    // We will delete all existing employees and seed 4 clean, distinct staff members
    await query('DELETE FROM attendance');
    await query('DELETE FROM employee_transactions');
    await query('DELETE FROM payroll_payouts');
    await query('UPDATE orders SET assigned_employee_id = NULL');
    await query('DELETE FROM employees');

    console.log('Deleted legacy employee data.');

    // 3. Seed 5 clean, realistic staff members (including Owner profile)
    const staffMembers = [
      {
        name: 'مستر فتحي',
        phone: '01000000000',
        role: 'مالك المنشأة / المدير العام',
        hourly_rate: 0.0,
        overtime_hourly_rate: 0.0,
        target_weekly_days: 7,
        target_weekly_hours: 0.0,
        weekly_off_day: 'الجمعة',
        pin_code: '5555',
        status: 'active',
      },
      {
        name: 'حسن علي مهران',
        phone: '01012345678',
        role: 'كاشير واستقبال',
        hourly_rate: 45.0,
        overtime_hourly_rate: 45.0,
        target_weekly_days: 6,
        target_weekly_hours: 48.0,
        weekly_off_day: 'الجمعة',
        pin_code: '1234',
        status: 'active',
      },
      {
        name: 'أحمد محمود السعيد',
        phone: '01123456789',
        role: 'فني غسيل وتلميع',
        hourly_rate: 35.0,
        overtime_hourly_rate: 35.0,
        target_weekly_days: 6,
        target_weekly_hours: 48.0,
        weekly_off_day: 'الجمعة',
        pin_code: '2222',
        status: 'active',
      },
      {
        name: 'محمود طارق إبراهيم',
        phone: '01234567890',
        role: 'فني نانو سيراميك وحماية',
        hourly_rate: 55.0,
        overtime_hourly_rate: 65.0,
        target_weekly_days: 6,
        target_weekly_hours: 48.0,
        weekly_off_day: 'السبت',
        pin_code: '3333',
        status: 'active',
      },
      {
        name: 'كريم عبد العال',
        phone: '01545678901',
        role: 'مشرف تشغيل ومراقبة جودة',
        hourly_rate: 50.0,
        overtime_hourly_rate: 50.0,
        target_weekly_days: 6,
        target_weekly_hours: 48.0,
        weekly_off_day: 'الجمعة',
        pin_code: '4444',
        status: 'active',
      },
    ];

    const insertedEmployees = [];
    for (const staff of staffMembers) {
      const res = await query(
        `INSERT INTO employees (
          name, phone, role, hourly_rate, overtime_hourly_rate, target_weekly_days, target_weekly_hours, weekly_off_day, pin_code, status, hire_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '2026-01-01')
        RETURNING id, name, role, hourly_rate, pin_code`,
        [
          staff.name,
          staff.phone,
          staff.role,
          staff.hourly_rate,
          staff.overtime_hourly_rate,
          staff.target_weekly_days,
          staff.target_weekly_hours,
          staff.weekly_off_day,
          staff.pin_code,
          staff.status,
        ]
      );
      insertedEmployees.push(res.rows[0]);
    }
    // 4. Seed realistic attendance records for August 2026 (for operational staff)
    const cashier = insertedEmployees.find((e) => e.name === 'حسن علي مهران')!;
    const washer = insertedEmployees.find((e) => e.name === 'أحمد محمود السعيد')!;
    const ceramicTech = insertedEmployees.find((e) => e.name === 'محمود طارق إبراهيم')!;
    const supervisor = insertedEmployees.find((e) => e.name === 'كريم عبد العال')!;

    // Seed attendance across past 18 days of August 2026
    const days = [
      '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
      '2026-08-06', '2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11',
      '2026-08-12', '2026-08-13', '2026-08-15', '2026-08-16', '2026-08-17',
      '2026-08-18', '2026-08-19', '2026-08-20'
    ];

    for (const day of days) {
      // Cashier
      await query(
        `INSERT INTO attendance (employee_id, work_date, check_in, check_out, actual_hours, overtime_hours, deducted_hours, notes)
         VALUES ($1, $2, $3, $4, 8.5, 0.5, 0, 'حضور منتظم')`,
        [cashier.id, day, `${day}T09:00:00Z`, `${day}T17:30:00Z`]
      );

      // Washer
      await query(
        `INSERT INTO attendance (employee_id, work_date, check_in, check_out, actual_hours, overtime_hours, deducted_hours, notes)
         VALUES ($1, $2, $3, $4, 9.0, 1.0, 0, 'وردية غسيل مكثفة')`,
        [washer.id, day, `${day}T09:00:00Z`, `${day}T18:00:00Z`]
      );

      // Ceramic Tech
      await query(
        `INSERT INTO attendance (employee_id, work_date, check_in, check_out, actual_hours, overtime_hours, deducted_hours, notes)
         VALUES ($1, $2, $3, $4, 8.0, 0, 0, 'جلسات نانو سيراميك')`,
        [ceramicTech.id, day, `${day}T10:00:00Z`, `${day}T18:00:00Z`]
      );

      // Supervisor
      await query(
        `INSERT INTO attendance (employee_id, work_date, check_in, check_out, actual_hours, overtime_hours, deducted_hours, notes)
         VALUES ($1, $2, $3, $4, 8.5, 0.5, 0, 'إشراف ومراقبة جودة')`,
        [supervisor.id, day, `${day}T09:00:00Z`, `${day}T17:30:00Z`]
      );
    }
    console.log('✅ Seeded attendance records for August 2026.');

    // 5. Seed 2 settled payroll payouts for previous period / mid-month
    await query(
      `INSERT INTO payroll_payouts (
        payout_code, employee_id, period_start, period_end, total_hours_worked, base_salary_amount, overtime_amount, bonuses_amount, deductions_amount, advances_deducted, net_paid, payment_date, payment_method, notes
      ) VALUES 
      ('PAY-202608-01', $1, '2026-08-01', '2026-08-15', 72.0, 3240.0, 180.0, 300.0, 0.0, 0.0, 3720.0, '2026-08-15T18:00:00Z', 'transfer', 'صرف نصف شهري - كاشير'),
      ('PAY-202608-02', $2, '2026-08-01', '2026-08-15', 75.0, 2625.0, 245.0, 200.0, 0.0, 0.0, 3070.0, '2026-08-15T18:00:00Z', 'cash', 'صرف نصف شهري - فني غسيل')`,
      [cashier.id, washer.id]
    );
    console.log('✅ Seeded settled payroll payouts.');

    // 6. Seed sample expenses for August 2026 if empty
    const expCountRes = await query('SELECT count(*)::int as count FROM expenses');
    if (expCountRes.rows[0].count === 0) {
      await query(`
        INSERT INTO expenses (title, category, amount, expense_date, payment_method, receipt_reference, notes)
        VALUES 
        ('إيجار مقر المغسلة لشهر أغسطس', 'إيجار', 12000.0, '2026-08-01', 'transfer', 'REC-RENT-08', 'إيجار شهري رئيسي'),
        ('فاتورة الكهرباء التجارية', 'كهرباء ومياه', 3450.0, '2026-08-05', 'card', 'ELEC-9921', 'استهلاك طلمبات الضغط العالي'),
        ('شراء شامبو واكس وفوط مايكروفايبر', 'أدوات ومواد نظافة', 2800.0, '2026-08-08', 'cash', 'SUPP-3341', 'توريد مستلزمات نظافة'),
        ('صيانة دورية لمضخة البخار الإيطالية', 'صيانة ومعدات', 1500.0, '2026-08-12', 'cash', 'MAINT-102', 'تغيير بلف وضغط الزيت')
      `);
      console.log('✅ Seeded realistic operational expenses.');
    }

    // 7. Associate existing orders with clean employees
    await query(`UPDATE orders SET assigned_employee_id = $1 WHERE assigned_employee_id IS NULL`, [washer.id]);

    console.log('🎉 Seeding complete successfully!');
  } catch (err) {
    console.error('❌ Seeding error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedData();
