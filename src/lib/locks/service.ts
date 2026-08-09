import type { Types } from 'mongoose';
import { Lock } from '@/lib/db/models/Lock';

/**
 * Period locking.
 *
 * Granularity is MONTH. Rationale (also in the README): `month` is already the
 * atomic unit of Plan and Actual, so month-locking needs no second abstraction.
 * A "Lock Quarter" button in the UI simply issues three month locks, which
 * keeps the UX without adding a second locking model to build, test and reason
 * about - and it stays correct if fiscal quarters are ever added, since fiscal
 * quarters do not line up with calendar quarters.
 *
 * `isMonthLocked` is pure so it can be unit-tested and reused client-side;
 * `assertMonthUnlocked` is the DB-backed guard every mutating route calls.
 */

/** Thrown when a write targets a closed period. Routes map this to HTTP 423. */
export class LockedPeriodError extends Error {
  readonly month: string;

  constructor(month: string) {
    super(`Period ${month} is locked. Unlock it before editing plans or actuals.`);
    this.name = 'LockedPeriodError';
    this.month = month;
  }
}

/** PURE - no DB. `lockedMonths` is any iterable of YYYY-MM strings. */
export function isMonthLocked(month: string, lockedMonths: Iterable<string>): boolean {
  if (lockedMonths instanceof Set) return lockedMonths.has(month);
  for (const locked of lockedMonths) {
    if (locked === month) return true;
  }
  return false;
}

/** PURE - true when ANY of the given months is locked. */
export function anyMonthLocked(months: Iterable<string>, lockedMonths: Iterable<string>): boolean {
  const lockedSet = lockedMonths instanceof Set ? lockedMonths : new Set(lockedMonths);
  for (const month of months) {
    if (lockedSet.has(month)) return true;
  }
  return false;
}

/** Locked months for this user within an inclusive YYYY-MM range. */
export async function getLockedMonths(
  userId: Types.ObjectId,
  from: string,
  to: string,
): Promise<string[]> {
  const locks = await Lock.find({ userId, month: { $gte: from, $lte: to } })
    .select('month')
    .lean();
  return locks.map((l) => l.month);
}

/** Locked months for this user out of an explicit list (used by CSV import). */
export async function getLockedMonthsIn(
  userId: Types.ObjectId,
  months: readonly string[],
): Promise<Set<string>> {
  if (months.length === 0) return new Set();
  const unique = [...new Set(months)];
  const locks = await Lock.find({ userId, month: { $in: unique } })
    .select('month')
    .lean();
  return new Set(locks.map((l) => l.month));
}

export async function isMonthLockedInDb(
  userId: Types.ObjectId,
  month: string,
): Promise<boolean> {
  const existing = await Lock.exists({ userId, month });
  return existing !== null;
}

/**
 * The server-side lock gate. Every plan/actual mutation calls this BEFORE
 * writing. Hiding buttons in the UI is not enforcement - this is.
 */
export async function assertMonthUnlocked(
  userId: Types.ObjectId,
  month: string,
): Promise<void> {
  if (await isMonthLockedInDb(userId, month)) {
    throw new LockedPeriodError(month);
  }
}

/**
 * Guards a move between months (e.g. editing an actual's month): both the
 * source and destination period must be open, otherwise a user could shift
 * spend out of a closed period.
 */
export async function assertMonthsUnlocked(
  userId: Types.ObjectId,
  months: readonly string[],
): Promise<void> {
  const locked = await getLockedMonthsIn(userId, months);
  for (const month of months) {
    if (locked.has(month)) throw new LockedPeriodError(month);
  }
}
