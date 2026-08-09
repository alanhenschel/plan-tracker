import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/**
 * One error shape for the whole API: `{ error: string }`, optionally with
 * `details` for field-level validation feedback. Clients never have to branch
 * on which route failed to find the message.
 */

export interface ApiError {
  error: string;
  details?: Record<string, string[]>;
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function badRequest(message: string, details?: Record<string, string[]>): NextResponse {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status: 400 });
}

export function unauthorized(message = 'Authentication required'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = 'Forbidden'): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Used for both "does not exist" and "exists but belongs to another user".
 * Returning 403 for the second case would leak the existence of other tenants'
 * records, so ownership failures are deliberately indistinguishable from 404s.
 */
export function notFound(message = 'Not found'): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function conflict(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 });
}

/** 423 Locked - the accounting period is closed. */
export function locked(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 423 });
}

export function serverError(message = 'Internal server error'): NextResponse {
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Flattens a ZodError into a 400 with per-field messages. */
export function validationError(err: ZodError): NextResponse {
  const flattened = err.flatten();
  const details: Record<string, string[]> = { ...flattened.fieldErrors } as Record<string, string[]>;
  if (flattened.formErrors.length > 0) {
    details._form = flattened.formErrors;
  }
  const first =
    Object.entries(details)
      .map(([field, messages]) => `${field}: ${messages[0]}`)
      .at(0) ?? 'Invalid request';
  return badRequest(first, details);
}

/** True for a MongoDB duplicate-key error, whatever driver layer threw it. */
export function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 11000
  );
}

/**
 * Single catch-all for route handlers. Maps the app's sentinel errors to the
 * right status so no handler ever leaks a stack trace or a raw 500:
 *
 *   UnauthorizedError -> 401
 *   LockedPeriodError -> 423
 *   ZodError          -> 400 with field details
 *   duplicate key     -> 409
 *   anything else     -> 500 with a generic message (details only to the log)
 */
export function handleRouteError(err: unknown, context: string): NextResponse {
  if (err instanceof ZodError) return validationError(err);

  if (err instanceof Error) {
    if (err.name === 'UnauthorizedError') return unauthorized(err.message);
    if (err.name === 'LockedPeriodError') return locked(err.message);
    if (err.name === 'ValidationError') return badRequest(err.message);
    if (err.name === 'CastError') return badRequest('Malformed identifier in request');
  }

  if (isDuplicateKeyError(err)) {
    return conflict('That record already exists');
  }

  // Log server-side, return an opaque message client-side.
  console.error(`[api:${context}]`, err);
  return serverError();
}
