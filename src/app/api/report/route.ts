import { Types, type FilterQuery } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Plan, type PlanDoc } from '@/lib/db/models/Plan';
import { Actual, type ActualDoc } from '@/lib/db/models/Actual';
import { Category } from '@/lib/db/models/Category';
import { requireSessionUser } from '@/lib/auth/getSessionUser';
import { getLockedMonths } from '@/lib/locks/service';
import { aggregateReport } from '@/lib/report/aggregate';
import { reportQuerySchema, searchParamsToObject } from '@/lib/validation/schemas';
import { handleRouteError, ok } from '@/lib/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/report?from=YYYY-MM&to=YYYY-MM&categoryId=...
 *
 * This handler does I/O only. Every number it returns is computed by the pure
 * `src/lib/report/aggregate` module, which is unit-tested against the spec's
 * sample table without a database.
 *
 * Scale note (expanded in the README): at this size, fetching the range and
 * folding it in memory is faster than a $group pipeline and keeps the math in
 * one testable place. The {userId, month} indexes make the fetch a bounded
 * index range scan. Past roughly 100k rows per user per range, the fold moves
 * into a MongoDB aggregation pipeline ($match on userId+month, $group by
 * categoryId+month) and only the grouped output crosses the wire.
 */
export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const query = reportQuerySchema.parse(searchParamsToObject(new URL(request.url)));
    await connectToDatabase();

    const monthRange = { $gte: query.from, $lte: query.to };
    const planFilter: FilterQuery<PlanDoc> = { userId: user.userId, month: monthRange };
    const actualFilter: FilterQuery<ActualDoc> = { userId: user.userId, month: monthRange };

    if (query.categoryId) {
      const categoryObjectId = new Types.ObjectId(query.categoryId);
      planFilter.categoryId = categoryObjectId;
      actualFilter.categoryId = categoryObjectId;
    }

    const [plans, actuals, categories, lockedMonths] = await Promise.all([
      Plan.find(planFilter).select('categoryId month amount').lean(),
      Actual.find(actualFilter).select('categoryId month amount').lean(),
      Category.find({ userId: user.userId }).select('_id name').lean(),
      getLockedMonths(user.userId, query.from, query.to),
    ]);

    const report = aggregateReport(
      plans.map((p) => ({
        categoryId: p.categoryId.toString(),
        month: p.month,
        amount: p.amount,
      })),
      actuals.map((a) => ({
        categoryId: a.categoryId.toString(),
        month: a.month,
        amount: a.amount,
      })),
      categories.map((c) => ({ id: c._id.toString(), name: c.name })),
      { from: query.from, to: query.to },
      { lockedMonths, categoryId: query.categoryId },
    );

    return ok(report);
  } catch (err) {
    return handleRouteError(err, 'report:GET');
  }
}
