// @widespread/bridge-client — thin typed wrapper over the bridge's
// public API (see /api/openapi.json for the full surface). No runtime
// deps: fetch + URLSearchParams only.

export interface ClientOptions {
  base?: string;          // default: production bridge
  fetch?: typeof fetch;   // inject for tests/workerd
}

const DEFAULT_BASE = "https://widespread-bridge.widespread.workers.dev";

export interface FeedQuery {
  forge?: string; source?: string; repo?: string; q?: string;
  min_usd?: number; currency?: string; escrow?: string;
  sort?: "reward" | "newest" | "trust"; limit?: number;
  cursor?: string; max_competition?: number; topics?: string;
}

export class WidespreadClient {
  constructor(private opts: ClientOptions = {}) {}
  private get base() { return (this.opts.base ?? DEFAULT_BASE).replace(/\/$/, ""); }
  private get f() { return this.opts.fetch ?? fetch; }

  private async getJson<T>(path: string): Promise<T> {
    const res = await this.f(`${this.base}${path}`);
    if (!res.ok) throw new Error(`${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json() as Promise<T>;
  }
  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await this.f(`${this.base}${path}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json() as Promise<T>;
  }

  /** Unified cross-forge funded-work feed. */
  feed(q: FeedQuery = {}) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined) p.set(k, String(v));
    return this.getJson<Record<string, unknown>>(`/api/feed?${p}`);
  }

  /** Semantic match — free-text interests → ranked records. */
  feedMatch(interests: string, extra: Record<string, unknown> = {}) {
    return this.postJson<Record<string, unknown>>("/mcp", {
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "feed_match", arguments: { interests, ...extra } },
    });
  }

  markets() { return this.getJson<Record<string, unknown>>("/api/markets"); }
  mirrors() { return this.getJson<Record<string, unknown>>("/api/mirrors"); }
  mirrorQuote(record_id: string, spec?: string) {
    return this.postJson<Record<string, unknown>>("/api/bounties/mirror", { record_id, ...(spec ? { spec } : {}) });
  }

  claim(mirror_id: string, forgeRef: string, extra: Record<string, unknown> = {}) {
    return this.postJson<Record<string, unknown>>("/api/mirrors/claims", { mirror_id, forgeRef, ...extra });
  }
  claims(mirror_id: string) {
    return this.getJson<Record<string, unknown>>(`/api/mirrors/claims?mirror_id=${encodeURIComponent(mirror_id)}`);
  }
  verdict(mirror_id: string, claim_hash: string, accept: boolean, extra: Record<string, unknown> = {}) {
    return this.postJson<Record<string, unknown>>("/api/mirrors/verdict", { mirror_id, claim_hash, accept, ...extra });
  }
  payout(mirror_id: string) {
    return this.postJson<Record<string, unknown>>("/api/mirrors/payout", { mirror_id });
  }

  bindPayout(body: Record<string, unknown>) {
    return this.postJson<Record<string, unknown>>("/api/payouts/bind", body);
  }
  payoutFor(forgeUserId: string) {
    return this.getJson<Record<string, unknown>>(`/api/payouts/${encodeURIComponent(forgeUserId)}`);
  }
  repExport(forgeUserId: string) {
    return this.getJson<Record<string, unknown>>(`/api/rep/${encodeURIComponent(forgeUserId)}/export`);
  }

  agents() { return this.getJson<Record<string, unknown>>("/api/agents"); }
  treasury() { return this.getJson<Record<string, unknown>>("/api/treasury"); }
  futarchy() { return this.getJson<Record<string, unknown>>("/api/futarchy"); }
  runners() { return this.getJson<Record<string, unknown>>("/api/runners"); }
  openapi() { return this.getJson<Record<string, unknown>>("/api/openapi.json"); }
}

export function client(opts: ClientOptions = {}): WidespreadClient {
  return new WidespreadClient(opts);
}
