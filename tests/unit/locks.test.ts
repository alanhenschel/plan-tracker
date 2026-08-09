import { describe, expect, it } from 'vitest';
import { LockedPeriodError, anyMonthLocked, isMonthLocked } from '@/lib/locks/service';

/**
 * The pure half of the lock service. The DB-backed guards
 * (`assertMonthUnlocked`, `getLockedMonths`) are covered by the integration
 * suite, which asserts the HTTP 423 and that the document is left unchanged.
 */

describe('isMonthLocked', () => {
  it('is true when the month is in the locked set', () => {
    expect(isMonthLocked('2026-01', new Set(['2026-01', '2026-02']))).toBe(true);
  });

  it('is false when the month is not locked', () => {
    expect(isMonthLocked('2026-03', new Set(['2026-01', '2026-02']))).toBe(false);
  });

  it('is false for an empty lock set', () => {
    expect(isMonthLocked('2026-01', new Set())).toBe(false);
    expect(isMonthLocked('2026-01', [])).toBe(false);
  });

  it('accepts a plain array as well as a Set', () => {
    expect(isMonthLocked('2026-02', ['2026-01', '2026-02'])).toBe(true);
    expect(isMonthLocked('2026-05', ['2026-01', '2026-02'])).toBe(false);
  });

  it('matches exactly - a different month with the same prefix does not count', () => {
    expect(isMonthLocked('2026-1', ['2026-10'])).toBe(false);
    expect(isMonthLocked('2026-10', ['2026-1'])).toBe(false);
  });

  it('does not treat a locked month in another year as locked', () => {
    expect(isMonthLocked('2026-01', ['2025-01'])).toBe(false);
  });
});

describe('anyMonthLocked', () => {
  it('is true when at least one month is locked', () => {
    expect(anyMonthLocked(['2026-01', '2026-02', '2026-03'], ['2026-02'])).toBe(true);
  });

  it('is false when none are locked', () => {
    expect(anyMonthLocked(['2026-04', '2026-05'], ['2026-01', '2026-02'])).toBe(false);
  });

  it('is false for an empty candidate list', () => {
    expect(anyMonthLocked([], ['2026-01'])).toBe(false);
  });

  it('is false when nothing is locked at all', () => {
    expect(anyMonthLocked(['2026-01', '2026-02'], [])).toBe(false);
  });

  /**
   * This is the "move an actual between months" case: editing an entry from a
   * closed period into an open one must still be refused, because it would
   * change the closed period's already-signed-off total.
   */
  it('catches a move whose SOURCE month is locked even when the target is open', () => {
    const sourceMonth = '2026-01';
    const targetMonth = '2026-02';
    expect(anyMonthLocked([sourceMonth, targetMonth], ['2026-01'])).toBe(true);
  });

  it('catches a move whose TARGET month is locked even when the source is open', () => {
    expect(anyMonthLocked(['2026-03', '2026-01'], ['2026-01'])).toBe(true);
  });
});

describe('LockedPeriodError', () => {
  it('carries the offending month', () => {
    const err = new LockedPeriodError('2026-01');
    expect(err.month).toBe('2026-01');
  });

  it('has a stable name so route error mapping can branch on it', () => {
    // handleRouteError matches on `err.name`, which survives transpilation and
    // cross-realm boundaries better than instanceof.
    expect(new LockedPeriodError('2026-01').name).toBe('LockedPeriodError');
  });

  it('is an Error with an actionable message naming the period', () => {
    const err = new LockedPeriodError('2026-02');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('2026-02');
    expect(err.message).toMatch(/locked/i);
  });
});
