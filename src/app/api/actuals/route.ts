import { Types, type FilterQuery } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Actual, type ActualDoc } from '@/lib/db/models/Actual';
import { Category } from '@/lib/db/models/Category';
import { requireSessionUser } from '@/lib/auth/getSessionUser';
import { assertMonthUnlocked } from '@/lib/locks/service';
import {
  actualsQuerySchema,
  createActualSchema,
  searchParamsToObject,
} from '@/lib/validation/schemas';
import { created, handleRouteError, notFound, ok } from '@/lib/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/actuals?from=YYYY-MM&to=YYYY-MM&categoryId=... */
export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const query = actualsQuerySchema.parse(searchParamsToObject(new URL(request.url)));
    await connectToDatabase();

    const filter: FilterQuery<ActualDoc> = {
      userId: user.userId,
      month: { $gte: query.from, $lte: query.to },
    };
    if (query.categoryId) {
      filter.categoryId = new Types.ObjectId(query.categoryId);
    }

    const actuals = await Actual.find(filter)
      .sort({ month: 1, createdAt: 1 })
      .select('_id categoryId month amount note source importBatchId createdAt')
      .lean();

    return ok({
      actuals: actuals.map((a) => ({
        id: a._id.toString(),
        categoryId: a.categoryId.toString(),
        month: a.month,
        amount: a.amount,
        note: a.note ?? null,
        source: a.source,
        importBatchId: a.importBatchId ?? null,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    return handleRouteError(err, 'actuals:GET');
  }
}

/**
 * POST /api/actuals - log one actual entry.
 *
 * Appends rather than upserts: actuals are a ledger. Several entries can share
 * a (category, month) and the report sums them, which preserves the individual
 * notes that make the report drill-down useful.
 */
export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = createActualSchema.parse(await request.json());
    await connectToDatabase();

    const categoryId = new Types.ObjectId(body.categoryId);

    const category = await Category.exists({ _id: categoryId, userId: user.userId });
    if (!category) return notFound('Category not found');

    await assertMonthUnlocked(user.userId, body.month);

    const actual = await Actual.create({
      userId: user.userId,
      categoryId,
      month: body.month,
      amount: body.amount,
      note: body.note,
      source: 'manual',
    });

    return created({
      actual: {
        id: actual._id.toString(),
        categoryId: actual.categoryId.toString(),
        month: actual.month,
        amount: actual.amount,
        note: actual.note ?? null,
        source: actual.source,
      },
    });
  } catch (err) {
    return handleRouteError(err, 'actuals:POST');
  }
}
