// acp-evaluator — expose a widespread-protocol domain pack as a Virtuals
// ACP "Evaluator" service. ACP's model: request → negotiation → transaction
// → evaluation; evaluator agents are a market role. This wrapper makes any
// deployed pack endpoint callable from ACP job evaluations.
//
// Usage (standalone): ACPEvaluator({ packUrl, marketId }).evaluate(job)
// where job is the ACP evaluation payload {jobId, deliverable, acceptance}.
//
// The mapping is explicit: ACP job.deliverable → claim.ref (+ evidence),
// job.acceptance → market.verification.params. The pack's failures[] map
// to the ACP approve/reject decision with reasons verbatim.
//
// Optionally wire @virtuals-protocol/acp-node (ISC): this file stays
// dependency-free — a one-method callable you can mount in their handler.

import { serve } from "../../sdk/src/serve.js";
import type { ValidateInput, ValidateResult, DomainCtx } from "../../sdk/src/types.js";

export interface AcpJob {
  jobId: string;
  /** the submitted deliverable — URL, inline:content, or platform ref */
  deliverable: { ref: string; actor?: string; evidence?: Record<string, unknown> };
  /** the agreed acceptance spec — maps to market.verification.params */
  acceptance: { class: string; params?: Record<string, unknown>; spec?: string; specHash?: string };
}

export interface AcpEvalResult {
  jobId: string;
  verdict: "approve" | "reject";
  reasons: string[];
  /** the pack's evidence map — preserved for the ACP audit trail */
  evidence: Record<string, unknown>;
  pack: { url: string; duration_ms: number };
}

export class ACPEvaluator {
  constructor(private cfg: { packUrl: string; marketId?: string; ctx?: DomainCtx }) {}

  /** POSTs a ValidateInput to the pack's /validate endpoint. */
  async evaluate(job: AcpJob): Promise<AcpEvalResult> {
    const input: ValidateInput = {
      market: {
        id: this.cfg.marketId ?? `acp:${job.jobId}`,
        verification: { class: job.acceptance.class,
          ...(job.acceptance.params ? { params: job.acceptance.params } : {}) },
        ...(job.acceptance.spec ? { spec: job.acceptance.spec } : {}),
        ...(job.acceptance.specHash ? { spec_hash: job.acceptance.specHash } : {}),
      },
      claim: {
        ref: job.deliverable.ref,
        ...(job.deliverable.actor ? { actor: job.deliverable.actor } : {}),
        ...(job.deliverable.evidence ? { evidence: job.deliverable.evidence } : {}),
      },
    };
    const t0 = Date.now();
    const res = await fetch(`${this.cfg.packUrl.replace(/\/$/, "")}/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`pack ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const out = (await res.json()) as ValidateResult;
    return {
      jobId: job.jobId,
      verdict: out.failures.length === 0 ? "approve" : "reject",
      reasons: out.failures,
      evidence: out.evidence,
      pack: { url: this.cfg.packUrl, duration_ms: Date.now() - t0 },
    };
  }
}

/** Convenience: spin up a pack locally via serve() and evaluate a job
 * against it — zero-infra demo of the ACP evaluator role. */
export async function evaluateLocal(
  validate: Parameters<typeof serve>[0],
  job: AcpJob,
): Promise<AcpEvalResult> {
  const ctx: DomainCtx = { env: {}, fetch };
  const input: ValidateInput = {
    market: { id: `acp:${job.jobId}`, verification: {
      class: job.acceptance.class,
      ...(job.acceptance.params ? { params: job.acceptance.params } : {}) },
      ...(job.acceptance.spec ? { spec: job.acceptance.spec } : {}),
      ...(job.acceptance.specHash ? { spec_hash: job.acceptance.specHash } : {}) },
    claim: { ref: job.deliverable.ref,
      ...(job.deliverable.actor ? { actor: job.deliverable.actor } : {}),
      ...(job.deliverable.evidence ? { evidence: job.deliverable.evidence } : {}) },
  };
  const t0 = Date.now();
  const out = await validate(input, ctx);
  return { jobId: job.jobId,
    verdict: out.failures.length === 0 ? "approve" : "reject",
    reasons: out.failures, evidence: out.evidence,
    pack: { url: "local", duration_ms: Date.now() - t0 } };
}
