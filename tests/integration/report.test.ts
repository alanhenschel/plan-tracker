import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/db';
import * as app from './helpers/testApp';

/**
 * Q10.4 — Report accuracy against the assignment's exact sample table
 * (context.md):
 *
 *   2026-01 Marketing  plan 5000   actual 4800   variance -200    -4.00%
 *   2026-01 Payroll    plan 20000  actual 20500  variance +500    +2.50%
 *   2026-02 Marketing  plan 5000   actual missing (=0)  variance -5000  -100.00%
 *   2026-02 Payroll    plan 20000  actual 19800  variance -200    -1.00%
 *
 * Data is entered through the real POST/PUT routes (not inserted directly),
 * so this also exercises the `{userId, month}` index range scan and the
 * category-name join the same way the live report route does.
 */

describe('report accuracy', () => {
  let categories: { id: string; name: string }[];
  let marketing: { id: string; name: string };
  let payroll: { id: string; name: string };
  let user: Awaited<ReturnType<typeof app.signup>>;

  beforeAll(async () => {
    await startTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  async function seedSampleTable() {
    user = await app.signup('report-user@example.com', 'report-password-1', 'Report User');
    app.actAs(user.token);
    categories = (await app.getCategories()).body.categories;
    marketing = categories.find((c) => c.name === 'Marketing')!;
    payroll = categories.find((c) => c.name === 'Payroll')!;

    await app.putPlan(marketing.id, '2026-01', 5000);
    await app.putPlan(payroll.id, '2026-01', 20000);
    await app.putPlan(marketing.id, '2026-02', 5000);
    await app.putPlan(payroll.id, '2026-02', 20000);

    await app.postActual(marketing.id, '2026-01', 4800, 'Q1 campaign spend');
    await app.postActual(payroll.id, '2026-01', 20500, 'January payroll run');
    // 2026-02 Marketing actual intentionally omitted.
    await app.postActual(payroll.id, '2026-02', 19800, 'February payroll run');
  }

  it('matches the sample table exactly for all four rows', async () => {
    await seedSampleTable();

    const res = await app.getReport('2026-01', '2026-02');
    expect(res.status).toBe(200);

    const compact = (res.body.rows as any[])
      .map((r) => ({
        month: r.month,
        categoryName: r.categoryName,
        plan: r.plan,
        actual: r.actual,
        variance: r.variance,
        variancePct: r.variancePct,
      }))
      .sort((a, b) => (a.month + a.categoryName).localeCompare(b.month + b.categoryName));

    expect(compact).toEqual([
      { month: '2026-01', categoryName: 'Marketing', plan: 5000, actual: 4800, variance: -200, variancePct: -4 },
      { month: '2026-01', categoryName: 'Payroll', plan: 20000, actual: 20500, variance: 500, variancePct: 2.5 },
      { month: '2026-02', categoryName: 'Marketing', plan: 5000, actual: 0, variance: -5000, variancePct: -100 },
      { month: '2026-02', categoryName: 'Payroll', plan: 20000, actual: 19800, variance: -200, variancePct: -1 },
    ]);

    // hasPlan/hasActual flags: the missing-actual row must be distinguishable
    // from a "logged a real zero" row even though the numeric value is 0.
    const febMarketing = (res.body.rows as any[]).find(
      (r) => r.month === '2026-02' && r.categoryName === 'Marketing',
    );
    expect(febMarketing.hasPlan).toBe(true);
    expect(febMarketing.hasActual).toBe(false);
  });

  it('monthlyNetVariance and categoryTotals match the sample table roll-up', async () => {
    await seedSampleTable();

    const res = await app.getReport('2026-01', '2026-02');

    expect(res.body.monthlyNetVariance).toEqual([
      { month: '2026-01', netVariance: 300 },
      { month: '2026-02', netVariance: -5200 },
    ]);

    const totals = (res.body.categoryTotals as any[]).sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName),
    );
    expect(totals).toEqual([
      { categoryId: marketing.id, categoryName: 'Marketing', totalPlan: 10000, totalActual: 4800, totalVariance: -5200 },
      { categoryId: payroll.id, categoryName: 'Payroll', totalPlan: 40000, totalActual: 40300, totalVariance: 300 },
    ]);
  });

  it('?categoryId= filter restricts rows to that category only', async () => {
    await seedSampleTable();

    const res = await app.getReport('2026-01', '2026-02', marketing.id);
    expect(res.status).toBe(200);
    expect((res.body.rows as any[]).every((r) => r.categoryId === marketing.id)).toBe(true);
    expect(res.body.rows.length).toBe(2); // Marketing Jan + Feb only
  });

  it('isLocked reflects real Lock documents per month', async () => {
    await seedSampleTable();
    await app.postLock('2026-01');

    const res = await app.getReport('2026-01', '2026-02');
    const rows = res.body.rows as any[];
    expect(rows.filter((r) => r.month === '2026-01').every((r) => r.isLocked === true)).toBe(true);
    expect(rows.filter((r) => r.month === '2026-02').every((r) => r.isLocked === false)).toBe(true);
  });

  it('actuals are summed (ledger semantics): a second entry in the same category/month adds to the total', async () => {
    await seedSampleTable();

    // A second, separate Actual entry for 2026-01 Marketing (e.g. a correction).
    await app.postActual(marketing.id, '2026-01', 200, 'late-arriving invoice');

    const res = await app.getReport('2026-01', '2026-01', marketing.id);
    const row = (res.body.rows as any[])[0];
    expect(row.actual).toBe(5000); // 4800 + 200, summed not overwritten
    expect(row.variance).toBe(0);
    expect(row.variancePct).toBe(0);
  });

  it('a category with neither a plan nor an actual in range produces no row (no full cross-product)', async () => {
    await seedSampleTable();
    const tools = categories.find((c) => c.name === 'Tools')!;

    const res = await app.getReport('2026-01', '2026-02');
    const toolsRows = (res.body.rows as any[]).filter((r) => r.categoryId === tools.id);
    expect(toolsRows).toEqual([]);
  });
});
