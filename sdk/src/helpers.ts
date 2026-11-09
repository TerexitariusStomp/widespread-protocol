// helpers.ts — the utilities every pack ends up needing. Dependency-free,
// Workers-safe (WebCrypto + fetch only).

import type { DomainCtx } from "./types.ts";

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface FetchJsonResult<T> {
  data: T | null;
  error?: string;
  status?: number;
}

/** fetch JSON with a hard timeout and a uniform error shape — packs return
 * error strings as failures, never throw for reachable failure modes. */
export async function fetchJson<T>(
  ctx: DomainCtx,
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number; method?: string; body?: unknown } = {},
): Promise<FetchJsonResult<T>> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  try {
    const res = await ctx.fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.headers ?? {},
      body: opts.body === undefined ? null : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { data: null, status: res.status, error: `http ${res.status} for ${url}` };
    }
    return { data: (await res.json()) as T, status: res.status };
  } catch (e) {
    return { data: null, error: `fetch failed for ${url}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Typed read of verification.params — packs declare their params in
 * domain.yaml; this keeps parsing honest without a schema dep. */
export function param<T>(input: { market: { verification?: { params?: Record<string, unknown> } } }, key: string): T | undefined {
  return input.market.verification?.params?.[key] as T | undefined;
}
