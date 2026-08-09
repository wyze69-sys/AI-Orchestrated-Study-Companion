/**
 * Mobile API access helper.
 *
 * Resolves the API base URL from environment configuration and provides a
 * small typed fetch wrapper used by quiz, flashcard, and progress features.
 * Requests fail loudly with an actionable message when no base URL is
 * configured instead of silently calling an empty URL.
 */

export function getApiBaseUrl(): string {
  const direct = process.env.EXPO_PUBLIC_API_URL;
  if (direct && direct.trim()) {
    return direct.trim().replace(/\/+$/, "");
  }
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain && domain.trim()) {
    return `https://${domain.trim()}`;
  }
  throw new Error(
    "API base URL is not configured. Set EXPO_PUBLIC_API_URL (or EXPO_PUBLIC_DOMAIN) before using the API."
  );
}

let unauthorizedHandler: (() => void) | null = null;

export function setApiUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

export class MobileApiError extends Error {
  readonly status: number | null;
  readonly body: unknown;

  constructor(message: string, status: number | null = null, body: unknown = null) {
    super(message);
    this.name = "MobileApiError";
    this.status = status;
    this.body = body;
  }
}

interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string | null;
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const base = getApiBaseUrl();
  const headers: Record<string, string> = {};
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${base}/api${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body instanceof FormData ? (options.body as unknown as BodyInit) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    throw new MobileApiError(
      err instanceof Error ? `Network error: ${err.message}` : "Network error while contacting the API.",
      null,
      null
    );
  }

  if (!response.ok) {
    let body: unknown = null;
    let message = `Request failed with status ${response.status}`;
    try {
      body = await response.json();
    } catch {
      // ignore parse errors; use status-only message
    }
    if (body && typeof body === "object") {
      const detail = (body as Record<string, unknown>).error;
      if (typeof detail === "string" && detail.trim()) {
        message = detail.trim();
      }
    }
    if (response.status === 401) {
      message = "Your session has expired. Please sign in again.";
      unauthorizedHandler?.();
    }
    throw new MobileApiError(message, response.status, body);
  }

  const text = await response.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}