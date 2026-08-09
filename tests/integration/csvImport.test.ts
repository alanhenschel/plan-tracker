import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/db';
import * as app from './helpers/testApp';
import { Actual } from '@/lib/db/models/Actual';

/**
 * Q10.5 — CSV import edge cases, against the real route + real Mongo, per
 * work.log.md's documented policies:
 *   - D12: partial success (bad rows -> errors[], locked-month rows ->
 *     skippedRows[], everything else inserted; never a hard 423 for one bad
 *     row in a big file).
 *   - D13: rollback (DELETE .../import/[batchId]) is all-or-nothing and
 *     refuses with 423 if ANY touched month has since been locked.
 *   - Ledger semantics: re-importing the same file does not overwrite —
 *     it creates a second batch and doubles the row count.
 */

describe('csv import', () => {
  let user: Awaited<ReturnType<typeof app.signup>>;
  let marketing: { id: string; name: string };
  let payroll: { id: string; name: string };

  beforeAll(async () => {
    await startTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  async function setupUser() {
    user = await app.signup('csv-user@example.com', 'csv-password-1', 'CSV User');
    app.actAs(user.token);
    const cats = (await app.getCategories()).body.categories as { id: string; name: string }[];
    marketing = cats.find((c) => c.name === 'Marketing')!;
    payroll = cats.find((c) => c.name === 'Payroll')!;
  }

  const SAMPLE_CSV = ['month,category,amount', '2026-01,Marketing,4800', '2026-01,Payroll,20500', '2026-02,Payroll,19800', ''].join(
    '\n',
  );

  it('imports the assignment sample CSV verbatim: 3/3 rows, one batch', async () => {
    await setupUser();
    const res = await app.importCsv(SAMPLE_CSV);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(3);
    expect(res.body.skipped).toBe(0);
    expect(res.body.errors).toEqual([]);
    expect(res.body.batchId).toBeTruthy();

    const docs = await Actual.find({ userId: user.userId, importBatchId: res.body.batchId }).lean();
    expect(docs.length).toBe(3);
    expect(docs.every((d) => d.source === 'csv_import')).toBe(true);
  });

  it('malformed month string lands in errors[] with its row number; valid rows still import', async () => {
    await setupUser();
    const csv = ['month,category,amount', '2026-13,Marketing,100', '2026-01,Payroll,200'].join('\n');

    const res = await app.importCsv(csv);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].row).toBe(2); // header is row 1
    expect(res.body.errors[0].reason).toMatch(/yyyy-mm/i);
  });

  it('unknown category name lands in errors[] and never creates a category', async () => {
    await setupUser();
    const csv = ['month,category,amount', '2026-01,NotARealCategory,100', '2026-01,Marketing,200'].join('\n');

    const res = await app.importCsv(csv);
    expect(res.body.imported).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].reason).toMatch(/unknown category/i);

    const cats = (await app.getCategories()).body.categories as { name: string }[];
    expect(cats.map((c) => c.name).sort()).toEqual(['Marketing', 'Payroll', 'Tools']);
  });

  it('negative amount lands in errors[] and is not imported', async () => {
    await setupUser();
    const csv = ['month,category,amount', '2026-01,Marketing,-500', '2026-01,Payroll,200'].join('\n');

    const res = await app.importCsv(csv);
    expect(res.body.imported).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].reason).toMatch(/negative/i);
  });

  it('a mixed file (valid + bad month + unknown category + negative) reports each failure with the correct row and imports only the valid rows', async () => {
    await setupUser();
    const csv = [
      'month,category,amount',
      '2026-01,Marketing,4800', // row 2 — valid
      'not-a-month,Marketing,100', // row 3 — bad month
      '2026-01,Nonexistent,100', // row 4 — unknown category
      '2026-01,Payroll,-50', // row 5 — negative
    ].join('\n');

    const res = await app.importCsv(csv);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.errors).toHaveLength(3);
    expect(res.body.errors.map((e: any) => e.row).sort()).toEqual([3, 4, 5]);
    expect(res.body.totalRows).toBe(4);

    const docs = await Actual.find({ userId: user.userId }).lean();
    expect(docs.length).toBe(1);
    expect(docs[0].amount).toBe(4800);
  });

  it('a row targeting a locked month is reported in skippedRows, not errors, and is not written — other rows still import', async () => {
    await setupUser();
    await app.postLock('2026-01');

    const csv = ['month,category,amount', '2026-01,Marketing,4800', '2026-02,Payroll,19800'].join('\n');

    const res = await app.importCsv(csv);
    expect(res.status).toBe(200); // NOT a hard 423 — D12
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toBe(1);
    expect(res.body.skippedRows).toHaveLength(1);
    expect(res.body.skippedRows[0].row).toBe(2);
    expect(res.body.skippedRows[0].reason).toMatch(/locked/i);
    expect(res.body.errors).toEqual([]);

    const lockedMonthDocs = await Actual.find({ userId: user.userId, month: '2026-01' }).lean();
    expect(lockedMonthDocs).toEqual([]);

    const openMonthDocs = await Actual.find({ userId: user.userId, month: '2026-02' }).lean();
    expect(openMonthDocs.length).toBe(1);
  });

  it('re-importing the identical file twice creates a SECOND batch and doubles the row count (ledger, not overwrite)', async () => {
    await setupUser();

    const first = await app.importCsv(SAMPLE_CSV);
    expect(first.status).toBe(200);
    expect(first.body.imported).toBe(3);

    const second = await app.importCsv(SAMPLE_CSV);
    expect(second.status).toBe(200);
    expect(second.body.imported).toBe(3);

    expect(second.body.batchId).not.toBe(first.body.batchId);

    const allDocs = await Actual.find({ userId: user.userId }).lean();
    expect(allDocs.length).toBe(6); // 3 + 3, not overwritten

    // Report sums both batches for 2026-01 Marketing: 4800 + 4800 = 9600.
    const report = await app.getReport('2026-01', '2026-01', marketing.id);
    expect(report.body.rows[0].actual).toBe(9600);
  });

  it('rollback deletes only the targeted batch, leaving the other batch intact', async () => {
    await setupUser();
    const first = await app.importCsv(SAMPLE_CSV);
    const second = await app.importCsv(SAMPLE_CSV);

    const rollback = await app.deleteImportBatch(first.body.batchId);
    expect(rollback.status).toBe(200);
    expect(rollback.body.deleted).toBe(3);

    const remaining = await Actual.find({ userId: user.userId }).lean();
    expect(remaining.length).toBe(3);
    expect(remaining.every((d) => d.importBatchId === second.body.batchId)).toBe(true);
  });

  it('rollback is refused with 423 if any touched month has since been locked, and no rows are deleted', async () => {
    await setupUser();
    const csv = ['month,category,amount', '2026-04,Marketing,100', '2026-05,Payroll,200'].join('\n');
    const imported = await app.importCsv(csv);
    expect(imported.body.imported).toBe(2);

    await app.postLock('2026-04'); // lock only ONE of the two touched months

    const rollback = await app.deleteImportBatch(imported.body.batchId);
    expect(rollback.status).toBe(423);
    expect(rollback.body.error).toMatch(/locked/i);

    const stillThere = await Actual.find({ userId: user.userId, importBatchId: imported.body.batchId }).lean();
    expect(stillThere.length).toBe(2); // all-or-nothing: neither row was deleted
  });

  it('rollback succeeds once the blocking lock is removed', async () => {
    await setupUser();
    const csv = ['month,category,amount', '2026-04,Marketing,100'].join('\n');
    const imported = await app.importCsv(csv);

    await app.postLock('2026-04');
    const blocked = await app.deleteImportBatch(imported.body.batchId);
    expect(blocked.status).toBe(423);

    await app.deleteLock('2026-04');
    const rollback = await app.deleteImportBatch(imported.body.batchId);
    expect(rollback.status).toBe(200);

    const gone = await Actual.find({ userId: user.userId, importBatchId: imported.body.batchId }).lean();
    expect(gone).toEqual([]);
  });

  it('rejects a CSV missing required columns with a 400 file-level error (not a per-row error)', async () => {
    await setupUser();
    const csv = ['month,amount', '2026-01,100'].join('\n');
    const res = await app.importCsv(csv);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/category/i);
  });

  it('rejects an empty body with 400', async () => {
    await setupUser();
    const res = await app.importCsv('');
    expect(res.status).toBe(400);
  });

  it('also works via multipart/form-data (the UI\'s upload path), not just raw text/csv', async () => {
    await setupUser();
    const res = await app.importCsvMultipart(SAMPLE_CSV);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(3);
  });
});
