import { Employee, Attendance } from '../types/index.js';
import { FALLBACK_EMPLOYEES } from '../api/mockFallbacks.js';
import { notifyEmployeeCheckIn, notifyEmployeeCheckOut } from './telegramNotifications.js';
import { getAllFromDb } from '../db/indexedDB.js';

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

export const getTodayDateStr = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Check if an employee profile represents the owner / executive management
 */
export const isOwnerEmployee = (emp?: { name?: string; role?: string } | null): boolean => {
  if (!emp) return false;
  const name = (emp.name || '').trim();
  const role = (emp.role || '').trim();
  return (
    name === 'مستر فتحي' ||
    name.includes('فتحي') ||
    role.includes('مالك') ||
    role.includes('مدير عام') ||
    role.toLowerCase().includes('owner')
  );
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
 * Computes exact shift hours, overtime, and deductions with stale-shift protection (16h cap)
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
  const now = new Date();

  if (!checkOut) {
    // Open shift
    const elapsedHours = Math.max((now.getTime() - inDate.getTime()) / (1000 * 60 * 60), 0);
    // Stale shift guard: if older than 16 hours, cap to standard daily shift (e.g. 8.0h)
    if (elapsedHours > 16) {
      return {
        actualHours: standardDaily,
        overtimeHours: 0,
        deductedHours: 0,
      };
    }
    const actualHours = Number(elapsedHours.toFixed(2));
    return {
      actualHours,
      overtimeHours: actualHours > standardDaily ? Number((actualHours - standardDaily).toFixed(2)) : 0,
      deductedHours: 0,
    };
  }

  const outDate = new Date(checkOut);
  const diffMs = Math.max(outDate.getTime() - inDate.getTime(), 0);
  let actualHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));

  // Stale shift guard: single shift duration should never exceed 16 hours
  if (actualHours > 16) {
    actualHours = standardDaily;
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
  const workDate = data.work_date || (data.check_in ? getTodayDateStr(new Date(data.check_in)) : getTodayDateStr());

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
 * Check if an employee has a pending CLOCK_ACTION in IndexedDB sync queue
 */
export const getPendingClockActionEmployeeIds = async (): Promise<Set<string>> => {
  const pendingSet = new Set<string>();
  try {
    const queue = await getAllFromDb('sync_queue');
    if (Array.isArray(queue)) {
      queue.forEach((item) => {
        if (
          item.action_type === 'CLOCK_ACTION' &&
          (item.status === 'pending' || item.status === 'in_flight') &&
          item.payload?.employee_id
        ) {
          pendingSet.add(item.payload.employee_id);
        }
      });
    }
  } catch {}
  return pendingSet;
};

/**
 * Synchronize central server attendance records or today's status map into local storage
 * and update the reactive state across devices with strict authoritative server precedence.
 */
export const syncServerAttendanceState = async (
  records?: Attendance[],
  statusMap?: Record<string, { status: 'not_attended' | 'active_shift' | 'completed_shift'; label?: string; badgeColor?: string; check_in?: string; check_out?: string }>
): Promise<void> => {
  if (typeof window === 'undefined') return;
  const today = getTodayDateStr();
  const pool = getCustomStoredEmployees();
  const pendingClockEmps = await getPendingClockActionEmployeeIds();

  // 1. If records are provided from /hr/attendance, merge/save them
  if (Array.isArray(records) && records.length > 0) {
    const currentRecords = getStoredAttendanceRecords();
    const mergedMap = new Map<string, Attendance>();

    // Put current records in map
    currentRecords.forEach((r) => {
      mergedMap.set(r.id, r);
    });
    // Overlay authoritative server records
    records.forEach((r) => {
      mergedMap.set(r.id, r);
    });

    const mergedList = Array.from(mergedMap.values()).sort((a, b) => {
      const timeA = new Date(a.check_in || a.created_at || a.work_date).getTime();
      const timeB = new Date(b.check_in || b.created_at || b.work_date).getTime();
      return timeB - timeA;
    });

    try {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(mergedList));
    } catch {}
  }

  // 2. Build or update live status map with strict server authority
  if (statusMap && typeof statusMap === 'object') {
    let liveMap: LocalAttendanceMap = {};
    try {
      const raw = localStorage.getItem(LIVE_STATUS_KEY);
      if (raw) {
        liveMap = JSON.parse(raw) || {};
      }
    } catch {}

    const currentRecords = getStoredAttendanceRecords();
    let recordsModified = false;

    pool.forEach((emp) => {
      const empId = emp.id;

      // CRITICAL SAFETY LOCK: Preserve local offline action if queued in outbox!
      if (pendingClockEmps.has(empId)) {
        return;
      }

      const serverItem = statusMap[empId];
      if (serverItem && serverItem.status) {
        liveMap[empId] = {
          status: serverItem.status,
          check_in: serverItem.check_in,
          check_out: serverItem.check_out,
          work_date: today,
          updated_at: new Date().toISOString(),
        };

        // Reconcile and close orphaned open records in cw_attendance_records
        if (serverItem.status === 'completed_shift' || serverItem.status === 'not_attended') {
          currentRecords.forEach((r) => {
            if (
              r.employee_id === empId &&
              (r.work_date === today || (r.check_in && r.check_in.slice(0, 10) === today)) &&
              !r.check_out
            ) {
              r.check_out = serverItem.check_out || new Date().toISOString();
              recordsModified = true;
            }
          });
        }
      } else {
        // If employee not active on server and has no existing today state, mark not_attended
        if (!liveMap[empId] || liveMap[empId].work_date !== today) {
          liveMap[empId] = {
            status: 'not_attended',
            work_date: today,
            updated_at: new Date().toISOString(),
          };
        }
      }
    });

    if (recordsModified) {
      try {
        localStorage.setItem(RECORDS_KEY, JSON.stringify(currentRecords));
      } catch {}
    }

    try {
      localStorage.setItem(LIVE_STATUS_KEY, JSON.stringify(liveMap));
    } catch {}
  }
};

/**
 * Get all current attendance records from localStorage for today.
 */
export const getLocalAttendanceMap = (employeesList?: Employee[]): LocalAttendanceMap => {
  const today = getTodayDateStr();
  const pool = (employeesList && employeesList.length > 0) ? employeesList : getCustomStoredEmployees();

  const isShiftValid = (shift: any) => {
    if (!shift || shift.status === 'closed') return false;
    const shiftStart = shift.shift_start || shift.created_at;
    if (!shiftStart) return true;
    const ageHours = (Date.now() - new Date(shiftStart).getTime()) / (1000 * 60 * 60);
    return ageHours < 24;
  };

  let activeCashier: { id: string; name?: string; role?: string; shift_start?: string } | null = null;
  try {
    if (typeof window !== 'undefined') {
      const cashierRaw = localStorage.getItem('pos_active_cashier');
      if (cashierRaw) {
        const parsedCashier = JSON.parse(cashierRaw);
        if (parsedCashier?.id && !isOwnerEmployee(parsedCashier) && isShiftValid(parsedCashier)) {
          activeCashier = parsedCashier;
        }
      }
      if (!activeCashier) {
        const syncedRaw = localStorage.getItem('cw_active_shift');
        if (syncedRaw) {
          const parsedSynced = JSON.parse(syncedRaw);
          const cashierId = parsedSynced?.cashier_id || parsedSynced?.id;
          if (cashierId && !isOwnerEmployee(parsedSynced) && isShiftValid(parsedSynced)) {
            activeCashier = {
              id: cashierId,
              name: parsedSynced.cashier_name || parsedSynced.name,
              role: parsedSynced.cashier_role || parsedSynced.role,
              shift_start: parsedSynced.shift_start,
            };
          }
        }
      }
    }
  } catch {}

  let map: LocalAttendanceMap = {};
  let hasValidTodayLogs = false;

  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(LIVE_STATUS_KEY);
      if (raw) {
        const parsed: LocalAttendanceMap = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const values = Object.values(parsed);
          if (values.length > 0 && values.some((r) => r && r.work_date === today)) {
            map = parsed;
            hasValidTodayLogs = true;
          }
        }
      }
    }
  } catch {}

  if (!hasValidTodayLogs) {
    map = {};
    pool.forEach((emp) => {
      map[emp.id] = {
        status: 'not_attended',
        work_date: today,
        updated_at: new Date().toISOString(),
      };
    });

    // Cross-reference today's attendance records from cw_attendance_records only if no verified today live logs
    try {
      const rawRecords = typeof window !== 'undefined' ? localStorage.getItem(RECORDS_KEY) : null;
      if (rawRecords) {
        const parsedRecords: Attendance[] = JSON.parse(rawRecords);
        if (Array.isArray(parsedRecords)) {
          const todayRecs = parsedRecords.filter((r) => (r.work_date === today || (r.check_in && r.check_in.slice(0, 10) === today)) && r.employee_id);
          todayRecs.sort((a, b) => new Date(b.check_in || 0).getTime() - new Date(a.check_in || 0).getTime());
          
          const seen = new Set<string>();
          todayRecs.forEach((r) => {
            if (!seen.has(r.employee_id)) {
              seen.add(r.employee_id);
              if (!r.check_out) {
                map[r.employee_id] = {
                  status: 'active_shift',
                  check_in: r.check_in || map[r.employee_id]?.check_in || new Date().toISOString(),
                  work_date: today,
                  updated_at: new Date().toISOString(),
                };
              } else {
                map[r.employee_id] = {
                  status: 'completed_shift',
                  check_in: r.check_in,
                  check_out: r.check_out,
                  hours_worked: r.actual_hours,
                  work_date: today,
                  updated_at: new Date().toISOString(),
                };
              }
            }
          });
        }
      }
    } catch {}
  } else {
    // Ensure all pool employees are present in the map
    pool.forEach((emp) => {
      if (!map[emp.id]) {
        map[emp.id] = {
          status: 'not_attended',
          work_date: today,
          updated_at: new Date().toISOString(),
        };
      }
    });
  }

  // If active cashier exists with a verified open session, guarantee active_shift status
  if (activeCashier && activeCashier.id) {
    const existingRec = map[activeCashier.id];
    const shiftStart = activeCashier.shift_start || existingRec?.check_in || new Date().toISOString();

    if (!existingRec || existingRec.status !== 'active_shift' || existingRec.work_date !== today) {
      map[activeCashier.id] = {
        status: 'active_shift',
        check_in: existingRec?.check_in || shiftStart,
        work_date: today,
        updated_at: new Date().toISOString(),
      };
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(LIVE_STATUS_KEY, JSON.stringify(map));
        }
      } catch {}
    }
  }

  return map;
};

/**
 * Save attendance map to localStorage and dispatch reactive events
 */
export const saveLocalAttendanceMap = (map: LocalAttendanceMap): void => {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LIVE_STATUS_KEY, JSON.stringify(map));
      window.dispatchEvent(new CustomEvent('cw_attendance_updated', { detail: map }));
      window.dispatchEvent(new Event('cw_attendance_updated'));
      window.dispatchEvent(new Event('storage'));
    }
  } catch {}
};

/**
 * Auto Clock-In Cashier on POS unlock / login / load
 */
export const autoClockInCashier = (
  employee: { id?: string; cashier_id?: string; name?: string; cashier_name?: string; role?: string; cashier_role?: string; shift_start?: string },
  employeesList?: Employee[]
): void => {
  const empId = employee?.id || employee?.cashier_id;
  if (!empId) return;
  const empName = employee?.name || employee?.cashier_name || 'الكاشير';
  const empRole = employee?.role || employee?.cashier_role || 'كاشير';
  const today = getTodayDateStr();
  const pool = (employeesList && employeesList.length > 0) ? employeesList : getCustomStoredEmployees();
  const map = getLocalAttendanceMap(pool);
  const current = map[empId];

  const nowIso = employee.shift_start || new Date().toISOString();
  if (!current || current.status !== 'active_shift' || current.work_date !== today) {
    map[empId] = {
      status: 'active_shift',
      check_in: current?.check_in || nowIso,
      work_date: today,
      updated_at: nowIso,
    };
    saveLocalAttendanceMap(map);

    // Also register in historical records
    createOrUpdateAttendanceRecord(
      {
        employee_id: empId,
        work_date: today,
        check_in: current?.check_in || nowIso,
        notes: 'تسجيل دخول تلقائي عند فتح شاشة الكاشير',
      },
      pool
    );

    // Dispatch automated Telegram notification
    notifyEmployeeCheckIn(empName, empRole).catch(() => {});
  }
};

/**
 * Get detailed shift stats for an employee for today
 */
export const getEmployeeTodayShiftStats = (
  employeeId: string,
  employeesList?: Employee[]
): {
  completedShiftsCount: number;
  hasOpenShift: boolean;
  openShiftCheckIn?: string;
  nextShiftNumber: number;
  todayTotalHours: number;
} => {
  const today = getTodayDateStr();
  const records = getStoredAttendanceRecords({
    employee_id: employeeId,
    startDate: today,
    endDate: today,
  });

  let completedShiftsCount = 0;
  let hasOpenShift = false;
  let openShiftCheckIn: string | undefined = undefined;
  let todayTotalHours = 0;

  records.forEach((r) => {
    if (r.check_out) {
      completedShiftsCount++;
      todayTotalHours += Number(r.actual_hours) || 0;
    } else {
      hasOpenShift = true;
      openShiftCheckIn = r.check_in;
    }
  });

  return {
    completedShiftsCount,
    hasOpenShift,
    openShiftCheckIn,
    nextShiftNumber: completedShiftsCount + (hasOpenShift ? 0 : 1),
    todayTotalHours: Number(todayTotalHours.toFixed(2)),
  };
};

/**
 * Record clock-in or clock-out with multi-shift support and anti-duplication checks
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
  shift_number: number;
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
  const shiftStats = getEmployeeTodayShiftStats(employeeId, pool);

  if (action === 'check_in') {
    if (currentRecord.status === 'active_shift') {
      const checkInTime = currentRecord.check_in ? new Date(currentRecord.check_in).getTime() : 0;
      const elapsedHours = (now.getTime() - checkInTime) / (1000 * 60 * 60);
      if (elapsedHours > 16) {
        // Auto-close stale unclosed previous shift
        createOrUpdateAttendanceRecord(
          {
            employee_id: employeeId,
            work_date: currentRecord.work_date || today,
            check_in: currentRecord.check_in || new Date(now.getTime() - 8 * 3600 * 1000).toISOString(),
            check_out: new Date(checkInTime + 8 * 3600 * 1000).toISOString(),
            notes: 'إغلاق تلقائي لشفت معلق سابق',
          },
          pool
        );
      } else {
        throw new Error(`الموظف (${name}) مسجل حضور بالفعل بالوردية الحالية ولم يسجل انصراف بعد.`);
      }
    }

    const shiftNumber = shiftStats.completedShiftsCount + 1;

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
        notes: `تسجيل حضور الوردية (${shiftNumber}) عبر PIN في ${timeFormatted}`,
      },
      pool
    );

    // Dispatch automated Telegram notification
    notifyEmployeeCheckIn(name, emp?.role).catch(() => {});

    return {
      action: 'check_in',
      employee_name: name,
      time: now.toISOString(),
      shift_number: shiftNumber,
      message: `تم تسجيل حضور الوردية رقم (${shiftNumber}) بنجاح للموظف: ${name} في تمام الساعة ${timeFormatted}`,
    };
  } else {
    // Action: check_out
    const records = getStoredAttendanceRecords({ employee_id: employeeId, startDate: today });
    const openRecord = records.find((r) => !r.check_out);

    if (!openRecord && currentRecord.status !== 'active_shift') {
      throw new Error(`الموظف (${name}) غير مسجل حضور حالياً لإتمام الإنصراف.`);
    }

    const checkInDate = openRecord?.check_in
      ? new Date(openRecord.check_in)
      : currentRecord.check_in
      ? new Date(currentRecord.check_in)
      : new Date(now.getTime() - 8 * 3600 * 1000);

    const breakdown = computeShiftHoursBreakdown(checkInDate, now, emp);
    const shiftNumber = Math.max(shiftStats.completedShiftsCount + 1, 1);

    map[employeeId] = {
      status: 'completed_shift',
      check_in: checkInDate.toISOString(),
      check_out: now.toISOString(),
      hours_worked: breakdown.actualHours,
      work_date: today,
      updated_at: now.toISOString(),
    };

    saveLocalAttendanceMap(map);

    createOrUpdateAttendanceRecord(
      {
        id: openRecord?.id,
        employee_id: employeeId,
        work_date: today,
        check_in: checkInDate.toISOString(),
        check_out: now.toISOString(),
        notes: `تسجيل انصراف الوردية (${shiftNumber}) عبر PIN في ${timeFormatted}`,
      },
      pool
    );

    // Dispatch automated Telegram notification
    notifyEmployeeCheckOut(name, breakdown.actualHours).catch(() => {});

    return {
      action: 'check_out',
      employee_name: name,
      time: now.toISOString(),
      shift_number: shiftNumber,
      hours_worked: breakdown.actualHours,
      overtime_hours: breakdown.overtimeHours,
      deducted_hours: breakdown.deductedHours,
      message: `تم تسجيل إنهاء الوردية رقم (${shiftNumber}) بنجاح للموظف: ${name}. إجمالي ساعات العمل: ${breakdown.actualHours} ساعة ${
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

      const empName = emp?.name || empId;
      clockedOutNames.push(empName);
      notifyEmployeeCheckOut(empName, breakdown.actualHours).catch(() => {});
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

  notifyEmployeeCheckOut(emp?.name || cashierId, breakdown.actualHours).catch(() => {});
};

/**
 * Get active attended headcount (operational labor/staff with active_shift status)
 * Strictly excludes Owner ("مستر فتحي") to represent true operational staff
 */
export const getActiveAttendedHeadcount = (employeesList?: Employee[]): number => {
  const pool = (employeesList && employeesList.length > 0) ? employeesList : getCustomStoredEmployees();
  const operationalStaff = pool.filter((e) => !isOwnerEmployee(e));
  const map = getLocalAttendanceMap(operationalStaff);
  const activeIds = new Set<string>();

  Object.entries(map).forEach(([empId, r]) => {
    const isStaff = operationalStaff.some((e) => e.id === empId);
    if (isStaff && r && r.status === 'active_shift' && !r.check_out) {
      activeIds.add(empId);
    }
  });

  const isShiftValid = (shift: any) => {
    if (!shift || shift.status === 'closed') return false;
    const shiftStart = shift.shift_start || shift.created_at;
    if (!shiftStart) return true;
    const ageHours = (Date.now() - new Date(shiftStart).getTime()) / (1000 * 60 * 60);
    return ageHours < 24;
  };

  // Verify pos_active_cashier and cw_active_shift directly to guarantee active cashier is counted ONLY if strictly valid & open
  try {
    if (typeof window !== 'undefined') {
      const cashierRaw = localStorage.getItem('pos_active_cashier');
      if (cashierRaw) {
        const parsedCashier = JSON.parse(cashierRaw);
        const cashierId = parsedCashier?.cashier_id || parsedCashier?.id;
        if (cashierId && !isOwnerEmployee(parsedCashier) && isShiftValid(parsedCashier)) {
          if (operationalStaff.some((e) => e.id === cashierId)) {
            activeIds.add(cashierId);
          }
        }
      }
      const syncedRaw = localStorage.getItem('cw_active_shift');
      if (syncedRaw) {
        const parsedSynced = JSON.parse(syncedRaw);
        const cashierId = parsedSynced?.cashier_id || parsedSynced?.id;
        if (cashierId && !isOwnerEmployee(parsedSynced) && isShiftValid(parsedSynced)) {
          if (operationalStaff.some((e) => e.id === cashierId)) {
            activeIds.add(cashierId);
          }
        }
      }
    }
  } catch {}

  return activeIds.size;
};

/**
 * Get formatted status map for UI badges in ClockInOutModal, HR Table, and Attendance lists
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
    isOwner?: boolean;
  }
> => {
  const map = getLocalAttendanceMap(employeesList);
  const pool = (employeesList && employeesList.length > 0) ? employeesList : getCustomStoredEmployees();

  const isShiftValid = (shift: any) => {
    if (!shift || shift.status === 'closed') return false;
    const shiftStart = shift.shift_start || shift.created_at;
    if (!shiftStart) return true;
    const ageHours = (Date.now() - new Date(shiftStart).getTime()) / (1000 * 60 * 60);
    return ageHours < 24;
  };

  let activeCashierId: string | null = null;
  try {
    if (typeof window !== 'undefined') {
      const cashierRaw = localStorage.getItem('pos_active_cashier');
      if (cashierRaw) {
        const parsedCashier = JSON.parse(cashierRaw);
        if (parsedCashier?.id && !isOwnerEmployee(parsedCashier) && isShiftValid(parsedCashier)) {
          activeCashierId = parsedCashier.id;
        }
      }
      if (!activeCashierId) {
        const syncedRaw = localStorage.getItem('cw_active_shift');
        if (syncedRaw) {
          const parsedSynced = JSON.parse(syncedRaw);
          const cid = parsedSynced?.cashier_id || parsedSynced?.id;
          if (cid && !isOwnerEmployee(parsedSynced) && isShiftValid(parsedSynced)) {
            activeCashierId = cid;
          }
        }
      }
    }
  } catch {}

  const result: Record<string, any> = {};

  pool.forEach((emp) => {
    if (isOwnerEmployee(emp)) {
      result[emp.id] = {
        status: 'completed_shift',
        label: 'إدارة المنشأة والملكية 👑',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        isOwner: true,
      };
      return;
    }

    let record = map[emp.id];

    if (activeCashierId && emp.id === activeCashierId && (!record || record.status !== 'active_shift')) {
      record = {
        status: 'active_shift',
        check_in: record?.check_in || new Date().toISOString(),
        work_date: getTodayDateStr(),
        updated_at: new Date().toISOString(),
      };
    } else if (!record) {
      record = { status: 'not_attended', work_date: getTodayDateStr(), updated_at: '' };
    }

    if (record?.status === 'active_shift') {
      result[emp.id] = {
        status: 'active_shift',
        label: 'حاضر الآن (شفت نشط) 🟢',
        badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        check_in: record.check_in,
        isOwner: false,
      };
    } else if (record?.status === 'completed_shift') {
      result[emp.id] = {
        status: 'completed_shift',
        label: 'انصرف اليوم ⚪',
        badgeColor: 'bg-slate-700/50 text-slate-300 border-slate-600',
        check_in: record.check_in,
        check_out: record.check_out,
        isOwner: false,
      };
    } else {
      result[emp.id] = {
        status: 'not_attended',
        label: 'غير حاضر اليوم ❌',
        badgeColor: 'bg-rose-500/10 text-rose-300/80 border-rose-500/20',
        isOwner: false,
      };
    }
  });

  return result;
};

/**
 * Purge stale/ghost attendance records from cw_attendance_records and LIVE_STATUS_KEY (> 24 hours old)
 * and auto-close orphaned open shifts from previous days.
 */
export const purgeStaleAttendanceRecords = (maxAgeHours = 24): number => {
  if (typeof window === 'undefined') return 0;
  const today = getTodayDateStr();
  const now = Date.now();
  let purgedCount = 0;

  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (raw) {
      const records: Attendance[] = JSON.parse(raw);
      if (Array.isArray(records)) {
        const updated = records.filter((r) => {
          const recordTime = new Date(r.check_in || r.work_date || r.created_at || 0).getTime();
          const ageHours = (now - recordTime) / (1000 * 60 * 60);

          // Auto-close open records from previous days
          if (!r.check_out && r.work_date && r.work_date < today) {
            r.check_out = new Date(recordTime + 8 * 3600 * 1000).toISOString();
            purgedCount++;
            return true;
          }
          // Remove corrupted/phantom records older than 30 days without date
          if (ageHours > 24 * 30 && !r.work_date) {
            purgedCount++;
            return false;
          }
          return true;
        });

        localStorage.setItem(RECORDS_KEY, JSON.stringify(updated));
      }
    }
  } catch {}

  return purgedCount;
};

