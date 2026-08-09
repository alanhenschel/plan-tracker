import { connectToDatabase } from '@/lib/db/connect';
import { Lock } from '@/lib/db/models/Lock';
import { requireSessionUser } from '@/lib/auth/getSessionUser';
import { createLockSchema, rangeQuerySchema, searchParamsToObject } from '@/lib/validation/schemas';
import { handleRouteError, ok } from '@/lib/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/locks?from=YYYY-MM&to=YYYY-MM */
export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const query = rangeQuerySchema.parse(searchParamsToObject(new URL(request.url)));
    await connectToDatabase();

    const locks = await Lock.find({
      userId: user.userId,
      month: { $gte: query.from, $lte: query.to },
    })
      .sort({ month: 1 })
      .select('month lockedAt')
      .lean();

    return ok({
      locks: locks.map((l) => ({ month: l.month, lockedAt: l.lockedAt })),
      lockedMonths: locks.map((l) => l.month),
    });
  } catch (err) {
    return handleRouteError(err, 'locks:GET');
  }
}

/**
 * POST /api/locks - lock a month.
 *
 * Idempotent by construction: an upsert against the unique {userId, month}
 * index, so re-locking an already-locked month is a 200, not a 409. The UI's
 * "Lock Quarter" button just fires this three times.
 *
 * Note there is intentionally no lock check here - locking a locked month is
 * a no-op, and locking is itself the operation that closes the period.
 */
export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = createLockSchema.parse(await request.json());
    await connectToDatabase();

    const lock = await Lock.findOneAndUpdate(
      { userId: user.userId, month: body.month },
      { $setOnInsert: { userId: user.userId, month: body.month, lockedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    return ok({ lock: { month: lock!.month, lockedAt: lock!.lockedAt } });
  } catch (err) {
    return handleRouteError(err, 'locks:POST');
  }
}
