/**
 * Timezone-safe local calendar date utilities for Egyptian Car Wash ERP & POS.
 * Prevents UTC day-shifting offsets (e.g. Cairo UTC+3 vs UTC midnight).
 */

/**
 * Returns YYYY-MM-DD representing the local calendar date of the provided Date object (defaults to now).
 */
export function toLocalISODate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the first calendar day of the month for a given Date (or current month) in YYYY-MM-DD format.
 */
export function getFirstDayOfMonth(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Returns the next calendar day string in YYYY-MM-DD format based on local dates.
 */
export function getNextCalendarDay(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day + 1);
  return toLocalISODate(d);
}

/**
 * Resolves year/month inputs into standard query bounds:
 * - startDateTz: 'YYYY-MM-01 00:00:00+00'
 * - startDate: 'YYYY-MM-01'
 * - periodLabel: 'YYYY-MM'
 */
export function getMonthRangeParams(year?: number, month?: number): {
  startDateTz: string;
  startDate: string;
  periodLabel: string;
  targetYear: number;
  targetMonth: number;
} {
  const now = new Date();
  const targetYear = Number(year) || now.getFullYear();
  const targetMonth = Number(month) || now.getMonth() + 1;
  const monthPadded = String(targetMonth).padStart(2, '0');

  return {
    startDateTz: `${targetYear}-${monthPadded}-01 00:00:00+00`,
    startDate: `${targetYear}-${monthPadded}-01`,
    periodLabel: `${targetYear}-${monthPadded}`,
    targetYear,
    targetMonth,
  };
}

