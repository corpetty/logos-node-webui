// Thin typed client over the node HTTP API. All calls go through the `/api` prefix,
// which the Vite dev server proxies to the node (sneg via ssh tunnel in dev; the node
// service in the DAppNode package in prod). See docs/spec/api-map.md for the full map.
//
// This module owns transport only: the fetch wrapper, ApiError, and the query-string
// helper. Typed per-endpoint functions live in `endpoints.ts`; response/body shapes
// live in `types.ts`.

/** Prefix every request path is joined to. The dev proxy rewrites `/api` -> node origin. */
export const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Reads give up after this long. While the node is Bootstrapping, some endpoints
 * (pow/status, pow/rewards/claimable, blend/info) never answer; without a deadline the
 * monitor's Promise.allSettled never settles and the dashboard stays on "Not started".
 */
export const READ_TIMEOUT_MS = 6000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isRead = !init?.method || init.method === "GET";
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...(isRead && !init?.signal ? { signal: AbortSignal.timeout(READ_TIMEOUT_MS) } : {}),
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }
  // Some reads (e.g. /leader/claim/vouchers) are served as text/plain despite a JSON
  // body, and mutating calls may return an empty body — parse JSON when present.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Build a `?a=1&b=2` query string from a params object, dropping `undefined`/`null`.
 * Returns "" when nothing is set (so it is always safe to append).
 */
export function buildQuery(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return "";
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) usp.append(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  // Mutating calls (transfers, mining start/stop, etc.) are added per the api-map spec
  // in endpoints.ts with explicit, typed request bodies and guarded UI confirmation.
  // Only an omitted (`undefined`) body sends no payload; a literal `null` is
  // serialized as JSON `null` — some endpoints (e.g. /sdp/set-declaration-id,
  // `Option<DeclarationId>`) use `null` to mean "clear".
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
};

// --- Back-compat re-exports (the app shell imported these from ./client) ------
export type { CryptarchiaInfoResponse as CryptarchiaInfo } from "./types";
export { getCryptarchiaInfo } from "./endpoints";
