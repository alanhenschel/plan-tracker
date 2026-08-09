/**
 * Browser-side API helpers shared by every page.
 *
 * The API always answers `{ error: string }` on failure, so error handling is
 * uniform: `ApiRequestError` carries the status (401/404/409/423 all matter to
 * the UI) plus the server's human-readable message.
 */

export class ApiRequestError extends Error {
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(status: number, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = details;
  }

  /** True when the write was refused because the period is closed. */
  get isLocked(): boolean {
    return this.status === 423;
  }
}

async function toError(response: Response): Promise<ApiRequestError> {
  let message = `Request failed with status ${response.status}`;
  let details: Record<string, string[]> | undefined;
  try {
    const body = await response.json();
    if (typeof body?.error === 'string') message = body.error;
    if (body?.details) details = body.details;
  } catch {
    // Non-JSON error body (e.g. an HTML error page) - keep the generic message.
  }
  return new ApiRequestError(response.status, message, details);
}

/** SWR fetcher. */
export async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw await toError(response);
  return response.json() as Promise<T>;
}

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(url: string) => fetcher<T>(url),
  post: <T>(url: string, body?: unknown) => send<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => send<T>('PUT', url, body),
  del: <T>(url: string) => send<T>('DELETE', url),

  /** CSV upload - multipart, so no JSON Content-Type. */
  async uploadCsv<T>(url: string, file: File): Promise<T> {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(url, { method: 'POST', credentials: 'same-origin', body: form });
    if (!response.ok) throw await toError(response);
    return response.json() as Promise<T>;
  },
};

/** Narrows unknown catch values to a message the UI can render. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
