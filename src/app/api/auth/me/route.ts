import { getSessionUser } from '@/lib/auth/getSessionUser';
import { handleRouteError, ok, unauthorized } from '@/lib/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();
    return ok({ user: { id: user.id, email: user.email, name: user.name ?? null } });
  } catch (err) {
    return handleRouteError(err, 'auth/me');
  }
}
