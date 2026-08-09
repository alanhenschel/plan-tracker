import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Actual } from '@/lib/db/models/Actual';
import { Category } from '@/lib/db/models/Category';
import { requireSessionUser } from '@/lib/auth/getSessionUser';
import { assertMonthUnlocked, assertMonthsUnlocked } from '@/lib/locks/service';
import { objectIdSchema, updateActualSchema } from '@/lib/validation/schemas';
import { handleRouteError, notFound, ok } from '@/lib/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string };
}

/** PUT /api/actuals/[id] - partial update of a logged actual. */
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const user = await requireSessionUser();
    const id = objectIdSchema.parse(params.id);
    const body = updateActualSchema.parse(await request.json());
    await connectToDatabase();

    const existing = await Actual.findOne({
      _id: new Types.ObjectId(id),
      userId: user.userId,
    })
      .select('_id month categoryId')
      .lean();

    if (!existing) return notFound('Actual not found');

    // Both the current month and the target month must be open. Checking only
    // the target would let a user move spend OUT of a closed period, which
    // would silently change that period's already-signed-off numbers.
    const targetMonth = body.month ?? existing.month;
    await assertMonthsUnlocked(user.userId, [existing.month, targetMonth]);

    if (body.categoryId) {
      const category = await Category.exists({
        _id: new Types.ObjectId(body.categoryId),
        userId: user.userId,
      });
      if (!category) return notFound('Category not found');
    }

    const update: Record<string, unknown> = {};
    if (body.categoryId !== undefined) update.categoryId = new Types.ObjectId(body.categoryId);
    if (body.month !== undefined) update.month = body.month;
    if (body.amount !== undefined) update.amount = body.amount;
    if (body.note !== undefined) update.note = body.note;

    const updated = await Actual.findOneAndUpdate(
      { _id: existing._id, userId: user.userId },
      { $set: update },
      { new: true, runValidators: true },
    ).lean();

    if (!updated) return notFound('Actual not found');

    return ok({
      actual: {
        id: updated._id.toString(),
        categoryId: updated.categoryId.toString(),
        month: updated.month,
        amount: updated.amount,
        note: updated.note ?? null,
        source: updated.source,
      },
    });
  } catch (err) {
    return handleRouteError(err, 'actuals/[id]:PUT');
  }
}

/** DELETE /api/actuals/[id] */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireSessionUser();
    const id = objectIdSchema.parse(params.id);
    await connectToDatabase();

    const existing = await Actual.findOne({
      _id: new Types.ObjectId(id),
      userId: user.userId,
    })
      .select('_id month')
      .lean();

    if (!existing) return notFound('Actual not found');

    await assertMonthUnlocked(user.userId, existing.month);

    await Actual.deleteOne({ _id: existing._id, userId: user.userId });

    return ok({ ok: true, id });
  } catch (err) {
    return handleRouteError(err, 'actuals/[id]:DELETE');
  }
}
