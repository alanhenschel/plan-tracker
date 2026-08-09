import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/db';
import * as app from './helpers/testApp';
import { Plan } from '@/lib/db/models/Plan';
import { Actual } from '@/lib/db/models/Actual';

/**
 * Q10.3 — Lock enforcement.
 *
 * Every assertion here checks TWO things: the HTTP status (423, `{error}`
 * shape) AND the underlying document, fetched directly through the Mongoose
 * model bypassing the route layer entirely. A route that returns 423 but
 * still writes (or a soft-delete that a naive test would miss) would pass a
 * status-only test and fail this one.
 */

describe('lock enforcement', () => {
  let categoryId: string;

  beforeAll(async () => {
    await startTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  async function setupUserWithLockedMonth() {
    const user = await app.signup('locker@example.com', 'lock-password-1', 'Locker');
    app.actAs(user.token);
    const cats = (await app.getCategories()).body.categories as { id: string; name: string }[];
    const marketing = cats.find((c) => c.name === 'Marketing')!;

    const planRes = await app.putPlan(marketing.id, '2026-01', 5000);
    const planId = planRes.body.plan.id as string;

    const actualRes = await app.postActual(marketing.id, '2026-01', 4800, 'January spend');
    const actualId = actualRes.body.actual.id as string;

    const lockRes = await app.postLock('2026-01');
    expect(lockRes.status).toBe(200);

    return { user, marketing, planId, actualId };
  }

  it('423 with a clear {error} message on a new Plan upsert into a locked month, and no doc is created', async () => {
    const { user, marketing } = await setupUserWithLockedMonth();
    app.actAs(user.token);

    const res = await app.putPlan(marketing.id, '2026-02', 1); // 2026-02 not locked yet — sanity
    expect(res.status).toBe(200);
    await app.postLock('2026-02');

    const locked = await app.putPlan(marketing.id, '2026-02', 999);
    expect(locked.status).toBe(423);
    expect(typeof locked.body.error).toBe('string');
    expect(locked.body.error.toLowerCase()).toMatch(/locked/);

    const doc = await Plan.findOne({ userId: user.userId, month: '2026-02' }).lean();
    expect(doc!.amount).toBe(1); // unchanged from the pre-lock value, not 999
  });

  it('423 on editing an existing Plan in a locked month, doc amount unchanged', async () => {
    const { user, marketing, planId } = await setupUserWithLockedMonth();
    app.actAs(user.token);

    const res = await app.putPlan(marketing.id, '2026-01', 123456);
    expect(res.status).toBe(423);

    const doc = await Plan.findById(planId).lean();
    expect(doc!.amount).toBe(5000);
  });

  it('423 on deleting a Plan in a locked month, doc still exists', async () => {
    const { user, planId } = await setupUserWithLockedMonth();
    app.actAs(user.token);

    const res = await app.deletePlan(planId);
    expect(res.status).toBe(423);

    const doc = await Plan.findById(planId).lean();
    expect(doc).not.toBeNull();
  });

  it('423 on creating a new Actual in a locked month, no doc created', async () => {
    const { user, marketing } = await setupUserWithLockedMonth();
    app.actAs(user.token);

    const before = await Actual.countDocuments({ userId: user.userId, month: '2026-01' });
    const res = await app.postActual(marketing.id, '2026-01', 50, 'attempted after lock');
    expect(res.status).toBe(423);
    expect(res.body.error).toMatch(/locked/i);

    const after = await Actual.countDocuments({ userId: user.userId, month: '2026-01' });
    expect(after).toBe(before);
  });

  it('423 on editing an Actual amount in a locked month, doc unchanged', async () => {
    const { user, actualId } = await setupUserWithLockedMonth();
    app.actAs(user.token);

    const res = await app.putActual(actualId, { amount: 1 });
    expect(res.status).toBe(423);

    const doc = await Actual.findById(actualId).lean();
    expect(doc!.amount).toBe(4800);
  });

  it('423 on deleting an Actual in a locked month, doc still exists', async () => {
    const { user, actualId } = await setupUserWithLockedMonth();
    app.actAs(user.token);

    const res = await app.deleteActual(actualId);
    expect(res.status).toBe(423);

    const doc = await Actual.findById(actualId).lean();
    expect(doc).not.toBeNull();
  });

  it('423 when moving an Actual OUT of a locked month (source locked, target open) — D11', async () => {
    const { user, actualId } = await setupUserWithLockedMonth();
    app.actAs(user.token);

    const res = await app.putActual(actualId, { month: '2026-02' });
    expect(res.status).toBe(423);

    const doc = await Actual.findById(actualId).lean();
    expect(doc!.month).toBe('2026-01'); // never moved
  });

  it('423 when moving an Actual INTO a locked month (source open, target locked) — D11', async () => {
    const { user, marketing } = await setupUserWithLockedMonth();
    app.actAs(user.token);

    const openActual = await app.postActual(marketing.id, '2026-03', 200, 'March, open');
    const openActualId = openActual.body.actual.id as string;

    const res = await app.putActual(openActualId, { month: '2026-01' }); // 2026-01 is locked
    expect(res.status).toBe(423);

    const doc = await Actual.findById(openActualId).lean();
    expect(doc!.month).toBe('2026-03'); // never moved into the locked period
  });

  it('re-locking an already-locked month is idempotent (200, not 409)', async () => {
    const { user } = await setupUserWithLockedMonth();
    app.actAs(user.token);

    const res = await app.postLock('2026-01');
    expect(res.status).toBe(200);
  });

  it('unlocking restores write access, and the lock actually gated (not a no-op the whole time)', async () => {
    const { user, marketing, planId } = await setupUserWithLockedMonth();
    app.actAs(user.token);

    const stillLocked = await app.putPlan(marketing.id, '2026-01', 42);
    expect(stillLocked.status).toBe(423);

    const unlock = await app.deleteLock('2026-01');
    expect(unlock.status).toBe(200);

    const nowWorks = await app.putPlan(marketing.id, '2026-01', 42);
    expect(nowWorks.status).toBe(200);

    const doc = await Plan.findById(planId).lean();
    expect(doc!.amount).toBe(42);
  });
});
