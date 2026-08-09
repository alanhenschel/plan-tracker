/**
 * Month utilities. A "month" is always the string `YYYY-MM`.
 *
 * Why a string and not a Date: months are compared, ranged and grouped far more
 * often than they are arithmetic'd, and `YYYY-MM` sorts lexicographically in the
 * exact same order it sorts chronologically. It also sidesteps every timezone
 * bug class where `new Date('2026-01')` lands in the previous month for users
 * west of UTC.
 *
 * Pure module: no DB, no framework imports.
 */

export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_REGEX.test(value);
}

/** Throws with a descriptive message instead of returning a boolean. */
export function assertValidMonth(value: unknown, label = 'month'): string {
  if (!isValidMonth(value)) {
    throw new Error(`Invalid ${label}: expected format YYYY-MM, received ${JSON.stringify(value)}`);
  }
  return value;
}

function splitMonth(month: string): { year: number; monthIndex: number } {
  assertValidMonth(month);
  const [year, monthPart] = month.split('-');
  return { year: Number(year), monthIndex: Number(monthPart) };
}

function joinMonth(year: number, monthIndex: number): string {
  return `${String(year).padStart(4, '0')}-${String(monthIndex).padStart(2, '0')}`;
}

/** Next calendar month. `addMonths('2026-12', 1) === '2027-01'`. */
export function addMonths(month: string, delta: number): string {
  const { year, monthIndex } = splitMonth(month);
  // Work in zero-based month space so modulo arithmetic behaves for negatives.
  const total = year * 12 + (monthIndex - 1) + delta;
  const newYear = Math.floor(total / 12);
  const newMonthIndex = total - newYear * 12 + 1;
  return joinMonth(newYear, newMonthIndex);
}

/**
 * Inclusive list of months between `from` and `to`.
 * Returns `[]` when the range is inverted rather than looping forever.
 */
export function monthsInRange(from: string, to: string): string[] {
  assertValidMonth(from, 'from');
  assertValidMonth(to, 'to');
  if (from > to) return [];

  const out: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return out;
}

/** `quarterToMonths(2026, 1) === ['2026-01','2026-02','2026-03']`. */
export function quarterToMonths(year: number, quarter: number): string[] {
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    throw new Error(`Invalid quarter: expected 1-4, received ${quarter}`);
  }
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new Error(`Invalid year: expected a 4-digit year, received ${year}`);
  }
  const first = (quarter - 1) * 3 + 1;
  return [0, 1, 2].map((offset) => joinMonth(year, first + offset));
}

/** The quarter a month falls in, 1-4. */
export function monthToQuarter(month: string): number {
  const { monthIndex } = splitMonth(month);
  return Math.floor((monthIndex - 1) / 3) + 1;
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** `'2026-01'` → `'Jan 2026'`. Display only. */
export function formatMonthLabel(month: string): string {
  if (!isValidMonth(month)) return month;
  const { year, monthIndex } = splitMonth(month);
  return `${MONTH_LABELS[monthIndex - 1]} ${year}`;
}

/** Current month in `YYYY-MM`, computed from local time. */
export function currentMonth(now: Date = new Date()): string {
  return joinMonth(now.getFullYear(), now.getMonth() + 1);
}
