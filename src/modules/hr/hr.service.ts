import { query, getClient } from '../../config/db.js';
import { AppError } from '../../middleware/errorHandler.js';
import { generateReferenceCode } from '../../utils/codeGenerator.js';
import { safeTimingEqual } from '../../utils/crypto.js';
import { employeePinRateLimiter } from '../../utils/rateLimiter.js';
import { toLocalISODate, getFirstDayOfMonth, getNextCalendarDay } from '../../utils/date.js';

export class HrService {
  /**
   * Calculate standard daily work hours from weekly targets
   */
  static getStandardDailyHours(employee: { target_weekly_hours?: number; target_weekly_days?: number }): number {
    const weeklyHours = Number(employee.target_weekly_hours) || 48.0;
    const weeklyDays = Math.max(Number(employee.target_weekly_days) || 6, 1);
    return Number((weeklyHours / weeklyDays).toFixed(2)) || 8.0;
  }

  /**
   * Compute overtime and deducted hours from actual and standard hours
   */
  static computeShiftHours(actualHours: number, standardDailyHours: number): {
    overtimeHours: number;
    deductedHours: number;
  } {
    if (actualHours > standardDailyHours) {
      return {
        overtimeHours: Number((actualHours - standardDailyHours).toFixed(2)),
        deductedHours: 0,
      };
    }
    return {
      overtimeHours: 0,
      deductedHours: Number((standardDailyHours - actualHours).toFixed(2)),
    };
  }

  // ==========================================
  // 1. Employees Management
  // ==========================================
  static async getEmployees(status?: string) {
    let sql = `
      SELECT 
        id, 
        name, 
        phone, 
        role, 
        hourly_rate::float AS hourly_rate, 
        overtime_hourly_rate::float AS overtime_hourly_rate,
        target_weekly_days, 
        target_weekly_hours::float AS target_weekly_hours, 
        COALESCE(weekly_off_day, 'الجمعة') AS weekly_off_day,
        COALESCE(is_paid_weekly_off, false) AS is_paid_weekly_off,
        status, 
        hire_date, 
        created_at, 
        updated_at
      FROM employees
    `;
    const params: any[] = [];
    if (status) {
      sql += ` WHERE status = $1`;
      params.push(status);
    }
    sql += ` ORDER BY CASE WHEN name = 'مستر فتحي' OR role LIKE '%مالك%' THEN 0 ELSE 1 END, name ASC`;

    const res = await query(sql, params);
    return res.rows;
  }

  static async getEmployeeById(id: string) {
    const res = await query(
      `SELECT 
        id, 
        name, 
        phone, 
        role, 
        hourly_rate::float AS hourly_rate, 
        overtime_hourly_rate::float AS overtime_hourly_rate,
        target_weekly_days, 
        target_weekly_hours::float AS target_weekly_hours, 
        COALESCE(weekly_off_day, 'الجمعة') AS weekly_off_day,
        COALESCE(is_paid_weekly_off, false) AS is_paid_weekly_off,
        status, 
        hire_date, 
        created_at, 
        updated_at
      FROM employees WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) {
      throw new AppError('الموظف المطلوب غير موجود', 404);
    }
    return res.rows[0];
  }

  static async createEmployee(data: {
    name: string;
    phone?: string;
    role?: string;
    hourly_rate?: number;
    overtime_hourly_rate?: number | null;
    target_weekly_days?: number;
    target_weekly_hours?: number;
    weekly_off_day?: string;
    is_paid_weekly_off?: boolean;
    pin_code?: string;
    status?: string;
    hire_date?: string;
  }) {
    if (data.hourly_rate !== undefined && (isNaN(data.hourly_rate) || data.hourly_rate < 0)) {
      throw new AppError('سعر الساعة يجب أن يكون رقماً موجباً', 400);
    }

    if (
      data.overtime_hourly_rate !== undefined &&
      data.overtime_hourly_rate !== null &&
      (isNaN(data.overtime_hourly_rate) || data.overtime_hourly_rate < 0)
    ) {
      throw new AppError('سعر ساعة الإضافي يجب أن يكون رقماً موجباً', 400);
    }

    const res = await query(
      `INSERT INTO employees (
        name, phone, role, hourly_rate, overtime_hourly_rate, target_weekly_days, target_weekly_hours, weekly_off_day, is_paid_weekly_off, pin_code, status, hire_date
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING 
        id, 
        name, 
        phone, 
        role, 
        hourly_rate::float AS hourly_rate, 
        overtime_hourly_rate::float AS overtime_hourly_rate,
        target_weekly_days, 
        target_weekly_hours::float AS target_weekly_hours, 
        weekly_off_day,
        is_paid_weekly_off,
        status, 
        hire_date, 
        created_at, 
        updated_at`,
      [
        data.name.trim(),
        data.phone ? data.phone.trim() : null,
        data.role ? data.role.trim() : 'فني غسيل',
        data.hourly_rate ?? 30.0,
        data.overtime_hourly_rate !== undefined && data.overtime_hourly_rate !== null && data.overtime_hourly_rate > 0
          ? data.overtime_hourly_rate
          : null,
        data.target_weekly_days ?? 6,
        data.target_weekly_hours ?? 48.0,
        data.weekly_off_day ? data.weekly_off_day.trim() : 'الجمعة',
        Boolean(data.is_paid_weekly_off),
        data.pin_code ? data.pin_code.trim() : '1234',
        data.status || 'active',
        data.hire_date || toLocalISODate(),
      ]
    );

    return res.rows[0];
  }

  static async updateEmployee(
    id: string,
    data: {
      name?: string;
      phone?: string;
      role?: string;
      hourly_rate?: number;
      overtime_hourly_rate?: number | null;
      target_weekly_days?: number;
      target_weekly_hours?: number;
      weekly_off_day?: string;
      is_paid_weekly_off?: boolean;
      pin_code?: string;
      status?: string;
    }
  ) {
    await this.getEmployeeById(id);

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name.trim());
    }
    if (data.phone !== undefined) {
      fields.push(`phone = $${idx++}`);
      values.push(data.phone.trim());
    }
    if (data.role !== undefined) {
      fields.push(`role = $${idx++}`);
      values.push(data.role.trim());
    }
    if (data.hourly_rate !== undefined) {
      if (isNaN(data.hourly_rate) || data.hourly_rate < 0) {
        throw new AppError('سعر الساعة يجب أن يكون رقماً موجباً', 400);
      }
      fields.push(`hourly_rate = $${idx++}`);
      values.push(data.hourly_rate);
    }
    if (data.overtime_hourly_rate !== undefined) {
      if (
        data.overtime_hourly_rate !== null &&
        (isNaN(data.overtime_hourly_rate) || data.overtime_hourly_rate < 0)
      ) {
        throw new AppError('سعر ساعة الإضافي يجب أن يكون رقماً موجباً', 400);
      }
      fields.push(`overtime_hourly_rate = $${idx++}`);
      values.push(
        data.overtime_hourly_rate === null || data.overtime_hourly_rate === 0
          ? null
          : data.overtime_hourly_rate
      );
    }
    if (data.target_weekly_days !== undefined) {
      fields.push(`target_weekly_days = $${idx++}`);
      values.push(data.target_weekly_days);
    }
    if (data.target_weekly_hours !== undefined) {
      fields.push(`target_weekly_hours = $${idx++}`);
      values.push(data.target_weekly_hours);
    }
    if (data.weekly_off_day !== undefined) {
      fields.push(`weekly_off_day = $${idx++}`);
      values.push(data.weekly_off_day.trim());
    }
    if (data.is_paid_weekly_off !== undefined) {
      fields.push(`is_paid_weekly_off = $${idx++}`);
      values.push(Boolean(data.is_paid_weekly_off));
    }
    if (data.pin_code !== undefined) {
      fields.push(`pin_code = $${idx++}`);
      values.push(data.pin_code.trim());
    }
    if (data.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(data.status);
    }

    if (fields.length === 0) {
      throw new AppError('لا توجد بيانات مقدمة للتعديل', 400);
    }

    values.push(id);
    const sql = `
      UPDATE employees 
      SET ${fields.join(', ')} 
      WHERE id = $${idx}
      RETURNING 
        id, 
        name, 
        phone, 
        role, 
        hourly_rate::float AS hourly_rate, 
        overtime_hourly_rate::float AS overtime_hourly_rate,
        target_weekly_days, 
        target_weekly_hours::float AS target_weekly_hours, 
        weekly_off_day,
        is_paid_weekly_off,
        status, 
        hire_date, 
        created_at, 
        updated_at
    `;

    const res = await query(sql, values);
    return res.rows[0];
  }

  static async deleteEmployee(id: string) {
    const existing = await this.getEmployeeById(id);
    // Unassign employee from orders
    await query('UPDATE orders SET assigned_employee_id = NULL WHERE assigned_employee_id = $1', [id]);
    // Delete attendance, transactions, and payroll records (or rely on CASCADE)
    await query('DELETE FROM attendance WHERE employee_id = $1', [id]);
    await query('DELETE FROM employee_transactions WHERE employee_id = $1', [id]);
    await query('DELETE FROM payroll_payouts WHERE employee_id = $1', [id]);
    await query('DELETE FROM employees WHERE id = $1', [id]);
    return existing;
  }

  // ==========================================
  // 2. Attendance & Secure PIN Clock In / Out
  // ==========================================
  static async clockWithPin(data: {
    employee_id: string;
    pin_code: string;
    action: 'check_in' | 'check_out';
    notes?: string;
  }) {
    // 1. Fetch employee securely along with their stored PIN
    const empRes = await query(
      `SELECT id, name, pin_code, target_weekly_hours::float AS target_weekly_hours, target_weekly_days 
       FROM employees WHERE id = $1`,
      [data.employee_id]
    );

    if (empRes.rows.length === 0) {
      throw new AppError('الموظف المطلوب غير موجود', 404);
    }

    const employee = empRes.rows[0];

    const rateLimitKey = `emp_pin_${data.employee_id}`;
    if (employeePinRateLimiter.isRateLimited(rateLimitKey)) {
      throw new AppError(
        'تم تجاوز الحد الأقصى للمحاولات الخاطئة برمز PIN. يرجى الانتظار دقيقة قبل المحاولة مجدداً.',
        429,
        { code: 'RATE_LIMIT_EXCEEDED' }
      );
    }

    // 2. Verify PIN code securely using constant-time comparison
    if (!safeTimingEqual(data.pin_code, employee.pin_code)) {
      employeePinRateLimiter.recordFailure(rateLimitKey);
      throw new AppError('رمز PIN السري غير صحيح. يرجى التأكد من الرمز الخاص بك.', 401);
    }

    employeePinRateLimiter.reset(rateLimitKey);

    const now = new Date();
    const todayStr = toLocalISODate(now);
    const standardDailyHours = HrService.getStandardDailyHours(employee);

    if (data.action === 'check_in') {
      // 1. Check if the employee already has an open active shift
      const openShiftRes = await query(
        `SELECT id, check_in, work_date 
         FROM attendance 
         WHERE employee_id = $1 AND check_out IS NULL 
         ORDER BY check_in DESC 
         LIMIT 1`,
        [data.employee_id]
      );

      if (openShiftRes.rows.length > 0) {
        throw new AppError(
          'الموظف مسجل حضور بالفعل للشفت الحالي ولم يسجل انصراف بعد.',
          400,
          { code: 'SHIFT_ALREADY_OPEN' }
        );
      }

      // 2. Check if the employee already completed their shift today
      const todayCompletedRes = await query(
        `SELECT id, check_in, check_out 
         FROM attendance 
         WHERE employee_id = $1 AND work_date = $2 AND check_out IS NOT NULL 
         ORDER BY check_in DESC 
         LIMIT 1`,
        [data.employee_id, todayStr]
      );

      if (todayCompletedRes.rows.length > 0) {
        throw new AppError(
          'تم تسجيل حضور وانصراف هذا الموظف بالفعل اليوم.',
          400,
          { code: 'SHIFT_ALREADY_COMPLETED' }
        );
      }

      const insertRes = await query(
        `INSERT INTO attendance (
          employee_id, work_date, check_in, actual_hours, overtime_hours, deducted_hours, notes
        ) VALUES ($1, $2, $3, 0, 0, 0, $4)
        RETURNING id, employee_id, work_date, check_in, actual_hours, overtime_hours, deducted_hours, notes, created_at`,
        [data.employee_id, todayStr, now.toISOString(), data.notes || 'تسجيل حضور من شاشة الكاشير']
      );

      const timeFormatted = now.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
      });

      return {
        success: true,
        action: 'check_in',
        employee_name: employee.name,
        time: timeFormatted,
        attendance: insertRes.rows[0],
        message: `تم تسجيل بدء الشفت (حضور) بنجاح للموظف: ${employee.name} في تمام الساعة ${timeFormatted}`,
      };
    } else {
      // Action: check_out
      // 1. Find active open shift
      const openAttRes = await query(
        `SELECT id, check_in, work_date 
         FROM attendance 
         WHERE employee_id = $1 AND check_out IS NULL 
         ORDER BY check_in DESC 
         LIMIT 1`,
        [data.employee_id]
      );

      if (openAttRes.rows.length === 0) {
        // No open shift found. Check if they already clocked out today vs never clocked in today.
        const todayCompletedRes = await query(
          `SELECT id, check_in, check_out 
           FROM attendance 
           WHERE employee_id = $1 AND work_date = $2 AND check_out IS NOT NULL 
           ORDER BY check_in DESC 
           LIMIT 1`,
          [data.employee_id, todayStr]
        );

        if (todayCompletedRes.rows.length > 0) {
          throw new AppError(
            'تم تسجيل انصراف الموظف بالفعل مسبقاً.',
            400,
            { code: 'SHIFT_ALREADY_CLOCKED_OUT' }
          );
        } else {
          throw new AppError(
            'الموظف غير مسجل حضور اليوم لتسجيل انصرافه.',
            400,
            { code: 'NO_ATTENDANCE_TODAY' }
          );
        }
      }

      const attId = openAttRes.rows[0].id;
      const checkInDate = new Date(openAttRes.rows[0].check_in);

      const diffMs = Math.max(now.getTime() - checkInDate.getTime(), 0);
      const actualHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
      const { overtimeHours, deductedHours } = HrService.computeShiftHours(actualHours, standardDailyHours);

      const updateRes = await query(
        `UPDATE attendance 
         SET 
           check_out = $1,
           actual_hours = $2,
           overtime_hours = $3,
           deducted_hours = $4,
           notes = COALESCE(notes, '') || ' | تسجيل انصراف من الكاشير'
         WHERE id = $5
         RETURNING id, employee_id, work_date, check_in, check_out, actual_hours::float AS actual_hours, overtime_hours::float AS overtime_hours, deducted_hours::float AS deducted_hours, notes`,
        [now.toISOString(), actualHours, overtimeHours, deductedHours, attId]
      );

      const timeFormatted = now.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
      });

      return {
        success: true,
        action: 'check_out',
        employee_name: employee.name,
        time: timeFormatted,
        hours_worked: actualHours,
        overtime_hours: overtimeHours,
        attendance: updateRes.rows[0],
        message: `تم تسجيل إنهاء الشفت (انصراف) بنجاح للموظف: ${employee.name}. إجمالي ساعات العمل: ${actualHours} ساعة ${
          overtimeHours > 0 ? `(منها ${overtimeHours} ساعة إضافي)` : ''
        }`,
      };
    }
  }

  /**
   * Get real-time shift status for all active employees for today
   */
  static async getTodayAttendanceStatus() {
    const now = new Date();
    const todayStr = toLocalISODate(now);

    const res = await query(
      `SELECT 
         e.id AS employee_id,
         e.name AS employee_name,
         a.id AS attendance_id,
         a.work_date,
         a.check_in,
         a.check_out,
         a.actual_hours
       FROM employees e
       LEFT JOIN attendance a ON e.id = a.employee_id AND a.work_date = $1
       WHERE e.status = 'active'
       ORDER BY a.check_in DESC`,
      [todayStr]
    );

    const statusMap: Record<
      string,
      {
        status: 'not_attended' | 'active_shift' | 'completed_shift';
        label: string;
        badgeColor: string;
        check_in?: string;
        check_out?: string;
      }
    > = {};

    res.rows.forEach((row) => {
      if (!statusMap[row.employee_id]) {
        if (!row.check_in) {
          statusMap[row.employee_id] = {
            status: 'not_attended',
            label: 'غير حاضر اليوم ❌',
            badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          };
        } else if (!row.check_out) {
          statusMap[row.employee_id] = {
            status: 'active_shift',
            label: 'على رأس العمل حالياً 🟢',
            badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
            check_in: row.check_in,
          };
        } else {
          statusMap[row.employee_id] = {
            status: 'completed_shift',
            label: 'انصرف بالفعل ⚪',
            badgeColor: 'bg-slate-700/50 text-slate-300 border-slate-600',
            check_in: row.check_in,
            check_out: row.check_out,
          };
        }
      }
    });

    return statusMap;
  }

  static async recordAttendance(data: {
    employee_id: string;
    work_date?: string;
    check_in: string;
    check_out?: string;
    notes?: string;
  }) {
    const employee = await this.getEmployeeById(data.employee_id);

    const checkInDate = new Date(data.check_in);
    let actualHours = 0;
    let overtimeHours = 0;
    let deductedHours = 0;

    const standardDailyHours = HrService.getStandardDailyHours(employee);

    if (data.check_out) {
      const checkOutDate = new Date(data.check_out);
      const diffMs = checkOutDate.getTime() - checkInDate.getTime();
      if (diffMs < 0) {
        throw new AppError('وقت الانصراف يجب أن يكون بعد وقت الحضور', 400);
      }

      actualHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
      const breakdown = HrService.computeShiftHours(actualHours, standardDailyHours);
      overtimeHours = breakdown.overtimeHours;
      deductedHours = breakdown.deductedHours;
    }


    const workDate = data.work_date || toLocalISODate(checkInDate);

    const res = await query(
      `INSERT INTO attendance (
        employee_id, work_date, check_in, check_out, actual_hours, overtime_hours, deducted_hours, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING 
        id, 
        employee_id, 
        work_date, 
        check_in, 
        check_out, 
        actual_hours::float AS actual_hours, 
        overtime_hours::float AS overtime_hours, 
        deducted_hours::float AS deducted_hours, 
        notes, 
        created_at`,
      [
        data.employee_id,
        workDate,
        data.check_in,
        data.check_out || null,
        actualHours,
        overtimeHours,
        deductedHours,
        data.notes || null,
      ]
    );

    return res.rows[0];
  }

  static async getAttendanceList(filters: {
    employee_id?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) {
    let sql = `
      SELECT 
        a.id,
        a.employee_id,
        e.name AS employee_name,
        e.role AS employee_role,
        a.work_date,
        a.check_in,
        a.check_out,
        a.actual_hours::float AS actual_hours,
        a.overtime_hours::float AS overtime_hours,
        a.deducted_hours::float AS deducted_hours,
        a.notes,
        a.created_at
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (filters.employee_id) {
      sql += ` AND a.employee_id = $${idx++}`;
      params.push(filters.employee_id);
    }
    if (filters.startDate) {
      sql += ` AND a.work_date >= $${idx++}`;
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      sql += ` AND a.work_date <= $${idx++}`;
      params.push(filters.endDate);
    }

    sql += ` ORDER BY a.work_date DESC, a.check_in DESC`;

    const limit = filters.limit ? Math.min(filters.limit, 200) : 100;
    sql += ` LIMIT $${idx++}`;
    params.push(limit);

    if (filters.offset) {
      sql += ` OFFSET $${idx++}`;
      params.push(filters.offset);
    }

    const res = await query(sql, params);
    return res.rows;
  }

  // ==========================================
  // 3. Employee Financial Transactions
  // ==========================================
  static async createTransaction(data: {
    employee_id: string;
    type: 'advance' | 'bonus' | 'deduction';
    amount: number;
    date?: string;
    notes?: string;
  }) {
    await this.getEmployeeById(data.employee_id);

    if (!['advance', 'bonus', 'deduction'].includes(data.type)) {
      throw new AppError('نوع الحركة غير صالح (المقبول: advance, bonus, deduction)', 400);
    }

    if (isNaN(data.amount) || data.amount <= 0) {
      throw new AppError('قيمة المبلغ يجب أن تكون رقماً أكبر من صفر', 400);
    }

    const date = data.date || toLocalISODate();

    const res = await query(
      `INSERT INTO employee_transactions (employee_id, type, amount, date, notes, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING 
        id, 
        employee_id, 
        type, 
        amount::float AS amount, 
        date, 
        notes, 
        status, 
        created_at`,
      [data.employee_id, data.type, data.amount, date, data.notes || null]
    );

    return res.rows[0];
  }

  static async getTransactions(filters: {
    employee_id?: string;
    type?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) {
    let sql = `
      SELECT 
        t.id,
        t.employee_id,
        e.name AS employee_name,
        t.type,
        t.amount::float AS amount,
        t.date,
        t.notes,
        t.status,
        t.created_at
      FROM employee_transactions t
      JOIN employees e ON t.employee_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (filters.employee_id) {
      sql += ` AND t.employee_id = $${idx++}`;
      params.push(filters.employee_id);
    }
    if (filters.type) {
      sql += ` AND t.type = $${idx++}`;
      params.push(filters.type);
    }
    if (filters.status) {
      sql += ` AND t.status = $${idx++}`;
      params.push(filters.status);
    }
    if (filters.startDate) {
      sql += ` AND t.date >= $${idx++}`;
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      sql += ` AND t.date <= $${idx++}`;
      params.push(filters.endDate);
    }

    sql += ` ORDER BY t.date DESC, t.created_at DESC`;

    const limit = filters.limit ? Math.min(filters.limit, 200) : 100;
    sql += ` LIMIT $${idx++}`;
    params.push(limit);

    if (filters.offset) {
      sql += ` OFFSET $${idx++}`;
      params.push(filters.offset);
    }

    const res = await query(sql, params);
    return res.rows;
  }

  // ==========================================
  // 4. Real-time Payroll Calculation (Accurate Dynamic Hours & Deduction Logic)
  // ==========================================
  static async calculatePayroll(
    employee_id: string,
    period_start?: string,
    period_end?: string
  ) {
    const employee = await this.getEmployeeById(employee_id);

    const now = new Date();
    // Default period_start: 1st of current month (e.g. 2026-08-01)
    const start = period_start || getFirstDayOfMonth(now);

    // Default period_end for real-time calculation: Today's actual date (e.g. 2026-08-21)
    const end = period_end || toLocalISODate(now);

    const standardDailyHours = HrService.getStandardDailyHours(employee);

    // 1. Fetch individual attendance records for the period to calculate exact hours
    const attendanceRes = await query(
      `SELECT 
        id,
        work_date,
        check_in,
        check_out,
        actual_hours::float AS actual_hours,
        overtime_hours::float AS overtime_hours,
        deducted_hours::float AS deducted_hours
       FROM attendance
       WHERE employee_id = $1 AND work_date >= $2 AND work_date <= $3
       ORDER BY work_date ASC`,
      [employee_id, start, end]
    );

    let totalHoursWorked = 0;
    let totalOvertimeHours = 0;
    let totalDeductedHours = 0;
    const attendanceDaysCount = attendanceRes.rows.length;

    for (const row of attendanceRes.rows) {
      let rowActual = Number(row.actual_hours) || 0;
      let rowOvertime = Number(row.overtime_hours) || 0;
      let rowDeducted = Number(row.deducted_hours) || 0;

      if (row.check_out) {
        // Shift completed
        if (rowActual === 0 && row.check_in) {
          const diffMs = Math.max(new Date(row.check_out).getTime() - new Date(row.check_in).getTime(), 0);
          rowActual = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
          const breakdown = HrService.computeShiftHours(rowActual, standardDailyHours);
          rowOvertime = breakdown.overtimeHours;
          rowDeducted = breakdown.deductedHours;
        }
      } else if (row.check_in) {

        // Ongoing open shift
        const checkInDate = new Date(row.check_in);
        const elapsedMs = Math.max(now.getTime() - checkInDate.getTime(), 0);
        const elapsedHours = Number((elapsedMs / (1000 * 60 * 60)).toFixed(2));

        // If today, count elapsed hours without penalizing with full day deduction
        if (elapsedHours > 0) {
          rowActual = elapsedHours;
          if (elapsedHours > standardDailyHours) {
            rowOvertime = Number((elapsedHours - standardDailyHours).toFixed(2));
            rowDeducted = 0;
          } else {
            rowOvertime = 0;
            rowDeducted = 0;
          }
        } else {
          rowActual = 0;
          rowOvertime = 0;
          rowDeducted = 0;
        }
      }

      totalHoursWorked += rowActual;
      totalOvertimeHours += rowOvertime;
      totalDeductedHours += rowDeducted;
    }

    totalHoursWorked = Number(totalHoursWorked.toFixed(2));
    totalOvertimeHours = Number(totalOvertimeHours.toFixed(2));
    totalDeductedHours = Number(totalDeductedHours.toFixed(2));

    const hourlyRate = Number(employee.hourly_rate);
    const customOvertimeRate =
      employee.overtime_hourly_rate !== null &&
      employee.overtime_hourly_rate !== undefined &&
      Number(employee.overtime_hourly_rate) > 0
        ? Number(employee.overtime_hourly_rate)
        : null;
    const effectiveOvertimeRate =
      customOvertimeRate !== null
        ? customOvertimeRate
        : Number(hourlyRate.toFixed(2));

    // Calculate paid weekly rest days (if enabled for employee)
    const WEEKDAY_MAP: Record<string, number> = {
      'الأحد': 0,
      'الإثنين': 1,
      'الثلاثاء': 2,
      'الأربعاء': 3,
      'الخميس': 4,
      'الجمعة': 5,
      'السبت': 6,
    };

    let paidWeeklyOffDaysCount = 0;
    if (employee.is_paid_weekly_off) {
      const offDayName = employee.weekly_off_day || 'الجمعة';
      const targetDayIdx = WEEKDAY_MAP[offDayName] ?? 5; // Default Friday (5)

      const attendedDates = new Set(
        attendanceRes.rows.map((r: any) => {
          if (r.work_date instanceof Date) {
            return toLocalISODate(r.work_date);
          }
          return String(r.work_date).slice(0, 10);
        })
      );

      const [sY, sM, sD] = start.split('-').map(Number);
      const [eY, eM, eD] = end.split('-').map(Number);
      const cur = new Date(sY, sM - 1, sD);
      const stop = new Date(eY, eM - 1, eD);

      while (cur <= stop) {
        if (cur.getDay() === targetDayIdx) {
          const curStr = toLocalISODate(cur);
          if (!attendedDates.has(curStr)) {
            paidWeeklyOffDaysCount++;
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    const paidWeeklyOffHours = Number((paidWeeklyOffDaysCount * standardDailyHours).toFixed(2));
    const paidWeeklyOffAmount = Number((paidWeeklyOffHours * hourlyRate).toFixed(2));
    const attendedHoursAmount = Number((totalHoursWorked * hourlyRate).toFixed(2));
    const baseSalaryAmount = Number(((totalHoursWorked + paidWeeklyOffHours) * hourlyRate).toFixed(2));
    const overtimeAmount = Number((totalOvertimeHours * effectiveOvertimeRate).toFixed(2));

    // Monetary value of lost/deducted hours
    const hoursDeductionAmount = Number((totalDeductedHours * hourlyRate).toFixed(2));

    // 2. Fetch financial transactions (advances, bonuses, manual penalties)
    const transRes = await query(
      `SELECT 
        id, 
        type, 
        amount::float AS amount, 
        date, 
        notes, 
        status
       FROM employee_transactions
       WHERE employee_id = $1 AND status = 'pending' AND date >= $2 AND date <= $3`,
      [employee_id, start, end]
    );

    let bonusesAmount = 0;
    let penaltyDeductionsAmount = 0;
    let advancesAmount = 0;

    transRes.rows.forEach((t) => {
      if (t.type === 'bonus') bonusesAmount += t.amount;
      if (t.type === 'deduction') penaltyDeductionsAmount += t.amount;
      if (t.type === 'advance') advancesAmount += t.amount;
    });

    bonusesAmount = Number(bonusesAmount.toFixed(2));
    penaltyDeductionsAmount = Number(penaltyDeductionsAmount.toFixed(2));
    advancesAmount = Number(advancesAmount.toFixed(2));

    // Total deductions = lost hours monetary value + administrative/penalty deductions
    const totalDeductionsAmount = Number(
      (hoursDeductionAmount + penaltyDeductionsAmount).toFixed(2)
    );

    // Net payable salary = Base (Attended + Paid Off) + Overtime + Bonuses - (Total Deductions + Advances)
    const netSalary = Number(
      (
        baseSalaryAmount +
        overtimeAmount +
        bonusesAmount -
        (totalDeductionsAmount + advancesAmount)
      ).toFixed(2)
    );

    const isDebt = netSalary < 0;
    const carriedDebtAmount = isDebt ? Number(Math.abs(netSalary).toFixed(2)) : 0;

    return {
      employee: {
        id: employee.id,
        name: employee.name,
        role: employee.role,
        hourly_rate: hourlyRate,
        overtime_hourly_rate: customOvertimeRate,
        target_weekly_days: employee.target_weekly_days,
        target_weekly_hours: employee.target_weekly_hours,
        weekly_off_day: employee.weekly_off_day || 'الجمعة',
        is_paid_weekly_off: Boolean(employee.is_paid_weekly_off),
      },
      period: {
        start,
        end,
      },
      work_metrics: {
        attendance_days: attendanceDaysCount,
        total_hours_worked: totalHoursWorked,
        paid_weekly_off_days: paidWeeklyOffDaysCount,
        paid_weekly_off_hours: paidWeeklyOffHours,
        total_overtime_hours: totalOvertimeHours,
        total_deducted_hours: totalDeductedHours,
      },
      financial_breakdown: {
        attended_hours_amount: attendedHoursAmount,
        paid_weekly_off_amount: paidWeeklyOffAmount,
        base_salary_amount: baseSalaryAmount,
        overtime_amount: overtimeAmount,
        effective_overtime_rate: effectiveOvertimeRate,
        bonuses_amount: bonusesAmount,
        hours_deduction_amount: hoursDeductionAmount,
        penalty_deductions_amount: penaltyDeductionsAmount,
        deductions_amount: totalDeductionsAmount,
        advances_deducted: advancesAmount,
        net_payable_salary: netSalary,
        is_debt: isDebt,
        carried_debt_amount: carriedDebtAmount,
      },
      pending_transactions: transRes.rows,
    };
  }

  // ==========================================
  // 5. Payout & Settlement Transaction (With Debt Roll-forward)
  // ==========================================
  static async payoutSalary(data: {
    employee_id: string;
    period_start: string;
    period_end: string;
    payment_method?: 'cash' | 'transfer' | 'cheque';
    notes?: string;
  }) {
    const calc = await this.calculatePayroll(
      data.employee_id,
      data.period_start,
      data.period_end
    );

    const isDebt = calc.financial_breakdown.is_debt;
    const netPayable = calc.financial_breakdown.net_payable_salary;
    const actualPaidOut = isDebt ? 0.0 : netPayable;
    const carriedDebtAmount = isDebt ? calc.financial_breakdown.carried_debt_amount : 0.0;

    // Determine rollover start date (day following period_end)
    const nextPeriodStartDate = getNextCalendarDay(data.period_end);

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const payoutCode = generateReferenceCode('PAY');

      const payoutNotes =
        data.notes ||
        (isDebt
          ? `تسوية مسير بمديونية مرحلة (${carriedDebtAmount} ج.م) للشهر القادم`
          : `صرف راتب الفترة من ${data.period_start} إلى ${data.period_end}`);

      const payoutRes = await client.query(
        `INSERT INTO payroll_payouts (
          payout_code, 
          employee_id, 
          period_start, 
          period_end, 
          total_hours_worked, 
          base_salary_amount, 
          overtime_amount, 
          bonuses_amount, 
          deductions_amount, 
          advances_deducted, 
          net_paid, 
          payment_method, 
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING 
          id, 
          payout_code, 
          employee_id, 
          period_start, 
          period_end, 
          total_hours_worked::float AS total_hours_worked, 
          base_salary_amount::float AS base_salary_amount, 
          overtime_amount::float AS overtime_amount, 
          bonuses_amount::float AS bonuses_amount, 
          deductions_amount::float AS deductions_amount, 
          advances_deducted::float AS advances_deducted, 
          net_paid::float AS net_paid, 
          payment_date, 
          payment_method, 
          notes, 
          created_at`,
        [
          payoutCode,
          data.employee_id,
          data.period_start,
          data.period_end,
          calc.work_metrics.total_hours_worked,
          calc.financial_breakdown.base_salary_amount,
          calc.financial_breakdown.overtime_amount,
          calc.financial_breakdown.bonuses_amount,
          calc.financial_breakdown.deductions_amount,
          calc.financial_breakdown.advances_deducted,
          actualPaidOut,
          data.payment_method || 'transfer',
          payoutNotes,
        ]
      );

      const payout = payoutRes.rows[0];

      // Settle all current period pending transactions
      if (calc.pending_transactions.length > 0) {
        const transIds = calc.pending_transactions.map((t) => t.id);
        await client.query(
          `UPDATE employee_transactions 
           SET status = 'settled' 
           WHERE id = ANY($1::uuid[])`,
          [transIds]
        );
      }

      // If employee has a debt balance, create a forward transaction (advance) for next period
      let carriedDebtTransaction = null;
      if (isDebt && carriedDebtAmount > 0) {
        const rollRes = await client.query(
          `INSERT INTO employee_transactions (
            employee_id, type, amount, date, notes, status
          ) VALUES ($1, 'advance', $2, $3, $4, 'pending')
          RETURNING id, employee_id, type, amount::float AS amount, date, notes, status, created_at`,
          [
            data.employee_id,
            carriedDebtAmount,
            nextPeriodStartDate,
            `مديونية مرحلة من مسير الفترة (${data.period_start} إلى ${data.period_end}) - صافي مستحق سابق بالسالب`,
          ]
        );
        carriedDebtTransaction = rollRes.rows[0];
      }

      await client.query('COMMIT');

      return {
        payout,
        settled_transactions_count: calc.pending_transactions.length,
        is_debt: isDebt,
        carried_debt_amount: carriedDebtAmount,
        carried_debt_transaction: carriedDebtTransaction,
        details: calc,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getPayouts(filters: {
    employee_id?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) {
    let sql = `
      SELECT 
        p.id,
        p.payout_code,
        p.employee_id,
        e.name AS employee_name,
        p.period_start,
        p.period_end,
        p.total_hours_worked::float AS total_hours_worked,
        p.base_salary_amount::float AS base_salary_amount,
        p.overtime_amount::float AS overtime_amount,
        p.bonuses_amount::float AS bonuses_amount,
        p.deductions_amount::float AS deductions_amount,
        p.advances_deducted::float AS advances_deducted,
        p.net_paid::float AS net_paid,
        p.payment_date,
        p.payment_method,
        p.notes,
        p.created_at
      FROM payroll_payouts p
      JOIN employees e ON p.employee_id = e.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let idx = 1;

    if (filters.employee_id) {
      sql += ` AND p.employee_id = $${idx++}`;
      params.push(filters.employee_id);
    }
    if (filters.startDate) {
      sql += ` AND p.period_start >= $${idx++}`;
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      sql += ` AND p.period_end <= $${idx++}`;
      params.push(filters.endDate);
    }

    sql += ` ORDER BY p.payment_date DESC, p.created_at DESC`;

    const limit = filters.limit ? Math.min(filters.limit, 200) : 100;
    sql += ` LIMIT $${idx++}`;
    params.push(limit);

    if (filters.offset) {
      sql += ` OFFSET $${idx++}`;
      params.push(filters.offset);
    }

    const res = await query(sql, params);
    return res.rows;
  }
}
