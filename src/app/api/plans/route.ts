import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Plan } from '@/lib/db/models/Plan';
import { Category } from '@/lib/db/models/Category';
import { requireSessionUser } from '@/lib/auth/getSessionUser';
import { assertMonthUnlocked } from '@/lib/locks/service';
import { rangeQuerySchema, searchParamsToObject, upsertPlanSchema } from '@/lib/validation/schemas';
import { handleRouteError, notFound, ok } from '@/lib/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/plans?from=YYYY-MM&to=YYYY-MM */
export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const query = rangeQuerySchema.parse(searchParamsToObject(new URL(request.url)));
    await connectToDatabase();

    // userId first in both the filter and the index -> tenant isolation is
    // enforced by the query itself, not by a post-fetch check.
    const plans = await Plan.find({
      userId: user.userId,
      month: { $gte: query.from, $lte: query.to },
    })
      .sort({ month: 1 })
      .select('_id categoryId month amount')
      .lean();

    return ok({
      plans: plans.map((p) => ({
        id: p._id.toString(),
        categoryId: p.categoryId.toString(),
        month: p.month,
        amount: p.amount,
      })),
    });
  } catch (err) {
    return handleRouteError(err, 'plans:GET');
  }
}

/**
 * PUT /api/plans - upsert a target for (category, month).
 *
 * PUT rather than POST because the unique index makes this idempotent: one
 * target per category per month, so "set Marketing Jan to 5000" twice is one
 * document either way.
 *
 * Check order: auth -> ownership (category must belong to caller) -> lock.
 */
export async function PUT(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = upsertPlanSchema.parse(await request.json());
    await connectToDatabase();

    const categoryId = new Types.ObjectId(body.categoryId);

    // Ownership: scoping by userId means another tenant's category id reads as
    // "not found" rather than revealing that it exists.
    const category = await Category.exists({ _id: categoryId, userId: user.userId });
    if (!category) return notFound('Category not found');

    // Lock check happens after ownership so a locked-month response can never
    // be used to probe for categories the caller does not own.
    await assertMonthUnlocked(user.userId, body.month);

    const plan = await Plan.findOneAndUpdate(
      { userId: user.userId, categoryId, month: body.month },
      { $set: { amount: body.amount } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    ).lean();

    return ok({
      plan: {
        id: plan!._id.toString(),
        categoryId: plan!.categoryId.toString(),
        month: plan!.month,
        amount: plan!.amount,
      },
    });
  } catch (err) {
    return handleRouteError(err, 'plans:PUT');
  }
}
