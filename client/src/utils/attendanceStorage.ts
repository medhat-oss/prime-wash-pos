import { Employee, Attendance } from '../types/index.js';
import { FALLBACK_EMPLOYEES } from '../api/mockFallbacks.js';

export interface LocalAttendanceRecord {
  status: 'not_attended' | 'active_shift' | 'completed_shift';
  check_in?: string;
  check_out?: string;
  hours_worked?: number;
  work_date: string;
  updated_at: string;
}

export type LocalAttendanceMap = Record<string, LocalAttendanceRecord>;

const LIVE_STATUS_KEY = 'cw_active_attendance_logs';
const RECORDS_KEY = 'cw_attendance_records';

export const getTodayDateStr = (): string => {
  return new Date().toISOString().slice(0, 10);
};

export const getCustomStoredEmployees = (): Employee[] => {
  if (typeof window === 'undefined') return FALLBACK_EMPLOYEES;
  try {
    const raw = localStorage.getItem('cw_custom_employees');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return FALLBACK_EMPLOYEES;
};

/**
 * Standard daily hours calculation for an employee (default: 8.0h)
 */
export const getEmployeeStandardDailyHours = (employee?: Employee): number => {
  if (!employee) return 8.0;
  const weeklyHours = Number(employee.target_weekly_hours) || 48.0;
  const weeklyDays = Math.max(Number(employee.target_weekly_days) || 6, 1);
  return Number((weeklyHours / weeklyDays).toFixed(2)) || 8.0;
};

/**
 * Computes exact shift hours, overtime, and deductions
 */
export const computeShiftHoursBreakdown = (
  checkIn: string | Date,
  checkOut?: string | Date | null,
  employee?: Employee
): {
  actualHours: number;
  overtimeHours: number;
  deductedHours: number;
} => {
  const standardDaily = getEmployeeStandardDailyHours(employee);
  const inDate = new Date(checkIn);
  const outDate = checkOut ? new Date(checkOut) : new Date();

  const diffMs = Math.max(outDate.getTime() - inDate.getTime(), 0);
  const actualHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));

  if (!checkOut) {
    // Open shift
    return {
      actualHours,
      overtimeHours: actualHours > standardDaily ? Number((actualHours - standardDaily).toFixed(2)) : 0,
      deductedHours: 0,
    };
  }

  if (actualHours > standardDaily) {
    return {
      actualHours,
      overtimeHours: Number((actualHours - standardDaily).toFixed(2)),
      deductedHours: 0,
    };
  }

  return {
    actualHours,
    overtimeHours: 0,
    deductedHours: Number((standardDaily - actualHours).toFixed(2)),
  };
};

/**
 * Initial historical attendance records
 */
const INITIAL_ATTENDANCE_RECORDS: Attendance[] = [
  {
    id: 'att-hist-1',
    employee_id: '9428f33d-b890-4022-b324-9556c8cf6499', // حسن علي مهران
    employee_name: 'حسن علي مهران',
    employee_role: 'كاشير واستقبال',
    work_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    check_in: `${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}T08:00:00.000Z`,
    check_out: `${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}T17:00:00.000Z`,
    actual_hours: 9.0,
    overtime_hours: 1.0,
    deducted_hours: 0,
    notes: 'شفت كاشير كامل + ساعة إضافي ضغط سيارات',
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'att-hist-2',
    employee_id: 'a1de5f26-6440-49a2-ab38-4e20f03b93a6', // أحمد محمود السعيد
    employee_name: 'أحمد محمود السعيد',
    employee_role: 'فني غسيل وتلميع',
    work_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    check_in: `${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}T08:30:00.000Z`,
    check_out: `${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}T16:30:00.000Z`,
    actual_hours: 8.0,
    overtime_hours: 0,
    deducted_hours: 0,
    notes: 'حضور منتظم في الموعد',
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'att-hist-3',
    employee_id: '478ec10b-2715-4db8-a432-ea942440f99e', // كريم عبد العال
    employee_name: 'كريم عبد العال',
    employee_role: 'مشرف تشغيل ومراقبة جودة',
    work_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    check_in: `${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}T08:00:00.000Z`,
    check_out: `${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}T18:00:00.000Z`,
    actual_hours: 10.0,
    overtime_hours: 2.0,
    deducted_hours: 0,
    notes: 'إشراف على باقات النانو سيراميك',
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

/**
 * Get all stored historical attendance records
 */
export const getStoredAttendanceRecords = (filters?: {
  employee_id?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}): Attendance[] => {
  if (typeof window === 'undefined') return INITIAL_ATTENDANCE_RECORDS;

  let list: Attendance[] = [];
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed;
      }
    } else {
      list = INITIAL_ATTENDANCE_RECORDS;
      localStorage.setItem(RECORDS_KEY, JSON.stringify(INITIAL_ATTENDANCE_RECORDS));
    }
  } catch {
    list = INITIAL_ATTENDANCE_RECORDS;
  }

  if (filters) {
    if (filters.employee_id) {
      list = list.filter((a) => a.employee_id === filters.employee_id);
    }
    if (filters.startDate) {
      list = list.filter((a) => a.work_date >= filters.startDate!);
    }
    if (filters.endDate) {
      list = list.filter((a) => a.work_date <= filters.endDate!);
    }
  }

  // Sort descending by work_date and check_in
  list.sort((a, b) => new Date(b.check_in || b.work_date).getTime() - new Date(a.check_in || a.work_date).getTime());

  if (filters?.offset !== undefined || filters?.limit !== undefined) {
    const offset = filters.offset || 0;
    const limit = filters.limit || 100;
    list = list.slice(offset, offset + limit);
  }

  return list;
};

/**
 * Save historical attendance records to localStorage and dispatch events
 */
export const saveStoredAttendanceRecords = (records: Attendance[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    window.dispatchEvent(new CustomEvent('cw_attendance_updated', { detail: records }));
    window.dispatchEvent(new Event('cw_attendance_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

/**
 * Create or update an attendance record in the historical ledger
 */
export const createOrUpdateAttendanceRecord = (
  data: {
    id?: string;
    employee_id: string;
    work_date?: string;
    check_in: string;
    check_out?: string;
    notes?: string;
  },
  employeesList?: Employee[]
): Attendance => {
  const current = getStoredAttendanceRecords();
  const pool = (employeesList && employeesList.length > 0) ? employeesList : getCustomStoredEmployees();
  const emp = pool.find((e) => e.id === data.employee_id);

  const breakdown = computeShiftHoursBreakdown(data.check_in, data.check_out, emp);
  const workDate = data.work_date || new Date(data.check_in).toISOString().slice(0, 10);

  const existingIdx = data.id
    ? current.findIndex((a) => a.id === data.id)
    : current.findIndex(
        (a) => a.employee_id === data.employee_id && a.work_date === workDate && (!a.check_out || a.check_out === data.check_out)
      );

  let targetRecord: Attendance;

  if (existingIdx >= 0) {
    targetRecord = {
      ...current[existingIdx],
      check_in: data.check_in,
      check_out: data.check_out || current[existingIdx].check_out,
      actual_hours: breakdown.actualHours,
      overtime_hours: breakdown.overtimeHours,
      deducted_hours: breakdown.deductedHours,
      notes: data.notes !== undefined ? data.notes : current[existingIdx].notes,
    };
    current[existingIdx] = targetRecord;
  } else {
    targetRecord = {
      id: data.id || `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      employee_id: data.employee_id,
      employee_name: emp?.name || 'موظف',
      employee_role: emp?.role || 'فني',
      work_date: workDate,
      check_in: data.check_in,
      check_out: data.check_out,
      actual_hours: breakdown.actualHours,
      overtime_hours: breakdown.overtimeHours,
      deducted_hours: breakdown.deductedHours,
      notes: data.notes || '',
      created_at: new Date().toISOString(),
    };
    current.unshift(targetRecord);
  }

  saveStoredAttendanceRecords(current);
  return targetRecord;
};

/**
 * Delete an attendance record
 */
export const deleteStoredAttendanceRecord = (id: string): boolean => {
  const current = getStoredAttendanceRecords();
  const exists = current.some((a) => a.id === id);
  if (!exists) return false;

  const filtered = current.filter((a) => a.id !== id);
  saveStoredAttendanceRecords(filtered);
  return true;
};

/**
 * Get all current attendance records from localStorage for today.
 */
export const getLocalAttendanceMap = (employeesList?: Employee[]): LocalAttendanceMap => {
  const today = getTodayDateStr();
  const pool = (employeesList && employeesList.length > 0) ? employeesList : getCustomStoredEmployees();

  try {
    const raw = localStorage.getItem(LIVE_STATUS_KEY);
    if (raw) {
      const parsed: LocalAttendanceMap = JSON.parse(raw);
      const sample = Object.values(parsed)[0];
      if (sample && sample.work_date === today) {
        return parsed;
      }
    }
  } catch {}

  const initialMap: LocalAttendanceMap = {};
  let activeCashierId: string | null = null;
  try {
    const cashierRaw = localStorage.getItem('pos_active_cashier');
    if (cashierRaw) {
      const parsedCashier = JSON.parse(cashierRaw);
      if (parsedCashier?.id) activeCashierId = parsedCashier.id;
    }
  } catch {}

  pool.forEach((emp) => {
    if (emp.id === activeCashierId) {
      initialMap[emp.id] = {
        status: 'active_shift',
        check_in: new Date().toISOString(),
        work_date: today,
        updated_at: new Date().toISOString(),
      };
    } else {
      initialMap[emp.id] = {
        status: 'not_attended',
        work_date: today,
        updated_at: new Date().toISOString(),
      };
    }
  });

  try {
    localStorage.setItem(LIVE_STATUS_KEY, JSON.stringify(initialMap));
  } catch {}

  return initialMap;
};

/**
 * Save attendance map to localStorage and dispatch reactive events
 */
export const saveLocalAttendanceMap = (map: LocalAttendanceMap): void => {
  try {
    localStorage.setItem(LIVE_STATUS_KEY, JSON.stringify(map));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cw_attendance_updated', { detail: map }));
      window.dispatchEvent(new Event('cw_attendance_updated'));
      window.dispatchEvent(new Event('storage'));
    }
  } catch {}
};

/**
 * Auto Clock-In Cashier on POS unlock / login
 */
export const autoClockInCashier = (
  employee: { id: string; name?: string; role?: string },
  employeesList?: Employee[]
): void => {
  if (!employee || !employee.id) return;
  const today = getTodayDateStr();
  const map = getLocalAttendanceMap(employeesList);
  const current = map[employee.id];

  if (!current || current.status !== 'active_shift') {
    const nowIso = new Date().toISOString();
    map[employee.id] = {
      status: 'active_shift',
      check_in: nowIso,
      work_date: today,
      updated_at: nowIso,
    };
    saveLocalAttendanceMap(map);

    // Also register in historical records
    createOrUpdateAttendanceRecord(
      {
        employee_id: employee.id,
        work_date: today,
        check_in: nowIso,
        notes: 'تسجيل دخول تلقائي عند فتح شاشة الكاشير',
      },
      employeesList
    );
  }
};

/**
 * Record clock-in or clock-out with anti-duplication checks
 */
export const recordLocalClockAction = (
  employeeId: string,
  action: 'check_in' | 'check_out',
  employeeName?: string,
  employeesList?: Employee[]
): {
  action: string;
  employee_name: string;
  time: string;
  hours_worked?: number;
  overtime_hours?: number;
  deducted_hours?: number;
  message: string;
} => {
  const today = getTodayDateStr();
  const map = getLocalAttendanceMap(employeesList);
  const currentRecord = map[employeeId] || {
    status: 'not_attended',
    work_date: today,
    updated_at: new Date().toISOString(),
  };

  const pool = (employeesList && employeesList.length > 0) ? employeesList : getCustomStoredEmployees();
  const emp = pool.find((e) => e.id === employeeId);

  const name = employeeName || emp?.name || 'الموظف';
  const now = new Date();
  const timeFormatted = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  if (action === 'check_in') {
    if (currentRecord.status === 'active_shift') {
      throw new Error(`الموظف (${name}) مسجل حضور بالفعل للشفت الحالي ولم يسجل انصراف بعد.`);
    }
    if (currentRecord.status === 'completed_shift') {
      throw new Error(`تم تسجيل حضور وانصراف الموظف (${name}) بالفعل اليوم.`);
    }

    map[employeeId] = {
      status: 'active_shift',
      check_in: now.toISOString(),
      work_date: today,
      updated_at: now.toISOString(),
    };

    saveLocalAttendanceMap(map);

    createOrUpdateAttendanceRecord(
      {
        employee_id: employeeId,
        work_date: today,
        check_in: now.toISOString(),
        notes: `تسجيل حضور PIN في ${timeFormatted}`,
      },
      pool
    );

    return {
      action: 'check_in',
      employee_name: name,
      time: now.toISOString(),
      message: `تم تسجيل بدء الشفت (حضور) بنجاح للموظف: ${name} في تمام الساعة ${timeFormatted}`,
    };
  } else {
    // Action: check_out
    if (currentRecord.status === 'completed_shift') {
      throw new Error(`الموظف (${name}) مسجل انصراف بالفعل مسبقاً لهذا الشفت.`);
    }
    if (currentRecord.status === 'not_attended') {
      throw new Error(`الموظف (${name}) غير مسجل حضور اليوم لتسجيل انصرافه.`);
    }

    const checkInDate = currentRecord.check_in
      ? new Date(currentRecord.check_in)
      : new Date(now.getTime() - 8 * 3600 * 1000);

    const breakdown = computeShiftHoursBreakdown(checkInDate, now, emp);

    map[employeeId] = {
      status: 'completed_shift',
      check_in: currentRecord.check_in || checkInDate.toISOString(),
      check_out: now.toISOString(),
      hours_worked: breakdown.actualHours,
      work_date: today,
      updated_at: now.toISOString(),
    };

    saveLocalAttendanceMap(map);

    createOrUpdateAttendanceRecord(
      {
        employee_id: employeeId,
        work_date: today,
        check_in: currentRecord.check_in || checkInDate.toISOString(),
        check_out: now.toISOString(),
        notes: `تسجيل انصراف PIN في ${timeFormatted}`,
      },
      pool
    );

    return {
      action: 'check_out',
      employee_name: name,
      time: now.toISOString(),
      hours_worked: breakdown.actualHours,
      overtime_hours: breakdown.overtimeHours,
      deducted_hours: breakdown.deductedHours,
      message: `تم تسجيل إنهاء الشفت (انصراف) بنجاح للموظف: ${name}. إجمالي ساعات العمل: ${breakdown.actualHours} ساعة ${
        breakdown.overtimeHours > 0 ? `(+${breakdown.overtimeHours} ساعة إضافي)` : ''
      }`,
    };
  }
};

/**
 * End-of-Day Shift Close: Clock out ALL currently active employees and cashiers
 */
export const clockOutAllActiveEmployees = (
  employeesList?: Employee[]
): { totalClockedOut: number; clockedOutNames: string[] } => {
  const map = getLocalAttendanceMap(employeesList);
  const now = new Date();
  const pool = (employeesList && employeesList.length > 0) ? employeesList : getCustomStoredEmployees();
  const clockedOutNames: string[] = [];

  Object.keys(map).forEach((empId) => {
    if (map[empId].status === 'active_shift') {
      const checkInDate = map[empId].check_in
        ? new Date(map[empId].check_in!)
        : new Date(now.getTime() - 8 * 3600 * 1000);
      const emp = pool.find((e) => e.id === empId);
      const breakdown = computeShiftHoursBreakdown(checkInDate, now, emp);

      map[empId] = {
        status: 'completed_shift',
        check_in: map[empId].check_in || checkInDate.toISOString(),
        check_out: now.toISOString(),
        hours_worked: breakdown.actualHours,
        work_date: getTodayDateStr(),
        updated_at: now.toISOString(),
      };

      createOrUpdateAttendanceRecord(
        {
          employee_id: empId,
          work_date: getTodayDateStr(),
          check_in: map[empId].check_in || checkInDate.toISOString(),
          check_out: now.toISOString(),
          notes: 'إغلاق شفت عام وتصفية الوردية',
        },
        pool
      );

      clockedOutNames.push(emp?.name || empId);
    }
  });

  saveLocalAttendanceMap(map);

  return {
    totalClockedOut: clockedOutNames.length,
    clockedOutNames,
  };
};

/**
 * Shift Change Mode: Clock out ONLY the single active cashier
 */
export const clockOutSingleCashier = (
  cashierId: string,
  employeesList?: Employee[]
): void => {
  if (!cashierId) return;
  const map = getLocalAttendanceMap(employeesList);
  const now = new Date();
  const pool = (employeesList && employeesList.length > 0) ? employeesList : getCustomStoredEmployees();
  const emp = pool.find((e) => e.id === cashierId);

  const currentRecord = map[cashierId];
  const checkInDate = currentRecord?.check_in
    ? new Date(currentRecord.check_in)
    : new Date(now.getTime() - 8 * 3600 * 1000);
  const breakdown = computeShiftHoursBreakdown(checkInDate, now, emp);

  map[cashierId] = {
    status: 'completed_shift',
    check_in: currentRecord?.check_in || checkInDate.toISOString(),
    check_out: now.toISOString(),
    hours_worked: breakdown.actualHours,
    work_date: getTodayDateStr(),
    updated_at: now.toISOString(),
  };

  saveLocalAttendanceMap(map);

  createOrUpdateAttendanceRecord(
    {
      employee_id: cashierId,
      work_date: getTodayDateStr(),
      check_in: currentRecord?.check_in || checkInDate.toISOString(),
      check_out: now.toISOString(),
      notes: 'تسليم وردية الكاشير وتبديل المستخدم',
    },
    pool
  );
};

/**
 * Get active attended headcount (employees with active_shift status)
 */
export const getActiveAttendedHeadcount = (employeesList?: Employee[]): number => {
  const map = getLocalAttendanceMap(employeesList);
  return Object.values(map).filter((r) => r.status === 'active_shift').length;
};

/**
 * Get formatted status map for UI badges in ClockInOutModal and Attendance lists
 */
export const getFormattedTodayStatusMap = (
  employeesList?: Employee[]
): Record<
  string,
  {
    status: 'not_attended' | 'active_shift' | 'completed_shift';
    label: string;
    badgeColor: string;
    check_in?: string;
    check_out?: string;
  }
> => {
  const map = getLocalAttendanceMap(employeesList);
  const pool = (employeesList && employeesList.length > 0) ? employeesList : getCustomStoredEmployees();

  const result: Record<string, any> = {};

  pool.forEach((emp) => {
    const record = map[emp.id] || { status: 'not_attended', work_date: getTodayDateStr(), updated_at: '' };

    if (record.status === 'active_shift') {
      result[emp.id] = {
        status: 'active_shift',
        label: 'حاضر (شفت نشط)',
        badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        check_in: record.check_in,
      };
    } else if (record.status === 'completed_shift') {
      result[emp.id] = {
        status: 'completed_shift',
        label: 'تم الإنصراف (مكتمل)',
        badgeColor: 'bg-slate-800 text-slate-400 border-slate-700',
        check_in: record.check_in,
        check_out: record.check_out,
      };
    } else {
      result[emp.id] = {
        status: 'not_attended',
        label: 'لم يحضر اليوم',
        badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      };
    }
  });

  return result;
};
