import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/**
 * Session tokens: HS256 JWT in an httpOnly cookie.
 *
 * `jose` (not `jsonwebtoken`) because it runs on the Edge runtime, which is
 * what `src/middleware.ts` needs in order to verify the cookie signature
 * without a Node runtime or a database round-trip.
 */

export const SESSION_COOKIE = 'cv_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const ISSUER = 'crossval-plan-vs-actual';

export interface SessionClaims {
  /** User `_id` as a hex string. */
  sub: string;
  email: string;
}

let cachedKey: Uint8Array | null = null;

function getSecretKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    // Fail closed and loudly: a short/absent secret means forgeable sessions.
    throw new Error(
      'AUTH_SECRET is missing or shorter than 32 characters. Generate one with: openssl rand -hex 32',
    );
  }
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

export async function createSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

/** Returns the claims, or `null` for any invalid/expired/forged token. */
export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: ISSUER,
      algorithms: ['HS256'],
    });
    return toClaims(payload);
  } catch {
    // Any failure - bad signature, expired, malformed - is just "no session".
    return null;
  }
}

function toClaims(payload: JWTPayload): SessionClaims | null {
  const sub = payload.sub;
  const email = payload.email;
  if (typeof sub !== 'string' || typeof email !== 'string') return null;
  return { sub, email };
}

/** Cookie attributes shared by the login and logout routes. */
export function sessionCookieOptions(maxAge: number = SESSION_TTL_SECONDS) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    // Secure only in production so plain-http localhost still works in dev.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export { SESSION_TTL_SECONDS };
