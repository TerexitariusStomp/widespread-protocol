// types.ts — the domain-pack contract (spec/domain-pack-v1.md).
// The protocol is domain-blind; a pack is the only code that knows what a
// "submission" looks like for its domain.

export type EvidenceClass =
  | "forge-artifact"
  | "platform-url"
  | "chain-state"
  | "oracle-metric"
  | "payer-accept";

export interface MarketRef {
  /** market/mirror id */
  id: string;
  /** human-readable work spec */
  spec?: string;
  /** "sha256:<hex>" when bound */
  specHash?: string;
  /** domain name that routed to this pack */
  domain?: string;
  verification?: {
    class: EvidenceClass | string;
    /** domain-declared acceptance params (e.g. min_quorum, required_terms) */
    params?: Record<string, unknown>;
  };
  amount?: string;
  currency?: string;
  /** ms epoch — packs use this for "work happened after market creation" */
  created_at?: number;
}

export interface ClaimRef {
  /** canonical artifact locator — domain-defined (forge ref, tweet URL, …) */
  ref: string;
  /** claimed platform identity — meaning is domain-defined (numeric forge
   * id, handle, address). Document it in domain.yaml's actor_binding. */
  actor?: string;
  /** caller-supplied evidence, merged into the result verbatim */
  evidence?: Record<string, unknown>;
  /** forge-artifact convenience: commit shas the claim asserts */
  commits?: string[];
  [k: string]: unknown;
}

export interface DomainCtx {
  /** secrets/config — declare needs in domain.yaml (env_required/env_optional) */
  env: Record<string, string | undefined>;
  /** caller-supplied fetch — Workers-compatible; never use a global */
  fetch: typeof fetch;
}

export interface ValidateResult {
  /** one human-readable string per failed check — empty means validated */
  failures: string[];
  /** JSON object stored on the claim record — identifiers and hashes, never
   * secrets or bearer tokens */
  evidence: Record<string, unknown>;
}

export interface ValidateInput {
  market: MarketRef;
  claim: ClaimRef;
}

export type ValidateFn = (
  input: ValidateInput,
  ctx: DomainCtx,
) => Promise<ValidateResult>;

/** Parsed domain.yaml manifest — validated by the conformance suite. */
export interface DomainManifest {
  name: string;
  version: string;
  evidence_class: EvidenceClass;
  display: string;
  description?: string;
  ref_format: string;
  actor_binding: string;
  env_required?: string[];
  env_optional?: string[];
  determinism: "deterministic" | "oracle-read" | "adjudicator" | "subjective";
  entry: string;
  author?: string;
}
