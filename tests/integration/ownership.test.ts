import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/db';
import * as app from './helpers/testApp';
import { Plan } from '@/lib/db/models/Plan';
import { Actual } from '@/lib/db/models/Actual';

/**
 * Q10.2 — Ownership isolation between two tenants.
 *
 * D9/D10 in work.log.md: a mutation attempt against another tenant's
 * categoryId/plan-id/actual-id must come back 404, never 403 — 403 would
 * confirm the record exists under someone else's account. This suite treats
 * that as a contract to verify, not a bug to "fix" toward 403.
 */

describe('ownership isolation', () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  async function setupTwoUsers() {
    const a = await app.signup('tenant-a@example.com', 'correct-horse-a', 'Tenant A');
    const b = await app.signup('tenant-b@example.com', 'correct-horse-b', 'Tenant B');

    app.actAs(a.token);
    const aCats = (await app.getCategories()).body.categories as { id: string; name: string }[];
    const aMarketing = aCats.find((c) => c.name === 'Marketing')!;

    const aPlanRes = await app.putPlan(aMarketing.id, '2026-01', 5000);
    const aPlanId = aPlanRes.body.plan.id as string;

    const aActualRes = await app.postActual(aMarketing.id, '2026-01', 4800, 'A original note');
    const aActualId = aActualRes.body.actual.id as string;

    const aImportRes = await app.importCsv('month,category,amount\n2026-01,Marketing,111\n');
    const aBatchId = aImportRes.body.batchId as string;

    await app.postLock('2026-03');

    return { a, b, aCats, aMarketing, aPlanId, aActualId, aBatchId };
  }

  it('signup seeds exactly the three documented default categories, scoped per user', async () => {
    const a = await app.signup('cats-a@example.com', 'password-a1', 'A');
    const b = await app.signup('cats-b@example.com', 'password-b1', 'B');

    app.actAs(a.token);
    const aCats = (await app.getCategories()).body.categories as { name: string }[];
    expect(aCats.map((c) => c.name).sort()).toEqual(['Marketing', 'Payroll', 'Tools']);

    app.actAs(b.token);
    const bCats = (await app.getCategories()).body.categories as { name: string }[];
    expect(bCats.map((c) => c.name).sort()).toEqual(['Marketing', 'Payroll', 'Tools']);
  });

  it('GET list endpoints never return another tenant\'s rows', async () => {
    const { b } = await setupTwoUsers();

    app.actAs(b.token);
    const plans = await app.getPlans('2026-01', '2026-12');
    expect(plans.status).toBe(200);
    expect(plans.body.plans).toEqual([]);

    const actuals = await app.getActuals('2026-01', '2026-12');
    expect(actuals.status).toBe(200);
    expect(actuals.body.actuals).toEqual([]);

    const locks = await app.getLocks('2026-01', '2026-12');
    expect(locks.status).toBe(200);
    expect(locks.body.lockedMonths).toEqual([]);

    const report = await app.getReport('2026-01', '2026-12');
    expect(report.status).toBe(200);
    expect(report.body.rows).toEqual([]);
    expect(report.body.categoryTotals).toEqual([]);
  });

  it('PUT /api/plans with another tenant\'s categoryId returns 404, not 403', async () => {
    const { b, aMarketing } = await setupTwoUsers();

    app.actAs(b.token);
    const res = await app.putPlan(aMarketing.id, '2026-01', 9999);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');

    // And nothing was created under B's account or mutated under A's.
    const bPlans = await app.getPlans('2026-01', '2026-01');
    expect(bPlans.body.plans).toEqual([]);
  });

  it('POST /api/actuals with another tenant\'s categoryId returns 404, not 403', async () => {
    const { b, aMarketing } = await setupTwoUsers();

    app.actAs(b.token);
    const res = await app.postActual(aMarketing.id, '2026-01', 100);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('DELETE /api/plans/[id] on another tenant\'s plan id returns 404 and leaves the plan intact', async () => {
    const { b, aPlanId } = await setupTwoUsers();

    app.actAs(b.token);
    const res = await app.deletePlan(aPlanId);
    expect(res.status).toBe(404);

    const stillThere = await Plan.findById(aPlanId).lean();
    expect(stillThere).not.toBeNull();
    expect(stillThere!.amount).toBe(5000);
  });

  it('PUT /api/actuals/[id] on another tenant\'s actual id returns 404 and leaves the actual unchanged', async () => {
    const { b, aActualId } = await setupTwoUsers();

    app.actAs(b.token);
    const res = await app.putActual(aActualId, { amount: 1 });
    expect(res.status).toBe(404);

    const stillThere = await Actual.findById(aActualId).lean();
    expect(stillThere!.amount).toBe(4800);
    expect(stillThere!.note).toBe('A original note');
  });

  it('DELETE /api/actuals/[id] on another tenant\'s actual id returns 404 and does not delete it', async () => {
    const { b, aActualId } = await setupTwoUsers();

    app.actAs(b.token);
    const res = await app.deleteActual(aActualId);
    expect(res.status).toBe(404);

    const stillThere = await Actual.findById(aActualId).lean();
    expect(stillThere).not.toBeNull();
  });

  it('DELETE /api/actuals/import/[batchId] on another tenant\'s batch returns 404 and keeps the rows', async () => {
    const { b, aBatchId } = await setupTwoUsers();

    app.actAs(b.token);
    const res = await app.deleteImportBatch(aBatchId);
    expect(res.status).toBe(404);

    const remaining = await Actual.find({ importBatchId: aBatchId }).lean();
    expect(remaining.length).toBe(1);
  });

  it('DELETE /api/locks/[month] on another tenant\'s locked month returns 404, not 403, and the lock survives', async () => {
    const { a, b } = await setupTwoUsers();

    app.actAs(b.token);
    const res = await app.deleteLock('2026-03');
    expect(res.status).toBe(404);

    app.actAs(a.token);
    const aLocks = await app.getLocks('2026-01', '2026-12');
    expect(aLocks.body.lockedMonths).toContain('2026-03');
  });

  it('a non-existent (but well-formed) id also returns 404 — same shape as "belongs to someone else"', async () => {
    const { b } = await setupTwoUsers();
    const phantomId = new Types.ObjectId().toString();

    app.actAs(b.token);
    const deletePlanRes = await app.deletePlan(phantomId);
    const deleteActualRes = await app.deleteActual(phantomId);
    expect(deletePlanRes.status).toBe(404);
    expect(deleteActualRes.status).toBe(404);
  });

  it('unauthenticated requests get 401, not 404 or 500', async () => {
    app.actAsGuest();
    const res = await app.getPlans('2026-01', '2026-01');
    expect(res.status).toBe(401);
  });
});
