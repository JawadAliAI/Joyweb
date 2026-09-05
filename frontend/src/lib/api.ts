/**
 * Typed API client.
 *
 * The backend speaks one envelope — `{success, data}` or `{success, error}` —
 * so unwrapping and error handling live here rather than in every caller.
 * Authentication rides on HTTP-only cookies, which the browser attaches
 * automatically; the readable CSRF cookie is echoed back in a header to satisfy
 * the double-submit check on mutations.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(status: number, error: ApiErrorShape) {
    super(error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }

  /** True when the caller simply is not signed in — the app redirects rather than alerting. */
  get isAuthError() {
    return this.status === 401 || this.code === 'UNAUTHENTICATED';
  }

  get isRestriction() {
    return this.code === 'ACCOUNT_RESTRICTED' || this.code === 'FEATURE_DISABLED';
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : null;
}

type Json = Record<string, unknown> | unknown[];

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: Json;
  /** Query string parameters; undefined and null entries are dropped. */
  params?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, params?: RequestOptions['params']) {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, headers, ...rest } = options;
  const method = (rest.method || 'GET').toUpperCase();

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string> | undefined),
  };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = readCookie('cd_csrf');
    if (csrf) finalHeaders['x-csrf-token'] = csrf;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      ...rest,
      method,
      headers: finalHeaders,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Network-level failure: the server was never reached.
    throw new ApiError(0, {
      code: 'NETWORK_ERROR',
      message: 'Could not reach the server. Check your connection and try again.',
    });
  }

  if (response.status === 204) return undefined as T;

  let payload: { success?: boolean; data?: T; error?: ApiErrorShape } | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    throw new ApiError(
      response.status,
      payload?.error ?? {
        code: 'UNEXPECTED_ERROR',
        message: 'Something went wrong. Please try again.',
      },
    );
  }

  return payload.data as T;
}

export const api = {
  get: <T>(path: string, params?: RequestOptions['params']) =>
    apiRequest<T>(path, { method: 'GET', params }),
  post: <T>(path: string, body?: Json, params?: RequestOptions['params']) =>
    apiRequest<T>(path, { method: 'POST', body, params }),
  patch: <T>(path: string, body?: Json) => apiRequest<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: Json) => apiRequest<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

/** Turns any thrown value into a message safe to show a user. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
