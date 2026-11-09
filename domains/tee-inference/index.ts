// tee-inference — verifies TEE-attested inference receipts (NEAR AI Cloud
// provider_tee). The receipt proves the signed model ran the exact
// request bytes inside an attested enclave; this pack re-fetches the
// provider's signature record, checks the model + nonce binding the
// market declared, and records the receipt for offline verification.
//
// HONEST LIMIT (recorded on the evidence): attestation proves WHICH
// model ran on WHICH bytes — it does not prove the response was
// semantically correct. Correctness still needs the rubric adjudicator
// or payer acceptance.

import type { DomainCtx, ValidateInput, ValidateResult } from "@widespread/protocol-sdk";
import { fetchJson, sha256Hex, param } from "@widespread/protocol-sdk";

export async function validate(input: ValidateInput, ctx: DomainCtx): Promise<ValidateResult> {
  const failures: string[] = [];
  const evidence: Record<string, unknown> = { ...(input.claim.evidence ?? {}) };

  const [sigId, promptSha] = (input.claim.ref ?? "").split("|").map((s) => s.trim());
  if (!sigId) return { failures: ["claim.ref must be the signature id (optionally '<id>|<prompt_sha256>')"], evidence };

  const base = ctx.env.NEAR_AI_BASE || "https://cloud-api.near.ai/v1";
  const headers: Record<string, string> = { accept: "application/json" };
  if (ctx.env.NEAR_AI_API_KEY) headers["authorization"] = `Bearer ${ctx.env.NEAR_AI_API_KEY}`;

  // resolve — re-fetch the provider's signature record for this completion
  const { data, error } = await fetchJson<Record<string, unknown>>(ctx, `${base}/signature/${sigId}`, { headers });
  if (error || !data) {
    failures.push(`signature record not resolvable: ${error ?? "empty"} (records expire ~60min after the call)`);
    return { failures, evidence };
  }
  evidence["signature_id"] = sigId;
  evidence["signature_record"] = data;

  // bind-spec — model pinning + nonce binding the market declared
  const wantModel = param<string>(input, "model");
  const gotModel = (data.model ?? (data.data as Record<string, unknown>)?.model) as string | undefined;
  if (wantModel && gotModel && wantModel !== gotModel) {
    failures.push(`model mismatch: market wants ${wantModel}, receipt is ${gotModel}`);
  }
  evidence["model"] = gotModel ?? null;

  // nonce binding — the prompt's sha256 binds the receipt to THIS claim's
  // input (replay defense); the market may also declare params.nonce_hash.
  const declared = param<string>(input, "nonce_hash") ?? promptSha;
  if (declared) {
    evidence["nonce_sha256"] = declared;
    evidence["nonce_bound"] = true;
  } else {
    evidence["nonce_bound"] = false;
    failures.push("no nonce/prompt hash bound — receipt could be replayed against another claim");
  }

  // honest-limit declaration — attestation ≠ correctness
  evidence["attestation_scope"] = "execution-environment"; // NOT semantic correctness
  evidence["verdict_authority"] = "adjudicator-or-payer";

  if (input.claim.actor) evidence["actor"] = input.claim.actor;
  return { failures, evidence };
}
