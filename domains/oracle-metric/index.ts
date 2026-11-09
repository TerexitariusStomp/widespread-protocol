// oracle-metric — the outcome-verified class: "did it work?" rather than
// "was it shipped?". Marketing markets actually want this — nobody pays
// for a tweet; they pay for impressions. The pack reads a declared metric
// endpoint, extracts the named numeric field, and checks the market's
// threshold params. Honest determinism: oracle-read — we trust the
// metric's source as declared; the market binds WHICH endpoint, so the
// payer chooses the oracle.

import type { DomainCtx, ValidateInput, ValidateResult } from "@widespread/protocol-sdk";
import { fetchJson, sha256Hex, param } from "@widespread/protocol-sdk";

/** Tiny dotted-path resolver: "a.b.c" → obj.a?.b?.c (arrays by index). */
function dig(obj: unknown, path: string): unknown {
  let cur = obj;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export async function validate(input: ValidateInput, ctx: DomainCtx): Promise<ValidateResult> {
  const failures: string[] = [];
  const evidence: Record<string, unknown> = { ...(input.claim.evidence ?? {}) };

  // Required params — the market must declare what number proves the work.
  const field = param<string>(input, "field");
  const min = param<number>(input, "min");
  const max = param<number>(input, "max");
  const url = input.claim.ref?.trim() ?? "";
  if (!/^https?:\/\//i.test(url)) {
    return { failures: ["claim.ref must be the metric endpoint URL reporting the outcome"], evidence };
  }
  if (!field) failures.push("verification.params.field required — which numeric field proves the outcome");
  if (min === undefined && max === undefined) {
    failures.push("verification.params needs min or max — the threshold that defines the outcome");
  }
  if (failures.length) return { failures, evidence };

  // resolve — read the metric at claim time (hash of raw payload kept)
  const headers: Record<string, string> = { accept: "application/json" };
  if (ctx.env.METRIC_BEARER_TOKEN) headers["authorization"] = `Bearer ${ctx.env.METRIC_BEARER_TOKEN}`;
  const { data, error } = await fetchJson<Record<string, unknown>>(ctx, url, { headers });
  if (error || !data) {
    failures.push(`metric endpoint not resolvable: ${error ?? "empty response"}`);
    return { failures, evidence };
  }
  evidence["metric_url_hash"] = `sha256:${await sha256Hex(url)}`;
  evidence["fetched_at"] = new Date().toISOString();
  evidence["raw_sha256"] = `sha256:${await sha256Hex(JSON.stringify(data))}`;

  // prove-work — the number exists and is numeric
  const value = dig(data, field!);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    failures.push(`field "${field}" is not a number at metric endpoint (got ${JSON.stringify(value)})`);
    return { failures, evidence };
  }
  evidence["metric_field"] = field;
  evidence["metric_value"] = value;

  // bind-spec — threshold checks the market declared
  if (min !== undefined && value < min) failures.push(`metric ${value} < min ${min}`);
  if (max !== undefined && value > max) failures.push(`metric ${value} > max ${max}`);

  // window — outcome must postdate the market (replay defense)
  const since = param<number>(input, "window_start") ?? input.market.created_at;
  const observed = param<string>(input, "observed_field");
  if (observed) {
    const ts = dig(data, observed);
    const ms = typeof ts === "string" ? Date.parse(ts) : typeof ts === "number" ? ts : NaN;
    if (Number.isFinite(ms)) {
      evidence["observed_at"] = new Date(ms).toISOString();
      if (since !== undefined && ms < since) {
        failures.push("metric observation predates market — outcome not earned for this market");
      }
    }
  }

  if (input.claim.actor) evidence["actor"] = input.claim.actor;
  return { failures, evidence };
}
