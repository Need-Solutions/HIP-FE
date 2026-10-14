// Thin fetch wrapper. When VITE_USE_MOCKS is true (default until the backend exists),
// calls in api/endpoints.ts are served from api/mock instead.

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false';
const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include', // session cookie set by the backend (AUTH-012)
    ...init,
    // FormData (file uploads) sets its own multipart Content-Type with the boundary.
    headers: { ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
  });
  const body = res.headers.get('content-type')?.includes('application/json') ? await res.json() : undefined;
  if (!res.ok) throw new ApiError(res.status, (body as { message?: string })?.message ?? res.statusText, body);
  return body as T;
}
