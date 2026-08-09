import { describe, expect, it } from 'vitest';
import {
  MONTH_REGEX,
  addMonths,
  assertValidMonth,
  currentMonth,
  formatMonthLabel,
  isValidMonth,
  monthToQuarter,
  monthsInRange,
  quarterToMonths,
} from '@/lib/utils/month';

describe('isValidMonth / MONTH_REGEX', () => {
  it.each(['2026-01', '2026-12', '1999-06', '2026-09'])('accepts %s', (month) => {
    expect(isValidMonth(month)).toBe(true);
    expect(MONTH_REGEX.test(month)).toBe(true);
  });

  it.each([
    '2026-00', // month 0
    '2026-13', // month 13
    '2026-1', // not zero-padded
    '26-01', // two-digit year
    '2026/01', // wrong separator
    '2026-01-01', // a full date
    '2026-01 ', // trailing space
    ' 2026-01', // leading space
    '', // empty
    'not-a-month',
  ])('rejects %j', (month) => {
    expect(isValidMonth(month)).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidMonth(202601)).toBe(false);
    expect(isValidMonth(null)).toBe(false);
    expect(isValidMonth(undefined)).toBe(false);
    expect(isValidMonth({ month: '2026-01' })).toBe(false);
  });
});

describe('assertValidMonth', () => {
  it('returns the month when valid', () => {
    expect(assertValidMonth('2026-01')).toBe('2026-01');
  });

  it('throws a descriptive error when invalid', () => {
    expect(() => assertValidMonth('2026-13', 'from')).toThrow(/Invalid from/);
  });
});

describe('addMonths', () => {
  it('advances within a year', () => {
    expect(addMonths('2026-01', 1)).toBe('2026-02');
  });

  it('rolls over the year boundary going forward', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });

  it('rolls back over the year boundary', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });

  it('handles multi-year deltas in both directions', () => {
    expect(addMonths('2026-06', 24)).toBe('2028-06');
    expect(addMonths('2026-06', -30)).toBe('2023-12');
  });

  it('is a no-op for a zero delta', () => {
    expect(addMonths('2026-07', 0)).toBe('2026-07');
  });

  it('throws for an invalid input month', () => {
    expect(() => addMonths('2026-13', 1)).toThrow();
  });
});

describe('monthsInRange', () => {
  it('is inclusive of both endpoints', () => {
    expect(monthsInRange('2026-01', '2026-03')).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('returns a single month when from equals to', () => {
    expect(monthsInRange('2026-05', '2026-05')).toEqual(['2026-05']);
  });

  it('spans a year boundary', () => {
    expect(monthsInRange('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  // Guards against an infinite loop if an inverted range ever reaches this.
  it('returns an empty array for an inverted range instead of looping', () => {
    expect(monthsInRange('2026-06', '2026-01')).toEqual([]);
  });

  it('throws for invalid endpoints', () => {
    expect(() => monthsInRange('2026-01', 'nope')).toThrow(/Invalid to/);
  });
});

describe('quarterToMonths', () => {
  it.each([
    [1, ['2026-01', '2026-02', '2026-03']],
    [2, ['2026-04', '2026-05', '2026-06']],
    [3, ['2026-07', '2026-08', '2026-09']],
    [4, ['2026-10', '2026-11', '2026-12']],
  ])('Q%i 2026', (quarter, expected) => {
    expect(quarterToMonths(2026, quarter as number)).toEqual(expected);
  });

  it('rejects an out-of-range quarter', () => {
    expect(() => quarterToMonths(2026, 0)).toThrow(/Invalid quarter/);
    expect(() => quarterToMonths(2026, 5)).toThrow(/Invalid quarter/);
  });

  it('rejects a non-integer quarter', () => {
    expect(() => quarterToMonths(2026, 1.5)).toThrow(/Invalid quarter/);
  });

  it('rejects an implausible year', () => {
    expect(() => quarterToMonths(26, 1)).toThrow(/Invalid year/);
  });
});

describe('monthToQuarter', () => {
  it.each([
    ['2026-01', 1],
    ['2026-03', 1],
    ['2026-04', 2],
    ['2026-09', 3],
    ['2026-10', 4],
    ['2026-12', 4],
  ])('%s is in Q%i', (month, quarter) => {
    expect(monthToQuarter(month)).toBe(quarter);
  });
});

describe('formatMonthLabel', () => {
  it('renders a human label', () => {
    expect(formatMonthLabel('2026-01')).toBe('Jan 2026');
    expect(formatMonthLabel('2026-12')).toBe('Dec 2026');
  });

  it('passes invalid input through untouched rather than throwing in a render path', () => {
    expect(formatMonthLabel('garbage')).toBe('garbage');
  });
});

describe('currentMonth', () => {
  it('formats the supplied date as YYYY-MM', () => {
    // Constructed with local-time parts to match the function's local-time read.
    expect(currentMonth(new Date(2026, 0, 15))).toBe('2026-01');
    expect(currentMonth(new Date(2026, 11, 31))).toBe('2026-12');
  });

  it('produces a value the validator accepts', () => {
    expect(isValidMonth(currentMonth())).toBe(true);
  });
});

describe('lexicographic ordering', () => {
  // This property is why months are stored as strings: Mongo range queries and
  // in-memory sorts both work without parsing.
  it('sorts chronologically as plain strings', () => {
    const shuffled = ['2026-10', '2025-12', '2026-02', '2026-01', '2027-01'];
    expect([...shuffled].sort()).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-10',
      '2027-01',
    ]);
  });
});
