import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Plan } from '@/lib/db/models/Plan';
import { requireSessionUser } from '@/lib/auth/getSessionUser';
import { assertMonthUnlocked } from '@/lib/locks/service';
import { objectIdSchema } from '@/lib/validation/schemas';
import { handleRouteError, notFound, ok } from '@/lib/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string };
}

/** DELETE /api/plans/[id] - remove a target. Blocked for locked months. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireSessionUser();
    const id = objectIdSchema.parse(params.id);
    await connectToDatabase();

    // Fetch under the userId filter first: we need the plan's month to run the
    // lock check, and this doubles as the ownership check.
    const plan = await Plan.findOne({
      _id: new Types.ObjectId(id),
      userId: user.userId,
    })
      .select('_id month')
      .lean();

    if (!plan) return notFound('Plan not found');

    await assertMonthUnlocked(user.userId, plan.month);

    // Re-scope the delete by userId as well - defence in depth if the read
    // above is ever refactored away.
    await Plan.deleteOne({ _id: plan._id, userId: user.userId });

    return ok({ ok: true, id });
  } catch (err) {
    return handleRouteError(err, 'plans/[id]:DELETE');
  }
}
