import { cookies } from 'next/headers';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { User } from '@/lib/db/models/User';
import { SESSION_COOKIE, verifySessionToken } from './session';

/**
 * Resolves the authenticated user for a Node-runtime request.
 *
 * `src/middleware.ts` only proves the cookie's signature is valid (it runs on
 * the Edge runtime and cannot reach Mongo). This function is the real gate: it
 * additionally confirms the user still exists, so a token issued for a
 * since-deleted account is rejected rather than trusted.
 */

export interface SessionUser {
  id: string;
  userId: Types.ObjectId;
  email: string;
  name?: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;
  if (!Types.ObjectId.isValid(claims.sub)) return null;

  await connectToDatabase();
  const user = await User.findById(claims.sub).select('_id email name').lean();
  if (!user) return null;

  return {
    id: user._id.toString(),
    userId: user._id,
    email: user.email,
    name: user.name,
  };
}

/** Thrown by `requireSessionUser`; routes map it to a 401. */
export class UnauthorizedError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
