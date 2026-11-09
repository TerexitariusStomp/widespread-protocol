// research-reports — payer-accept class with structural checks. Written
// deliverables can't be judged by a machine honestly, but they CAN be
// checked structurally: exists, hashed at claim time, non-trivial length,
// required sections present, citations present when the spec asks. The
// quality verdict remains the payer's — evidence carries the objective
// facts a payer reviews against.

import type { DomainCtx, ValidateInput, ValidateResult } from "@widespread/protocol-sdk";
import { sha256Hex, param } from "@widespread/protocol-sdk";

const URL_RE = /^https?:\/\//i;

export async function validate(input: ValidateInput, ctx: DomainCtx): Promise<ValidateResult> {
  const failures: string[] = [];
  const evidence: Record<string, unknown> = { ...(input.claim.evidence ?? {}) };
  const ref = input.claim.ref?.trim() ?? "";
  if (!ref) return { failures: ["claim.ref required (URL or 'inline:<content>')"], evidence };

  // resolve — fetch or accept inline content; hash it at claim time
  let content = "";
  if (ref.startsWith("inline:")) {
    content = ref.slice(7);
    evidence["delivery"] = "inline";
  } else if (URL_RE.test(ref)) {
    try {
      const res = await ctx.fetch(ref, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) {
        failures.push(`artifact not resolvable: http ${res.status} for ${ref}`);
      } else {
        content = await res.text();
        evidence["delivery"] = "url";
      }
    } catch (e) {
      failures.push(`artifact not resolvable: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    failures.push("claim.ref must be a URL or 'inline:<content>'");
  }
  if (!content) return { failures, evidence };

  evidence["url"] = ref.startsWith("inline:") ? undefined : ref;
  evidence["content_sha256"] = `sha256:${await sha256Hex(content)}`;
  evidence["content_length"] = content.length;
  evidence["word_count"] = content.split(/\s+/).filter(Boolean).length;
  evidence["verdict_authority"] = "payer";

  // actor — recorded, not verified
  if (!input.claim.actor) failures.push("claim.actor required — who wrote it?");
  else evidence["actor"] = input.claim.actor;

  // bind-spec — structural params only (honest surface checks)
  const minWords = param<number>(input, "min_words");
  if (minWords !== undefined && (evidence["word_count"] as number) < minWords) {
    failures.push(`${evidence["word_count"]} words < min_words ${minWords}`);
  }
  const sections = param<string[]>(input, "required_sections") ?? [];
  const lower = content.toLowerCase();
  for (const h of sections) {
    if (!lower.includes(h.toLowerCase())) failures.push(`required section missing: "${h}"`);
  }
  const minCitations = param<number>(input, "min_citations");
  if (minCitations !== undefined) {
    const cites = (content.match(/https?:\/\/[^\s)\]]+/g) ?? []).length
      + (content.match(/\[\d+\]/g) ?? []).length;
    evidence["citation_count"] = cites;
    if (cites < minCitations) failures.push(`${cites} citations < min_citations ${minCitations}`);
  }
  const since = input.market.created_at;
  const dateM = content.match(/\b(20\d{2})[-/.](\d{2})[-/.](\d{2})\b/);
  if (since && dateM) {
    const ms = Date.parse(`${dateM[1]}-${dateM[2]}-${dateM[3]}T00:00:00Z`);
    if (Number.isFinite(ms) && ms < since - 86_400_000) {
      failures.push("document date predates market — replay suspected");
    }
  }

  return { failures, evidence };
}
