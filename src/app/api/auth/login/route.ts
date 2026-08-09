import { cookies } from 'next/headers';
import { connectToDatabase } from '@/lib/db/connect';
import { User } from '@/lib/db/models/User';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSessionToken, sessionCookieOptions } from '@/lib/auth/session';
import { loginSchema } from '@/lib/validation/schemas';
import { handleRouteError, ok, unauthorized } from '@/lib/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A bcrypt hash of a throwaway string, computed once per process. When the
 * email is unknown we still run a comparison against it so an attacker cannot
 * enumerate registered emails by timing the response.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('timing-equalizer-not-a-real-password');
  return dummyHashPromise;
}

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());
    await connectToDatabase();

    // passwordHash is `select: false` on the schema, so ask for it explicitly.
    const user = await User.findOne({ email: body.email }).select('+passwordHash').lean();

    const hash = user?.passwordHash ?? (await getDummyHash());
    const passwordMatches = await verifyPassword(body.password, hash);

    if (!user || !passwordMatches) {
      // One message for both cases - never reveal which half was wrong.
      return unauthorized('Invalid email or password');
    }

    const token = await createSessionToken({ sub: user._id.toString(), email: user.email });
    cookies().set(sessionCookieOptions().name, token, sessionCookieOptions());

    return ok({
      user: { id: user._id.toString(), email: user.email, name: user.name ?? null },
    });
  } catch (err) {
    return handleRouteError(err, 'auth/login');
  }
}
