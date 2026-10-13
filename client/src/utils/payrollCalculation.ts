import { Employee, PayrollCalculation, AccruedPayrollSummary } from '../types/index.js';
import { FALLBACK_EMPLOYEES } from '../api/mockFallbacks.js';
import {
  getCustomStoredEmployees,
  getStoredAttendanceRecords,
  getEmployeeStandardDailyHours,
  computeShiftHoursBreakdown,
  isOwnerEmployee,
} from './attendanceStorage.js';
import { getStoredTransactions, getStoredPayouts } from './transactionStorage.js';

/**
 * Single Source of Truth for calculating live employee payroll & settlement.
 * Used by both HR Settlement Modal (hrApi.calculatePayroll) and P&L Summary (expenseStorage).
 */
export const calculateLocalEmployeePayroll = (
  employeeId: string,
  params?: { startDate?: string; endDate?: string }
): PayrollCalculation => {
  const storedEmployees = getCustomStoredEmployees();
  const emp = storedEmployees.find((e) => e.id === employeeId) || FALLBACK_EMPLOYEES[0];

  const now = new Date();
  const start = params?.startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = params?.endDate || now.toISOString().slice(0, 10);

  const standardDailyHours = getEmployeeStandardDailyHours(emp);
  const hourlyRate = Number(emp.hourly_rate) || 35.0;
  const customOvertimeRate =
    emp.overtime_hourly_rate && Number(emp.overtime_hourly_rate) > 0
      ? Number(emp.overtime_hourly_rate)
      : hourlyRate;

  // 1. Fetch attendance records in period
  const attendanceRecords = getStoredAttendanceRecords({
    employee_id: employeeId,
    startDate: start,
    endDate: end,
  });

  let totalHoursWorked = 0;
  let totalOvertimeHours = 0;
  let totalDeductedHours = 0;
  const attendanceDays = attendanceRecords.length;

  attendanceRecords.forEach((att) => {
    let hours = Number(att.actual_hours) || 0;
    let overtime = Number(att.overtime_hours) || 0;
    let deducted = Number(att.deducted_hours) || 0;

    // Guard: If record was unclosed or hours exceeded 16h single shift
    if (!att.check_out && att.check_in) {
      const breakdown = computeShiftHoursBreakdown(att.check_in, null, emp);
      hours = breakdown.actualHours;
      overtime = breakdown.overtimeHours;
      deducted = breakdown.deductedHours;
    } else if (hours > 16) {
      // Clamped to standard single shift
      hours = standardDailyHours;
      overtime = 0;
      deducted = 0;
    }

    totalHoursWorked += hours;
    totalOvertimeHours += overtime;
    totalDeductedHours += deducted;
  });

  totalHoursWorked = Number(totalHoursWorked.toFixed(2));
  totalOvertimeHours = Number(totalOvertimeHours.toFixed(2));
  totalDeductedHours = Number(totalDeductedHours.toFixed(2));

  // 2. Paid weekly off calculation
  let paidWeeklyOffDays = 0;
  if (emp.is_paid_weekly_off) {
    const WEEKDAY_NAMES: Record<string, number> = {
      'الأحد': 0,
      'الإثنين': 1,
      'الثلاثاء': 2,
      'الأربعاء': 3,
      'الخميس': 4,
      'الجمعة': 5,
      'السبت': 6,
    };
    const offDayIdx = WEEKDAY_NAMES[emp.weekly_off_day || 'الجمعة'] ?? 5;
    const attendedDates = new Set(attendanceRecords.map((a) => a.work_date));

    const [sY, sM, sD] = start.split('-').map(Number);
    const [eY, eM, eD] = end.split('-').map(Number);
    const cur = new Date(sY, sM - 1, sD);
    const stop = new Date(eY, eM - 1, eD);

    while (cur <= stop) {
      if (cur.getDay() === offDayIdx) {
        const curStr = cur.toISOString().slice(0, 10);
        if (!attendedDates.has(curStr)) {
          paidWeeklyOffDays++;
        }
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  const paidWeeklyOffHours = Number((paidWeeklyOffDays * standardDailyHours).toFixed(2));
  const paidWeeklyOffAmount = Number((paidWeeklyOffHours * hourlyRate).toFixed(2));
  const attendedHoursAmount = Number((totalHoursWorked * hourlyRate).toFixed(2));
  const baseSalaryAmount = Number((attendedHoursAmount + paidWeeklyOffAmount).toFixed(2));
  const overtimeAmount = Number((totalOvertimeHours * customOvertimeRate).toFixed(2));

  // 3. Transactions (bonuses, deductions, advances)
  const pendingTrans = getStoredTransactions({
    employee_id: employeeId,
    status: 'pending',
    startDate: start,
    endDate: end,
  });

  let bonusesAmount = 0;
  let penaltyDeductionsAmount = 0;
  let advancesDeducted = 0;

  pendingTrans.forEach((t) => {
    if (t.type === 'bonus') bonusesAmount += Number(t.amount) || 0;
    if (t.type === 'deduction') penaltyDeductionsAmount += Number(t.amount) || 0;
    if (t.type === 'advance') advancesDeducted += Number(t.amount) || 0;
  });

  bonusesAmount = Number(bonusesAmount.toFixed(2));
  penaltyDeductionsAmount = Number(penaltyDeductionsAmount.toFixed(2));
  advancesDeducted = Number(advancesDeducted.toFixed(2));

  const hoursDeductionAmount = Number((totalDeductedHours * hourlyRate).toFixed(2));
  const totalDeductionsAmount = Number((hoursDeductionAmount + penaltyDeductionsAmount).toFixed(2));

  const netPayable = Number(
    (
      attendedHoursAmount +
      paidWeeklyOffAmount +
      overtimeAmount +
      bonusesAmount -
      (totalDeductionsAmount + advancesDeducted)
    ).toFixed(2)
  );

  const isDebt = netPayable < 0;
  const carriedDebtAmount = isDebt ? Math.abs(netPayable) : 0;

  return {
    employee: {
      id: emp.id,
      name: emp.name,
      role: emp.role,
      hourly_rate: hourlyRate,
      overtime_hourly_rate: customOvertimeRate,
      target_weekly_days: emp.target_weekly_days || 6,
      target_weekly_hours: emp.target_weekly_hours || 48,
      weekly_off_day: emp.weekly_off_day || 'الجمعة',
      is_paid_weekly_off: Boolean(emp.is_paid_weekly_off),
      pin_code: emp.pin_code,
    },
    period: {
      start,
      end,
    },
    work_metrics: {
      attendance_days: attendanceDays,
      total_hours_worked: totalHoursWorked,
      paid_weekly_off_days: paidWeeklyOffDays,
      paid_weekly_off_hours: paidWeeklyOffHours,
      total_overtime_hours: totalOvertimeHours,
      total_deducted_hours: totalDeductedHours,
    },
    financial_breakdown: {
      attended_hours_amount: attendedHoursAmount,
      paid_weekly_off_amount: paidWeeklyOffAmount,
      base_salary_amount: baseSalaryAmount,
      overtime_amount: overtimeAmount,
      effective_overtime_rate: customOvertimeRate,
      bonuses_amount: bonusesAmount,
      hours_deduction_amount: hoursDeductionAmount,
      penalty_deductions_amount: penaltyDeductionsAmount,
      deductions_amount: totalDeductionsAmount,
      advances_deducted: advancesDeducted,
      net_payable_salary: netPayable,
      is_debt: isDebt,
      carried_debt_amount: carriedDebtAmount,
    },
    pending_transactions: pendingTrans,
  };
};

/**
 * Single Source of Truth for calculating aggregated real-time payroll liability and staff debts.
 * Evaluates all operational staff through calculateLocalEmployeePayroll.
 */
export const calculateAccruedPayrollSummary = (
  year?: number,
  month?: number,
  options?: {
    startDate?: string;
    endDate?: string;
    employeesList?: Employee[];
  }
): AccruedPayrollSummary => {
  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month || now.getMonth() + 1;

  const isCurrentMonth = targetYear === now.getFullYear() && targetMonth === now.getMonth() + 1;
  const hasCustomDates = Boolean(options?.startDate || options?.endDate);

  let effectiveStart = options?.startDate || `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  let effectiveEnd = options?.endDate || (isCurrentMonth
    ? now.toISOString().slice(0, 10)
    : `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);

  const allEmployees = options?.employeesList || getCustomStoredEmployees();
  const operationalEmployees = allEmployees.filter(
    (e) => e.status !== 'inactive' && !isOwnerEmployee(e)
  );

  let totalAccruedPayable = 0;
  let totalPendingDebts = 0;
  let totalAccruedBase = 0;
  let totalAccruedOvertime = 0;
  let totalAccruedBonuses = 0;
  let totalAccruedDeductions = 0;
  let totalAdvancesDeducted = 0;
  const breakdowns: PayrollCalculation[] = [];

  operationalEmployees.forEach((emp) => {
    // For active unfinalized cycle, call calculateLocalEmployeePayroll without artificial date clamping
    // to guarantee 100% exact parity with the employee settlement modal.
    const calcParams = hasCustomDates
      ? { startDate: options?.startDate, endDate: options?.endDate }
      : (!isCurrentMonth ? { startDate: effectiveStart, endDate: effectiveEnd } : undefined);

    const calc = calculateLocalEmployeePayroll(emp.id, calcParams);
    breakdowns.push(calc);

    if (calc.period?.start) effectiveStart = calc.period.start;
    if (calc.period?.end) effectiveEnd = calc.period.end;

    const net = calc.financial_breakdown.net_payable_salary;
    if (net > 0) {
      totalAccruedPayable += net;
    } else if (net < 0) {
      totalPendingDebts += Math.abs(net);
    }

    totalAccruedBase += calc.financial_breakdown.base_salary_amount;
    totalAccruedOvertime += calc.financial_breakdown.overtime_amount;
    totalAccruedBonuses += calc.financial_breakdown.bonuses_amount;
    totalAccruedDeductions += calc.financial_breakdown.deductions_amount;
    totalAdvancesDeducted += calc.financial_breakdown.advances_deducted;
  });

  // Calculate actual disbursed payouts for this period
  const payouts = getStoredPayouts();
  const monthlyPayouts = payouts.filter((p) => {
    const d = p.payment_date || p.created_at;
    if (!d) return false;
    const dateObj = new Date(d);
    return dateObj.getFullYear() === targetYear && dateObj.getMonth() + 1 === targetMonth;
  });

  const disbursedSalaries = Number(
    monthlyPayouts.reduce((sum, p) => sum + (Number(p.net_paid) || 0), 0).toFixed(2)
  );
  const unpaidAccrued = Math.max(0, Number((totalAccruedPayable - disbursedSalaries).toFixed(2)));

  return {
    period: {
      year: targetYear,
      month: targetMonth,
      start: effectiveStart,
      end: effectiveEnd,
    },
    total_operational_staff: operationalEmployees.length || 4,
    total_accrued_payable: Number(totalAccruedPayable.toFixed(2)),
    total_pending_debts: Number(totalPendingDebts.toFixed(2)),
    total_accrued_base: Number(totalAccruedBase.toFixed(2)),
    total_accrued_overtime: Number(totalAccruedOvertime.toFixed(2)),
    total_accrued_bonuses: Number(totalAccruedBonuses.toFixed(2)),
    total_accrued_deductions: Number(totalAccruedDeductions.toFixed(2)),
    total_advances_deducted: Number(totalAdvancesDeducted.toFixed(2)),
    disbursed_salaries: disbursedSalaries,
    disbursed_payouts_count: monthlyPayouts.length,
    unpaid_accrued_salaries: unpaidAccrued,
    individual_breakdowns: breakdowns,
  };
};
