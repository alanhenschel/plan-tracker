import { connectToDatabase } from '@/lib/db/connect';
import { Lock } from '@/lib/db/models/Lock';
import { requireSessionUser } from '@/lib/auth/getSessionUser';
import { monthSchema } from '@/lib/validation/schemas';
import { handleRouteError, notFound, ok } from '@/lib/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { month: string };
}

/**
 * DELETE /api/locks/[month] - reopen a period.
 *
 * In a real finance product this would be a privileged action with an audit
 * trail entry (who reopened, when, why). Here any owner may reopen their own
 * period; the audit-trail gap is called out in the README as a
 * before-production improvement.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireSessionUser();
    const month = monthSchema.parse(params.month);
    await connectToDatabase();

    const result = await Lock.deleteOne({ userId: user.userId, month });
    if (result.deletedCount === 0) {
      return notFound(`Period ${month} is not locked`);
    }

    return ok({ ok: true, month });
  } catch (err) {
    return handleRouteError(err, 'locks/[month]:DELETE');
  }
}
