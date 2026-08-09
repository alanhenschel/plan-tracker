import { cookies } from 'next/headers';
import { sessionCookieOptions } from '@/lib/auth/session';
import { handleRouteError, ok } from '@/lib/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // maxAge 0 expires the cookie immediately. Same attributes as when it was
    // set, otherwise some browsers keep the original cookie around.
    const options = sessionCookieOptions(0);
    cookies().set(options.name, '', options);
    return ok({ ok: true });
  } catch (err) {
    return handleRouteError(err, 'auth/logout');
  }
}
