import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

/**
 * Edge middleware: a cheap first gate only.
 *
 * It verifies the JWT signature (jose works on the Edge runtime) but does NOT
 * touch MongoDB - mongoose and bcryptjs are not edge-safe, and a DB round trip
 * on every asset request would be wasteful. Authorization proper still happens
 * per-request in `getSessionUser`, which confirms the user record still exists.
 * Treat this purely as a redirect optimisation, never as the security boundary.
 */

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/categories',
  '/plans',
  '/actuals',
  '/report',
  '/locks',
];

const AUTH_PAGES = ['/login', '/signup'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySessionToken(token) : null;
  const isAuthenticated = claims !== null;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Preserve the destination so login can bounce the user back.
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && AUTH_PAGES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Deliberately excludes /api/*: API routes must answer 401 with JSON, not
   * redirect to an HTML login page. They authenticate themselves via
   * getSessionUser.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
