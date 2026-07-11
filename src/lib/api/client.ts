import type { z } from 'zod';
import { config } from '@/config/env';

/**
 * Low-level HTTP primitive. Auth-agnostic: it knows about JSON, the backend's
 * standard error envelope (`{ message, status, path }`), and Zod validation —
 * but nothing about tokens beyond attaching a bearer string if one is handed in.
 *
 * The session layer (`features/auth/session.ts`) supplies tokens and orchestrates
 * refresh; this file has no notion of a store.
 */

/** Thrown for every non-2xx response. `message` is the user-safe backend envelope message. */
export class ApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(message: string, status: number, path: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** JSON-serialized when present. Its presence also drives the `Content-Type` header. */
  body?: unknown;
  /** Attached as `Authorization: Bearer <token>` when truthy. */
  token?: string | null;
  /** Response validation. Omit for empty-body responses (e.g. 204 logout). */
  schema?: z.ZodType<T>;
  signal?: AbortSignal;
}

export async function request<T>(
  path: string,
  options: RequestOptions<T> = {},
): Promise<T> {
  const { method = 'GET', body, token, schema, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  // In dev `apiBaseUrl` is '' → same-origin → the Vite proxy forwards `/api`.
  // In prod it's the absolute base. Call sites pass full paths incl. `/api`.
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  // Parse defensively: read text first, JSON.parse guarded. Several contract
  // cases have an empty body (204 logout, Spring Security's empty 403 on /me).
  const text = await res.text();
  let json: unknown;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // Non-JSON body — leave `json` undefined and fall through to the handling below.
    }
  }

  if (!res.ok) {
    if (
      json &&
      typeof json === 'object' &&
      'message' in json &&
      typeof (json as { message: unknown }).message === 'string'
    ) {
      const env = json as { message: string; status?: number; path?: string };
      throw new ApiError(env.message, env.status ?? res.status, env.path ?? path);
    }
    // Empty-body or non-JSON error. Notably Spring Security's empty 403 on `/me`
    // when the bearer is missing/expired — synthesize an ApiError (with the real
    // status) so the store's refresh-on-401/403 path triggers instead of crashing.
    throw new ApiError(res.statusText || 'Request failed', res.status, path);
  }

  // Empty-body success (204 logout, or any 2xx with no body).
  if (res.status === 204 || !text) return undefined as T;

  // A schema mismatch throws — surfacing backend/contract drift early rather than
  // silently swallowing it.
  if (schema) return schema.parse(json);
  return undefined as T;
}
