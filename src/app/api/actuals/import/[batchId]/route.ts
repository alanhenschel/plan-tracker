import { z } from 'zod';
import { connectToDatabase } from '@/lib/db/connect';
import { Actual } from '@/lib/db/models/Actual';
import { requireSessionUser } from '@/lib/auth/getSessionUser';
import { getLockedMonthsIn } from '@/lib/locks/service';
import { handleRouteError, locked, notFound, ok } from '@/lib/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// randomUUID() output. Validated so the value never reaches Mongo unchecked.
const batchIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid batch id');

interface RouteContext {
  params: { batchId: string };
}

/**
 * DELETE /api/actuals/import/[batchId] - undo a CSV import.
 *
 * Unlike the import itself, rollback is all-or-nothing: if ANY month touched by
 * the batch has been locked since the import, the whole delete is refused with
 * 423. Partially unwinding an import would leave a batch that can neither be
 * completed nor re-run, and would mutate a closed period.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireSessionUser();
    const batchId = batchIdSchema.parse(params.batchId);
    await connectToDatabase();

    // userId in the filter: a batch id belonging to another tenant reads as 404.
    const rows = await Actual.find({ userId: user.userId, importBatchId: batchId })
      .select('month')
      .lean();

    if (rows.length === 0) {
      return notFound('Import batch not found');
    }

    const months = [...new Set(rows.map((r) => r.month))];
    const lockedMonths = await getLockedMonthsIn(user.userId, months);

    if (lockedMonths.size > 0) {
      const list = [...lockedMonths].sort().join(', ');
      return locked(
        `Cannot roll back this import: period(s) ${list} are locked. Unlock them first.`,
      );
    }

    const result = await Actual.deleteMany({ userId: user.userId, importBatchId: batchId });

    return ok({ ok: true, batchId, deleted: result.deletedCount ?? 0 });
  } catch (err) {
    return handleRouteError(err, 'actuals/import/[batchId]:DELETE');
  }
}
