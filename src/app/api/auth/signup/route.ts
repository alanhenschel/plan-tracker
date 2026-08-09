import { cookies } from 'next/headers';
import { connectToDatabase } from '@/lib/db/connect';
import { User } from '@/lib/db/models/User';
import { Category, DEFAULT_CATEGORY_NAMES } from '@/lib/db/models/Category';
import { hashPassword } from '@/lib/auth/password';
import { createSessionToken, sessionCookieOptions } from '@/lib/auth/session';
import { signupSchema } from '@/lib/validation/schemas';
import { conflict, created, handleRouteError, isDuplicateKeyError } from '@/lib/apiResponse';

export const runtime = 'nodejs';
// Auth mutates cookies; never let Next try to statically optimise this.
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = signupSchema.parse(await request.json());
    await connectToDatabase();

    const passwordHash = await hashPassword(body.password);

    let user;
    try {
      user = await User.create({
        email: body.email,
        passwordHash,
        name: body.name,
      });
    } catch (err) {
      // Unique index on email is the source of truth - a findOne pre-check
      // would still race with a concurrent signup.
      if (isDuplicateKeyError(err)) {
        return conflict('An account with that email already exists');
      }
      throw err;
    }

    // Seed the three default categories so a new account has something to plan
    // against immediately. insertMany is not atomic with User.create; if it
    // fails the account still works and the user can create categories by hand,
    // so we surface nothing and let the categories page handle the empty state.
    try {
      await Category.insertMany(
        DEFAULT_CATEGORY_NAMES.map((name) => ({ userId: user._id, name })),
        { ordered: false },
      );
    } catch (err) {
      console.error('[api:auth/signup] default category seeding failed', err);
    }

    const token = await createSessionToken({ sub: user._id.toString(), email: user.email });
    cookies().set(sessionCookieOptions().name, token, sessionCookieOptions());

    return created({
      user: { id: user._id.toString(), email: user.email, name: user.name ?? null },
    });
  } catch (err) {
    return handleRouteError(err, 'auth/signup');
  }
}
