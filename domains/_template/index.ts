// my-domain — a widespread domain pack.
//
// Implement the four checks from spec/domain-pack-v1.md. Return failures as
// human-readable strings (never throw for a checkable condition) and put
// identifiers + hashes in evidence — the verdict layer stores it verbatim.

import type { DomainCtx, ValidateInput, ValidateResult } from "@widespread/protocol-sdk";
import { fetchJson, sha256Hex, param } from "@widespread/protocol-sdk";

export async function validate(input: ValidateInput, ctx: DomainCtx): Promise<ValidateResult> {
  const failures: string[] = [];
  const evidence: Record<string, unknown> = { ...(input.claim.evidence ?? {}) };

  // 1. resolve — does the artifact exist at the canonical ref?
  const { data, error } = await fetchJson<Record<string, unknown>>(ctx, `https://api.example.com/items/${input.claim.ref}`);
  if (error) {
    failures.push(`artifact not resolvable: ${error}`);
    return { failures, evidence };
  }

  // 2. bind-identity — is the artifact's author the claimed actor?
  const authorId = String(data?.["author_id"] ?? "");
  if (input.claim.actor && input.claim.actor !== authorId) {
    failures.push(`actor mismatch: artifact author is ${authorId}, claimed ${input.claim.actor}`);
  }
  evidence["author_id"] = authorId;

  // 3. prove-work — hash the deliverable so verdicts recompute, not re-trust.
  evidence["content_sha256"] = `sha256:${await sha256Hex(JSON.stringify(data))}`;

  // 4. bind-spec — check the market's verification.params.
  const minSize = param<number>(input, "min_size");
  if (minSize !== undefined && Number(data?.["size"] ?? 0) < minSize) {
    failures.push(`deliverable below min_size ${minSize}`);
  }

  return { failures, evidence };
}
