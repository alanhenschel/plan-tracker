// Node 18 (this project's target — see work.log.md D2) does not expose `File`
// as a global; it only became global in Node 20. Import it explicitly so the
// multipart upload test path works on the pinned dev Node version.
import { File } from 'node:buffer';
import { setSessionCookie, clearSessionCookie, getCookieValue } from '../setup';
import { SESSION_COOKIE } from '@/lib/auth/session';

import * as signupRoute from '@/app/api/auth/signup/route';
import * as loginRoute from '@/app/api/auth/login/route';
import * as logoutRoute from '@/app/api/auth/logout/route';
import * as meRoute from '@/app/api/auth/me/route';
import * as categoriesRoute from '@/app/api/categories/route';
import * as plansRoute from '@/app/api/plans/route';
import * as planByIdRoute from '@/app/api/plans/[id]/route';
import * as actualsRoute from '@/app/api/actuals/route';
import * as actualByIdRoute from '@/app/api/actuals/[id]/route';
import * as importRoute from '@/app/api/actuals/import/route';
import * as importBatchRoute from '@/app/api/actuals/import/[batchId]/route';
import * as locksRoute from '@/app/api/locks/route';
import * as lockByMonthRoute from '@/app/api/locks/[month]/route';
import * as reportRoute from '@/app/api/report/route';

/**
 * Thin wrapper around the real route handlers (the same functions Next.js
 * would invoke), so integration tests exercise real auth, real ownership
 * filters, real lock checks and real Mongoose queries — everything except
 * the actual HTTP transport and the framework's cookie plumbing, which
 * `tests/integration/setup.ts` stands in for.
 */

export interface ApiResult<T = any> {
  status: number;
  body: T;
}

async function toResult<T = any>(res: Response): Promise<ApiResult<T>> {
  const status = res.status;
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  return { status, body };
}

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function qs(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) usp.set(k, v);
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

const BASE = 'http://localhost';

// ------------------------------------------------------------ session control

/** Makes subsequent calls act as this user by installing their session cookie. */
export function actAs(token: string): void {
  setSessionCookie(SESSION_COOKIE, token);
}

/** Makes subsequent calls unauthenticated. */
export function actAsGuest(): void {
  clearSessionCookie(SESSION_COOKIE);
}

function currentToken(): string | undefined {
  return getCookieValue(SESSION_COOKIE);
}

// ---------------------------------------------------------------------- auth

export interface SignedUpUser {
  status: number;
  body: any;
  token: string;
  userId: string | undefined;
}

/** Signs up a fresh user and returns their session token (does NOT switch the active session). */
export async function signup(email: string, password: string, name?: string): Promise<SignedUpUser> {
  actAsGuest();
  const res = await signupRoute.POST(jsonRequest(`${BASE}/api/auth/signup`, 'POST', { email, password, name }));
  const { status, body } = await toResult(res);
  const token = currentToken();
  if (!token) throw new Error(`signup(${email}) did not set a session cookie (status ${status}): ${JSON.stringify(body)}`);
  return { status, body, token, userId: body?.user?.id };
}

export async function login(email: string, password: string): Promise<ApiResult> {
  actAsGuest();
  const res = await loginRoute.POST(jsonRequest(`${BASE}/api/auth/login`, 'POST', { email, password }));
  return toResult(res);
}

export async function logout(): Promise<ApiResult> {
  const res = await logoutRoute.POST();
  return toResult(res);
}

export async function me(): Promise<ApiResult> {
  const res = await meRoute.GET();
  return toResult(res);
}

// --------------------------------------------------------------- categories

export async function getCategories(): Promise<ApiResult> {
  const res = await categoriesRoute.GET();
  return toResult(res);
}

export async function createCategory(name: string): Promise<ApiResult> {
  const res = await categoriesRoute.POST(jsonRequest(`${BASE}/api/categories`, 'POST', { name }));
  return toResult(res);
}

// -------------------------------------------------------------------- plans

export async function getPlans(from: string, to: string): Promise<ApiResult> {
  const res = await plansRoute.GET(new Request(`${BASE}/api/plans${qs({ from, to })}`));
  return toResult(res);
}

export async function putPlan(categoryId: string, month: string, amount: number): Promise<ApiResult> {
  const res = await plansRoute.PUT(jsonRequest(`${BASE}/api/plans`, 'PUT', { categoryId, month, amount }));
  return toResult(res);
}

export async function deletePlan(id: string): Promise<ApiResult> {
  const res = await planByIdRoute.DELETE(new Request(`${BASE}/api/plans/${id}`, { method: 'DELETE' }), {
    params: { id },
  });
  return toResult(res);
}

// ------------------------------------------------------------------ actuals

export async function getActuals(from: string, to: string, categoryId?: string): Promise<ApiResult> {
  const res = await actualsRoute.GET(new Request(`${BASE}/api/actuals${qs({ from, to, categoryId })}`));
  return toResult(res);
}

export async function postActual(
  categoryId: string,
  month: string,
  amount: number,
  note?: string,
): Promise<ApiResult> {
  const res = await actualsRoute.POST(
    jsonRequest(`${BASE}/api/actuals`, 'POST', { categoryId, month, amount, note }),
  );
  return toResult(res);
}

export async function putActual(
  id: string,
  body: { categoryId?: string; month?: string; amount?: number; note?: string },
): Promise<ApiResult> {
  const res = await actualByIdRoute.PUT(jsonRequest(`${BASE}/api/actuals/${id}`, 'PUT', body), {
    params: { id },
  });
  return toResult(res);
}

export async function deleteActual(id: string): Promise<ApiResult> {
  const res = await actualByIdRoute.DELETE(new Request(`${BASE}/api/actuals/${id}`, { method: 'DELETE' }), {
    params: { id },
  });
  return toResult(res);
}

// -------------------------------------------------------------------- locks

export async function getLocks(from: string, to: string): Promise<ApiResult> {
  const res = await locksRoute.GET(new Request(`${BASE}/api/locks${qs({ from, to })}`));
  return toResult(res);
}

export async function postLock(month: string): Promise<ApiResult> {
  const res = await locksRoute.POST(jsonRequest(`${BASE}/api/locks`, 'POST', { month }));
  return toResult(res);
}

export async function deleteLock(month: string): Promise<ApiResult> {
  const res = await lockByMonthRoute.DELETE(new Request(`${BASE}/api/locks/${month}`, { method: 'DELETE' }), {
    params: { month },
  });
  return toResult(res);
}

// ------------------------------------------------------------------- report

export async function getReport(from: string, to: string, categoryId?: string): Promise<ApiResult> {
  const res = await reportRoute.GET(new Request(`${BASE}/api/report${qs({ from, to, categoryId })}`));
  return toResult(res);
}

// -------------------------------------------------------------- csv import

export async function importCsv(csvText: string, contentType = 'text/csv'): Promise<ApiResult> {
  const res = await importRoute.POST(
    new Request(`${BASE}/api/actuals/import`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: csvText,
    }),
  );
  return toResult(res);
}

export async function importCsvMultipart(csvText: string, filename = 'actuals.csv'): Promise<ApiResult> {
  const form = new FormData();
  // `node:buffer`'s File and the DOM lib's Blob are structurally incompatible
  // under @types/node 20 + TS 5.7 (`bytes(): Promise<Uint8Array<ArrayBufferLike>>`
  // vs `Promise<Uint8Array<ArrayBuffer>>`), which fails `next build`'s type
  // check even though they are the same object at runtime — this is exactly the
  // File that Next's `request.formData()` hands the route. Cast, don't switch to
  // a Blob: the route's `file instanceof File` check must still match.
  form.set('file', new File([csvText], filename, { type: 'text/csv' }) as unknown as Blob);
  const res = await importRoute.POST(
    new Request(`${BASE}/api/actuals/import`, {
      method: 'POST',
      body: form,
    }),
  );
  return toResult(res);
}

export async function deleteImportBatch(batchId: string): Promise<ApiResult> {
  const res = await importBatchRoute.DELETE(
    new Request(`${BASE}/api/actuals/import/${batchId}`, { method: 'DELETE' }),
    { params: { batchId } },
  );
  return toResult(res);
}
