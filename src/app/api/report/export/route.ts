import { Types, type FilterQuery } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Plan, type PlanDoc } from '@/lib/db/models/Plan';
import { Actual, type ActualDoc } from '@/lib/db/models/Actual';
import { Category } from '@/lib/db/models/Category';
import { requireSessionUser } from '@/lib/auth/getSessionUser';
import { getLockedMonths } from '@/lib/locks/service';
import { aggregateReport } from '@/lib/report/aggregate';
import { toCsv } from '@/lib/csv/toCsv';
import { reportQuerySchema, searchParamsToObject } from '@/lib/validation/schemas';
import { handleRouteError } from '@/lib/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/report/export?from=&to=&categoryId= - the report table as a CSV
 * attachment (stretch goal "Export").
 *
 * Variance % is written as an empty cell when plan is 0, matching the "-" the
 * UI shows: a spreadsheet should not contain a fabricated 0% for an undefined
 * ratio.
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

    const csv = toCsv(
      ['month', 'category', 'plan', 'actual', 'variance', 'variance_pct', 'locked'],
      report.rows.map((row) => [
        row.month,
        row.categoryName,
        row.plan,
        row.actual,
        row.variance,
        row.variancePct === null ? '' : row.variancePct.toFixed(2),
        row.isLocked ? 'yes' : 'no',
      ]),
    );

    const filename = `plan-vs-actual_${query.from}_${query.to}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleRouteError(err, 'report/export:GET');
  }
}
