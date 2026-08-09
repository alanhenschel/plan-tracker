import { randomUUID } from 'node:crypto';
import { File } from 'node:buffer';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Actual } from '@/lib/db/models/Actual';
import { Category } from '@/lib/db/models/Category';
import { requireSessionUser } from '@/lib/auth/getSessionUser';
import { getLockedMonthsIn } from '@/lib/locks/service';
import { CsvFormatError, parseActualsCsv, type CsvRowError } from '@/lib/csv/parseActualsCsv';
import { badRequest, handleRouteError, ok } from '@/lib/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 2 MB. Guards against a huge upload pinning the function's memory. */
const MAX_CSV_BYTES = 2 * 1024 * 1024;

/**
 * POST /api/actuals/import
 *
 * Accepts either `multipart/form-data` with a `file` field or a raw `text/csv`
 * body, so both the UI file picker and a plain `curl --data-binary` work.
 *
 * Semantics:
 *   - Partial success. Invalid rows are reported in `errors[]`, valid rows are
 *     still imported. Import correctness is per-row, and a finance user needs
 *     the good data plus a precise list of what to fix.
 *   - Rows targeting a LOCKED month are reported as `skipped`, not a hard 423.
 *     A 60-row file that touches one closed period should import the other 59
 *     and tell you which ones it refused. The lock is still enforced - nothing
 *     is written to a closed period.
 *   - Every inserted row shares an `importBatchId` so the whole import can be
 *     rolled back in one call.
 */
export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await connectToDatabase();

    const content = await readCsvBody(request);
    if (typeof content !== 'string') return content; // early error response

    const categories = await Category.find({ userId: user.userId }).select('_id name').lean();
    if (categories.length === 0) {
      return badRequest('Create at least one category before importing actuals');
    }

    let parsed;
    try {
      parsed = parseActualsCsv(
        content,
        categories.map((c) => ({ id: c._id.toString(), name: c.name })),
      );
    } catch (err) {
      if (err instanceof CsvFormatError) return badRequest(err.message);
      throw err;
    }

    const errors: CsvRowError[] = [...parsed.errors];

    // Lock check for every distinct month the file touches, in one query.
    const lockedMonths = await getLockedMonthsIn(
      user.userId,
      parsed.rows.map((r) => r.month),
    );

    const importable = [];
    const skipped: CsvRowError[] = [];
    for (const row of parsed.rows) {
      if (lockedMonths.has(row.month)) {
        skipped.push({
          row: row.row,
          reason: `period ${row.month} is locked - row not imported`,
        });
        continue;
      }
      importable.push(row);
    }

    const batchId = randomUUID();
    let imported = 0;

    if (importable.length > 0) {
      const docs = importable.map((row) => ({
        userId: user.userId,
        categoryId: new Types.ObjectId(row.categoryId),
        month: row.month,
        amount: row.amount,
        note: `Imported from CSV (row ${row.row})`,
        source: 'csv_import' as const,
        importBatchId: batchId,
      }));

      const inserted = await Actual.insertMany(docs, { ordered: false });
      imported = inserted.length;
    }

    return ok({
      batchId: imported > 0 ? batchId : null,
      imported,
      skipped: skipped.length,
      skippedRows: skipped,
      errors,
      totalRows: parsed.rows.length + parsed.errors.length,
    });
  } catch (err) {
    return handleRouteError(err, 'actuals/import:POST');
  }
}

/** Returns the CSV text, or a Response to return immediately on failure. */
async function readCsvBody(request: Request): Promise<string | Response> {
  const contentType = request.headers.get('content-type') ?? '';

  // Reject oversized uploads before buffering, when the client declares a length.
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_CSV_BYTES) {
    return badRequest(`CSV is larger than the ${MAX_CSV_BYTES / 1024 / 1024} MB limit`);
  }

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return badRequest('Expected a `file` field containing a CSV');
    }
    if (file.size > MAX_CSV_BYTES) {
      return badRequest(`CSV is larger than the ${MAX_CSV_BYTES / 1024 / 1024} MB limit`);
    }
    return file.text();
  }

  const text = await request.text();
  if (text.length > MAX_CSV_BYTES) {
    return badRequest(`CSV is larger than the ${MAX_CSV_BYTES / 1024 / 1024} MB limit`);
  }
  if (text.trim() === '') {
    return badRequest('Request body is empty - send a CSV file or text/csv body');
  }
  return text;
}
