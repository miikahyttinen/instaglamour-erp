import type { ErrorCode, FieldCode } from './enums';
import { ERROR_CODES } from './enums';
import type { ApiErrorBody } from './types';

/**
 * Error thrown for every non-2xx response. `code` comes from the contract's error format;
 * when the body is missing or not in that format (e.g. network/proxy failure) `code` is
 * `UNKNOWN` (or `NETWORK_ERROR` when the request never reached a server).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'UNKNOWN' | 'NETWORK_ERROR';
  readonly fields: Partial<Record<string, FieldCode>>;
  /** `error.details` of the body (e.g. `purchaseOrderNumber`, `costLineIds`), else `{}`. */
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: ApiError['code'],
    message: string,
    fields: Partial<Record<string, FieldCode>> = {},
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.details = details;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

type UnauthenticatedListener = () => void;
const unauthenticatedListeners = new Set<UnauthenticatedListener>();

/** Called on any 401 from any API call. Returns an unsubscribe function. */
export function onUnauthenticated(listener: UnauthenticatedListener): () => void {
  unauthenticatedListeners.add(listener);
  return () => {
    unauthenticatedListeners.delete(listener);
  };
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON body (objects) or FormData (uploads). */
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
}

export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `/api${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function parseErrorBody(body: unknown): ApiErrorBody['error'] | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null;
  const error = (body as { error: unknown }).error;
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return error as ApiErrorBody['error'];
}

/** Low-level request. Paths are relative to `/api` (e.g. `/me`). */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
      signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  if (!response.ok) {
    const parsed = parseErrorBody(data);
    const code =
      parsed && (ERROR_CODES as readonly string[]).includes(parsed.code)
        ? parsed.code
        : response.status === 401
          ? 'UNAUTHENTICATED'
          : 'UNKNOWN';
    const error = new ApiError(
      response.status,
      code,
      parsed?.message ?? `HTTP ${response.status}`,
      parsed?.fields ?? {},
      parsed?.details ?? {},
    );
    if (response.status === 401) {
      unauthenticatedListeners.forEach((listener) => listener());
    }
    throw error;
  }

  return data as T;
}
