import type { ScheduleMode, Holiday } from './types';

/**
 * Fixed annual holidays (MM-DD)
 * 12/25: Christmas
 * 01/01: New Year's Day
 */
export const FIXED_ANNUAL_HOLIDAYS = ['12-25', '01-01'];

/**
 * Parse YYYY-MM-DD into a UTC Date object to avoid any timezone shifts
 */
export function parseUTCDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split('T')[0].split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Format UTC Date object into YYYY-MM-DD
 */
export function formatUTCDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Check if date is a Saturday (6) or Sunday (0)
 */
export function isWeekend(dateStr: string): boolean {
  const d = parseUTCDate(dateStr);
  if (!d) return false;
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Check if date matches fixed annual holidays (12/25, 01/01)
 */
export function isAnnualFixedHoliday(dateStr: string): boolean {
  if (!dateStr) return false;
  const parts = dateStr.split('-');
  if (parts.length < 3) return false;
  const md = `${parts[1]}-${parts[2]}`;
  return FIXED_ANNUAL_HOLIDAYS.includes(md);
}

/**
 * Check if date is in custom holidays list
 */
export function isCustomHoliday(dateStr: string, customHolidays: (Holiday | string)[] = []): boolean {
  if (!dateStr || !customHolidays || customHolidays.length === 0) return false;
  return customHolidays.some(h => {
    const dStr = typeof h === 'string' ? h : h.date;
    return dStr === dateStr;
  });
}

/**
 * Get holiday name/description if applicable
 */
export function getHolidayLabel(dateStr: string, customHolidays: (Holiday | string)[] = []): string | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const md = `${parts[1]}-${parts[2]}`;
    if (md === '12-25') return '聖誕節 (12/25)';
    if (md === '01-01') return '元旦 (01/01)';
  }
  const custom = customHolidays.find(h => (typeof h === 'string' ? h === dateStr : h.date === dateStr));
  if (custom) {
    return typeof custom === 'string' ? '自訂假日' : (custom.name || '自訂假日');
  }
  const d = parseUTCDate(dateStr);
  if (d) {
    const day = d.getUTCDay();
    if (day === 0) return '週日';
    if (day === 6) return '週六';
  }
  return null;
}

/**
 * Determine if a date is a non-working day under the given scheduleMode
 */
export function isNonWorkingDay(
  dateStr: string,
  customHolidays: (Holiday | string)[] = [],
  scheduleMode: ScheduleMode = 'working'
): boolean {
  if (scheduleMode === 'calendar') {
    return false; // In calendar mode, every day is a working day
  }
  // In working days mode: weekends, fixed holidays (12/25, 1/1), and custom holidays are non-working days
  return isWeekend(dateStr) || isAnnualFixedHoliday(dateStr) || isCustomHoliday(dateStr, customHolidays);
}

/**
 * If the date is a non-working day, advance forward to the next working day.
 * If it's already a working day, return as is.
 */
export function findNextWorkingDay(
  dateStr: string,
  customHolidays: (Holiday | string)[] = [],
  scheduleMode: ScheduleMode = 'working'
): string {
  if (scheduleMode === 'calendar') return dateStr;
  let cur = parseUTCDate(dateStr);
  if (!cur) return dateStr;

  let str = formatUTCDate(cur);
  let guard = 0;
  while (isNonWorkingDay(str, customHolidays, scheduleMode) && guard < 1000) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    str = formatUTCDate(cur);
    guard++;
  }
  return str;
}

/**
 * Add N working days (or calendar days) to a starting date
 * Note: If workDays = 0, returns the start date (or next working day if on holiday).
 */
export function addWorkingDays(
  startDateStr: string,
  workDays: number,
  customHolidays: (Holiday | string)[] = [],
  scheduleMode: ScheduleMode = 'working'
): string {
  if (!startDateStr) return startDateStr;
  if (scheduleMode === 'calendar') {
    const d = parseUTCDate(startDateStr);
    if (!d) return startDateStr;
    d.setUTCDate(d.getUTCDate() + Math.round(workDays));
    return formatUTCDate(d);
  }

  // Working days mode:
  let cur = parseUTCDate(startDateStr);
  if (!cur) return startDateStr;

  // If start falls on holiday/weekend, move to first valid working day
  let curStr = formatUTCDate(cur);
  while (isNonWorkingDay(curStr, customHolidays, scheduleMode)) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    curStr = formatUTCDate(cur);
  }

  let remaining = Math.round(workDays);
  const step = remaining >= 0 ? 1 : -1;
  remaining = Math.abs(remaining);

  while (remaining > 0) {
    cur.setUTCDate(cur.getUTCDate() + step);
    curStr = formatUTCDate(cur);
    if (!isNonWorkingDay(curStr, customHolidays, scheduleMode)) {
      remaining--;
    }
  }

  return curStr;
}

/**
 * Subtract N working days (or calendar days) from a target date
 */
export function subtractWorkingDays(
  targetDateStr: string,
  days: number,
  customHolidays: (Holiday | string)[] = [],
  scheduleMode: ScheduleMode = 'working'
): string {
  if (!targetDateStr || days <= 0) return targetDateStr;

  if (scheduleMode === 'calendar') {
    const d = parseUTCDate(targetDateStr);
    if (!d) return targetDateStr;
    d.setUTCDate(d.getUTCDate() - Math.round(days));
    return formatUTCDate(d);
  }

  // Working days mode:
  let cur = parseUTCDate(targetDateStr);
  if (!cur) return targetDateStr;

  let remaining = Math.round(days);
  while (remaining > 0) {
    cur.setUTCDate(cur.getUTCDate() - 1);
    const curStr = formatUTCDate(cur);
    if (!isNonWorkingDay(curStr, customHolidays, scheduleMode)) {
      remaining--;
    }
  }

  return formatUTCDate(cur);
}

/**
 * Count working days from start date to target date (targetDate - startDate in working days)
 */
export function countWorkingDaysBetween(
  startDateStr: string,
  targetDateStr: string,
  customHolidays: (Holiday | string)[] = [],
  scheduleMode: ScheduleMode = 'working'
): number {
  if (!startDateStr || !targetDateStr) return 0;
  if (scheduleMode === 'calendar') {
    return getCalendarDayDifference(startDateStr, targetDateStr);
  }

  const d1 = parseUTCDate(startDateStr);
  const d2 = parseUTCDate(targetDateStr);
  if (!d1 || !d2) return 0;

  if (d1.getTime() === d2.getTime()) return 0;

  const isForward = d2.getTime() > d1.getTime();
  let cur = new Date(d1.getTime());
  let count = 0;

  while ((isForward && cur.getTime() < d2.getTime()) || (!isForward && cur.getTime() > d2.getTime())) {
    cur.setUTCDate(cur.getUTCDate() + (isForward ? 1 : -1));
    const curStr = formatUTCDate(cur);
    if (!isNonWorkingDay(curStr, customHolidays, scheduleMode)) {
      count += isForward ? 1 : -1;
    }
  }

  return count;
}

/**
 * Calculate task start and finish dates from projectStartDate and CPM offsets
 *
 * In CPM:
 * - earlyStart is the number of working days after project start.
 * - duration is the number of working days the task takes.
 *
 * Examples (Working Days mode):
 * - Project start = Friday 2026-09-04
 * - Task 1 (earlyStart = 0, duration = 1):
 *   -> startDate = Friday 2026-09-04
 *   -> finishDate = Friday 2026-09-04 (1 day completed on Friday)
 * - Task 2 (earlyStart = 1, duration = 2, predecessor is Task 1):
 *   -> startDate = Monday 2026-09-07 (next working day after Friday)
 *   -> finishDate = Tuesday 2026-09-08 (2 days: Mon + Tue)
 * - Milestone (duration = 0):
 *   -> finishDate = startDate
 */
export function calculateTaskDates(
  projectStartDate: string,
  earlyStartDays: number,
  durationDays: number,
  customHolidays: (Holiday | string)[] = [],
  scheduleMode: ScheduleMode = 'working'
): { startDate: string; finishDate: string } {
  if (!projectStartDate) {
    return { startDate: '', finishDate: '' };
  }

  if (scheduleMode === 'calendar') {
    const startD = parseUTCDate(projectStartDate);
    if (!startD) return { startDate: '', finishDate: '' };
    
    startD.setUTCDate(startD.getUTCDate() + Math.round(earlyStartDays));
    const startStr = formatUTCDate(startD);

    if (durationDays <= 0) {
      return { startDate: startStr, finishDate: startStr };
    }

    const finishD = parseUTCDate(startStr);
    if (!finishD) return { startDate: startStr, finishDate: startStr };
    // A 1 calendar-day task starts and finishes on the same day
    finishD.setUTCDate(finishD.getUTCDate() + Math.max(0, Math.round(durationDays) - 1));
    const finishStr = formatUTCDate(finishD);

    return { startDate: startStr, finishDate: finishStr };
  }

  // Working Days Mode:
  // 1. Determine Project First Working Day
  const projFirstWorkDay = findNextWorkingDay(projectStartDate, customHolidays, scheduleMode);

  // 2. Determine Task Start Date by stepping forward `earlyStartDays` working days
  const taskStartDate = earlyStartDays <= 0
    ? projFirstWorkDay
    : addWorkingDays(projFirstWorkDay, earlyStartDays, customHolidays, scheduleMode);

  // 3. Determine Task Finish Date
  if (durationDays <= 0) {
    // Milestone
    return { startDate: taskStartDate, finishDate: taskStartDate };
  }

  // A 1-day task finishes on its start date (0 additional working days).
  // An N-day task finishes after (N - 1) additional working days.
  const additionalDays = Math.max(0, Math.round(durationDays) - 1);
  const taskFinishDate = additionalDays === 0
    ? taskStartDate
    : addWorkingDays(taskStartDate, additionalDays, customHolidays, scheduleMode);

  return { startDate: taskStartDate, finishDate: taskFinishDate };
}

/**
 * Calculate the number of calendar days between two YYYY-MM-DD dates
 * (targetDate - startDate)
 */
export function getCalendarDayDifference(startDateStr: string, targetDateStr: string): number {
  const d1 = parseUTCDate(startDateStr);
  const d2 = parseUTCDate(targetDateStr);
  if (!d1 || !d2) return 0;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((d2.getTime() - d1.getTime()) / msPerDay);
}
