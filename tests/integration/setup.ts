import { vi } from 'vitest';

/**
 * Integration-test double for `next/headers`.
 *
 * Route handlers call `cookies().get(...)`/`cookies().set(...)` directly.
 * Outside of the real Next.js request pipeline (i.e. when a route handler is
 * imported and invoked directly, as these integration tests do) `cookies()`
 * has no request-scoped `AsyncLocalStorage` to read from and throws. This
 * mock replaces it with a single shared, mutable cookie jar that the tests
 * control explicitly via `setSessionCookie`/`clearSessionCookie` before each
 * call — i.e. tests choose "which user is making this request" the same way
 * a real browser's cookie would, just without an actual HTTP transport.
 *
 * Registered globally via `vitest.config.ts`'s `test.setupFiles`, so every
 * test file (unit and integration) gets it; unit tests never touch
 * `next/headers` so it is inert for them.
 */

const cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => {
      if (value === '') {
        cookieJar.delete(name);
      } else {
        cookieJar.set(name, value);
      }
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

export function setSessionCookie(name: string, value: string): void {
  cookieJar.set(name, value);
}

export function clearSessionCookie(name?: string): void {
  if (name) {
    cookieJar.delete(name);
  } else {
    cookieJar.clear();
  }
}

export function getCookieValue(name: string): string | undefined {
  return cookieJar.get(name);
}
