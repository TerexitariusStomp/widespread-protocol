// payer-accept — the honest pack for subjective domains. For work only a
// human can judge (design, research, writing quality), automated
// "verification" is theater. This pack does the two things that are NOT
// subjective: (1) the claimed artifact resolves / a content hash lands on
// record so the payer reviews what was actually submitted, (2) the actor
// claim is recorded. The verdict belongs to the payer — declared loudly
// via determinism:subjective rather than faked by a model.

import type { DomainCtx, ValidateInput, ValidateResult } from "@widespread/protocol-sdk";
import { sha256Hex } from "@widespread/protocol-sdk";

export async function validate(input: ValidateInput, ctx: DomainCtx): Promise<ValidateResult> {
  const failures: string[] = [];
  const evidence: Record<string, unknown> = { ...(input.claim.evidence ?? {}) };

  const ref = input.claim.ref?.trim() ?? "";
  if (!ref) return { failures: ["claim.ref required"], evidence };

  // resolve — URL refs are fetched and content-hashed at claim time so the
  // payer reviews the artifact as-claimed, not a later edit. Non-URL refs
  // (inline content, precomputed hashes) are recorded verbatim.
  if (/^https?:\/\//i.test(ref)) {
    try {
      const res = await ctx.fetch(ref, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        failures.push(`artifact not resolvable: http ${res.status} for ${ref}`);
      } else {
        const body = await res.text();
        evidence["content_sha256"] = `sha256:${await sha256Hex(body)}`;
        evidence["fetched_at"] = new Date().toISOString();
      }
    } catch (e) {
      failures.push(`artifact not resolvable: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    // Inline deliverable or caller-supplied hash — hash the ref itself.
    evidence["content_sha256"] = `sha256:${await sha256Hex(ref)}`;
  }
  evidence["url"] = ref;
  evidence["verdict_authority"] = "payer"; // the whole point of this class

  // actor — recorded, not verified (subjective class has no platform truth)
  if (!input.claim.actor) failures.push("claim.actor required — who did the work?");
  else evidence["actor"] = input.claim.actor;

  // spec binding is the payer's job for this class — carry params through
  // to the verdict record rather than judging them.
  if (input.market.verification?.params) {
    evidence["acceptance_params"] = input.market.verification.params;
  }

  return { failures, evidence };
}
