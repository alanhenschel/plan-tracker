import { describe, expect, it } from 'vitest';
import {
  aggregateReport,
  computeCategoryTotals,
  computeMonthlyNetVariance,
} from '@/lib/report/aggregate';
import type { ActualInput, CategoryInput, PlanInput, ReportRow } from '@/lib/report/types';

/**
 * Fixtures are the assignment's sample data, verbatim.
 *
 *   Month    Category   Plan     Actual   Variance   Variance %
 *   2026-01  Marketing   5,000    4,800      -200       -4.00%
 *   2026-01  Payroll    20,000   20,500      +500       +2.50%
 *   2026-02  Marketing   5,000        -     -5,000     -100.00%   (missing actual -> 0)
 *   2026-02  Payroll    20,000   19,800      -200       -1.00%
 */

const MARKETING = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const PAYROLL = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const TOOLS = 'aaaaaaaaaaaaaaaaaaaaaaa3';

const CATEGORIES: CategoryInput[] = [
  { id: MARKETING, name: 'Marketing' },
  { id: PAYROLL, name: 'Payroll' },
  { id: TOOLS, name: 'Tools' },
];

const PLANS: PlanInput[] = [
  { categoryId: MARKETING, month: '2026-01', amount: 5000 },
  { categoryId: PAYROLL, month: '2026-01', amount: 20000 },
  { categoryId: MARKETING, month: '2026-02', amount: 5000 },
  { categoryId: PAYROLL, month: '2026-02', amount: 20000 },
];

// Marketing 2026-02 is intentionally absent - the "missing actual" case.
const ACTUALS: ActualInput[] = [
  { categoryId: MARKETING, month: '2026-01', amount: 4800 },
  { categoryId: PAYROLL, month: '2026-01', amount: 20500 },
  { categoryId: PAYROLL, month: '2026-02', amount: 19800 },
];

const RANGE = { from: '2026-01', to: '2026-02' };

function compact(row: ReportRow) {
  return {
    month: row.month,
    categoryName: row.categoryName,
    plan: row.plan,
    actual: row.actual,
    variance: row.variance,
    variancePct: row.variancePct,
  };
}

describe('aggregateReport - the spec sample table', () => {
  const report = aggregateReport(PLANS, ACTUALS, CATEGORIES, RANGE);

  it('produces exactly the four rows of the sample table, in month then category order', () => {
    expect(report.rows.map(compact)).toEqual([
      { month: '2026-01', categoryName: 'Marketing', plan: 5000, actual: 4800, variance: -200, variancePct: -4 },
      { month: '2026-01', categoryName: 'Payroll', plan: 20000, actual: 20500, variance: 500, variancePct: 2.5 },
      { month: '2026-02', categoryName: 'Marketing', plan: 5000, actual: 0, variance: -5000, variancePct: -100 },
      { month: '2026-02', categoryName: 'Payroll', plan: 20000, actual: 19800, variance: -200, variancePct: -1 },
    ]);
  });

  it('emits no row for a category with neither a plan nor an actual', () => {
    expect(report.rows.some((row) => row.categoryName === 'Tools')).toBe(false);
  });

  it('flags the missing actual via hasActual while still reporting 0', () => {
    const row = report.rows.find((r) => r.month === '2026-02' && r.categoryName === 'Marketing')!;
    expect(row.hasActual).toBe(false);
    expect(row.hasPlan).toBe(true);
    expect(row.actual).toBe(0);
  });

  it('computes monthly net variance across all categories', () => {
    expect(report.monthlyNetVariance).toEqual([
      { month: '2026-01', netVariance: 300 }, // -200 + 500
      { month: '2026-02', netVariance: -5200 }, // -5000 + -200
    ]);
  });

  it('computes category totals over the whole range', () => {
    expect(report.categoryTotals).toEqual([
      { categoryId: MARKETING, categoryName: 'Marketing', totalPlan: 10000, totalActual: 4800, totalVariance: -5200 },
      { categoryId: PAYROLL, categoryName: 'Payroll', totalPlan: 40000, totalActual: 40300, totalVariance: 300 },
    ]);
  });

  it('echoes the requested range', () => {
    expect(report.range).toEqual(RANGE);
  });
});

describe('aggregateReport - edge cases', () => {
  it('returns null variancePct when the plan is 0, never NaN', () => {
    const report = aggregateReport(
      [{ categoryId: MARKETING, month: '2026-01', amount: 0 }],
      [{ categoryId: MARKETING, month: '2026-01', amount: 750 }],
      CATEGORIES,
      { from: '2026-01', to: '2026-01' },
    );
    expect(report.rows[0].plan).toBe(0);
    expect(report.rows[0].actual).toBe(750);
    expect(report.rows[0].variance).toBe(750);
    expect(report.rows[0].variancePct).toBeNull();
  });

  it('defaults plan to 0 and marks hasPlan false when no Plan document exists', () => {
    const report = aggregateReport(
      [],
      [{ categoryId: TOOLS, month: '2026-01', amount: 120 }],
      CATEGORIES,
      { from: '2026-01', to: '2026-01' },
    );
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      categoryName: 'Tools',
      plan: 0,
      actual: 120,
      variance: 120,
      variancePct: null,
      hasPlan: false,
      hasActual: true,
    });
  });

  it('SUMS multiple actual entries for the same category and month (ledger semantics)', () => {
    const report = aggregateReport(
      [{ categoryId: MARKETING, month: '2026-01', amount: 5000 }],
      [
        { categoryId: MARKETING, month: '2026-01', amount: 1000 },
        { categoryId: MARKETING, month: '2026-01', amount: 2500 },
        { categoryId: MARKETING, month: '2026-01', amount: 1300 },
      ],
      CATEGORIES,
      { from: '2026-01', to: '2026-01' },
    );
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].actual).toBe(4800);
    expect(report.rows[0].variance).toBe(-200);
    expect(report.rows[0].variancePct).toBe(-4);
  });

  it('distinguishes a logged zero from a missing actual via hasActual', () => {
    const report = aggregateReport(
      [{ categoryId: MARKETING, month: '2026-01', amount: 5000 }],
      [{ categoryId: MARKETING, month: '2026-01', amount: 0 }],
      CATEGORIES,
      { from: '2026-01', to: '2026-01' },
    );
    expect(report.rows[0].actual).toBe(0);
    // The number is identical to the defaulted case; only the flag differs.
    expect(report.rows[0].hasActual).toBe(true);
    expect(report.rows[0].variancePct).toBe(-100);
  });

  it('excludes plans and actuals outside the requested range', () => {
    const report = aggregateReport(
      [
        { categoryId: MARKETING, month: '2025-12', amount: 999 },
        { categoryId: MARKETING, month: '2026-01', amount: 5000 },
        { categoryId: MARKETING, month: '2026-03', amount: 777 },
      ],
      [{ categoryId: MARKETING, month: '2025-12', amount: 1 }],
      CATEGORIES,
      { from: '2026-01', to: '2026-02' },
    );
    expect(report.rows.map((r) => r.month)).toEqual(['2026-01']);
  });

  it('filters to a single category when categoryId is supplied', () => {
    const report = aggregateReport(PLANS, ACTUALS, CATEGORIES, RANGE, { categoryId: PAYROLL });
    expect(report.rows).toHaveLength(2);
    expect(report.rows.every((r) => r.categoryName === 'Payroll')).toBe(true);
    expect(report.categoryTotals).toHaveLength(1);
  });

  it('marks rows in locked months', () => {
    const report = aggregateReport(PLANS, ACTUALS, CATEGORIES, RANGE, {
      lockedMonths: ['2026-01'],
    });
    const january = report.rows.filter((r) => r.month === '2026-01');
    const february = report.rows.filter((r) => r.month === '2026-02');
    expect(january.every((r) => r.isLocked)).toBe(true);
    expect(february.every((r) => r.isLocked)).toBe(false);
  });

  it('returns an empty report for an empty dataset without throwing', () => {
    const report = aggregateReport([], [], CATEGORIES, RANGE);
    expect(report.rows).toEqual([]);
    expect(report.categoryTotals).toEqual([]);
    // Months in range are still emitted so the chart axis stays continuous.
    expect(report.monthlyNetVariance).toEqual([
      { month: '2026-01', netVariance: 0 },
      { month: '2026-02', netVariance: 0 },
    ]);
  });

  it('labels a row whose category is not in the supplied list rather than dropping it', () => {
    const report = aggregateReport(
      [{ categoryId: 'ffffffffffffffffffffffff', month: '2026-01', amount: 100 }],
      [],
      CATEGORIES,
      { from: '2026-01', to: '2026-01' },
    );
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].categoryName).toBe('Unknown category');
  });

  it('does not accumulate floating point error across summed actuals', () => {
    const report = aggregateReport(
      [{ categoryId: MARKETING, month: '2026-01', amount: 0.3 }],
      [
        { categoryId: MARKETING, month: '2026-01', amount: 0.1 },
        { categoryId: MARKETING, month: '2026-01', amount: 0.2 },
      ],
      CATEGORIES,
      { from: '2026-01', to: '2026-01' },
    );
    expect(report.rows[0].actual).toBe(0.3);
    expect(report.rows[0].variance).toBe(0);
  });
});

describe('computeMonthlyNetVariance', () => {
  it('emits a zero entry for months in range that have no rows', () => {
    const rows: ReportRow[] = [
      {
        categoryId: MARKETING,
        categoryName: 'Marketing',
        month: '2026-01',
        plan: 100,
        actual: 40,
        variance: -60,
        variancePct: -60,
        isLocked: false,
        hasPlan: true,
        hasActual: true,
      },
    ];
    expect(computeMonthlyNetVariance(rows, { from: '2026-01', to: '2026-03' })).toEqual([
      { month: '2026-01', netVariance: -60 },
      { month: '2026-02', netVariance: 0 },
      { month: '2026-03', netVariance: 0 },
    ]);
  });
});

describe('computeCategoryTotals', () => {
  it('sorts categories by name and sums each measure', () => {
    const rows: ReportRow[] = [
      {
        categoryId: PAYROLL,
        categoryName: 'Payroll',
        month: '2026-01',
        plan: 20000,
        actual: 20500,
        variance: 500,
        variancePct: 2.5,
        isLocked: false,
        hasPlan: true,
        hasActual: true,
      },
      {
        categoryId: MARKETING,
        categoryName: 'Marketing',
        month: '2026-01',
        plan: 5000,
        actual: 4800,
        variance: -200,
        variancePct: -4,
        isLocked: false,
        hasPlan: true,
        hasActual: true,
      },
    ];
    expect(computeCategoryTotals(rows).map((t) => t.categoryName)).toEqual([
      'Marketing',
      'Payroll',
    ]);
  });

  it('returns an empty array for no rows', () => {
    expect(computeCategoryTotals([])).toEqual([]);
  });
});

describe('module purity', () => {
  it('aggregate and variance import nothing from mongoose, next or the db layer', async () => {
    // A guard against someone importing a model into the aggregation layer:
    // these modules must stay unit-testable without a database.
    const { readFileSync } = await import('node:fs');
    const forbidden = ['mongoose', 'next/', 'next"', "next'", '@/lib/db'];

    for (const file of ['src/lib/report/aggregate.ts', 'src/lib/report/variance.ts']) {
      const source = readFileSync(file, 'utf8');
      const importLines = source
        .split('\n')
        .filter((line) => line.trimStart().startsWith('import'));
      for (const term of forbidden) {
        expect(importLines.join('\n'), `${file} must not import ${term}`).not.toContain(term);
      }
    }
  });
});
