# Domain Pack Spec — v1

A **domain pack** teaches the widespread protocol how to verify one kind of
work. The protocol (markets, escrow, claims, payouts, reputation) is
domain-blind; the pack is the only code that knows what a "submission" looks
like for its domain.

## The contract

Every domain validator answers the same four questions, in order. A fifth —
"is the market open and is escrow locked?" — is the protocol's job, not the
pack's.

| # | Check | Question |
|---|---|---|
| 1 | **resolve** | Does the claimed artifact exist at the canonical platform ref? |
| 2 | **bind-identity** | Is the artifact's author verifiably the claimed `actor`? |
| 3 | **prove-work** | Does the artifact carry a real, hashable deliverable? |
| 4 | **bind-spec** | Does the evidence satisfy the market's `verification.params`? |

Return **failures** (strings, human-readable, one per failed check) and
**evidence** (a JSON object the verdict/attestation layer stores verbatim —
identifiers, hashes, platform ids; never secrets, never bearer tokens).

```ts
export type ValidateFn = (
  input: ValidateInput,
  ctx: DomainCtx,
) => Promise<ValidateResult>;

export interface ValidateInput {
  market: MarketRef;
  claim: ClaimRef;
}

export interface MarketRef {
  id: string;                          // market/mirror id
  spec?: string;                       // human-readable work spec
  specHash?: string;                   // "sha256:<hex>" when bound
  domain?: string;                     // domain name that routed here
  verification?: {
    class: EvidenceClass | string;     // see taxonomy below
    params?: Record<string, unknown>;  // domain-declared acceptance params
  };
  amount?: string;
  currency?: string;
  created_at?: number;                 // ms epoch — "work after market" check
}

export interface ClaimRef {
  ref: string;                         // canonical artifact locator (domain-defined)
  actor?: string;                      // claimed platform identity
  evidence?: Record<string, unknown>;  // caller-supplied, merged into result
  commits?: string[];                  // forge-artifact convenience
  [k: string]: unknown;                // packs may read extra claim fields
}

export interface DomainCtx {
  env: Record<string, string | undefined>;  // secrets/config — document needs in domain.yaml
  fetch: typeof fetch;                       // caller-supplied (Workers-compatible)
}

export interface ValidateResult {
  failures: string[];
  evidence: Record<string, unknown>;
}
```

### Rules

- **Never throw for a checkable condition.** A missing artifact, a wrong
  author, a mismatched spec — all are `failures`, not exceptions. Throw only
  for FUBAR (malformed input the caller should have rejected).
- **Platform errors are failures too**, but word them as such:
  `"github 404 for owner/repo/pull/12"`, not `"artifact not found"`. A
  transient error (rate limit, 5xx) is a failure that may succeed on retry —
  say so in the string when known.
- **Evidence is an assertion, not proof.** Whatever the pack fetches and
  hashes becomes part of the claim record. Hash what you can
  (`content_sha256`, `patch_fingerprint`) so later verdicts recompute rather
  than re-trust.
- **No ambient authority.** Everything the pack needs arrives via `ctx.env`
  or `input`. No reading `process.env` directly, no global fetch — use
  `ctx.fetch`.
- **Determinism is declared, not assumed.** `domain.yaml`'s `determinism`
  field tells the protocol how much to trust a passing validation.

## Evidence classes

| Class | Trust anchor | Examples |
|---|---|---|
| `forge-artifact` | forge API + patch/diff hash | GitHub PR, GitLab MR, issue |
| `platform-url` | platform API + content hash at claim time | tweet, video, blog post |
| `chain-state` | deterministic read of public ledger/indexer | Snapshot outcome, on-chain vote |
| `oracle-metric` | metric read at a declared window/source | impressions ≥ N via platform API |
| `payer-accept` | human verdict — no automated evidence | design, writing, research |

`determinism` values: `deterministic` (recompute-equivalent),
`oracle-read` (trusted API read), `adjudicator` (needs model/human verdict),
`subjective` (payer-accept only).

## domain.yaml manifest

```yaml
name: my-domain              # unique, kebab-case, dir name
version: 0.1.0
evidence_class: platform-url # from taxonomy
display: "Human name"
description: "One line — what this pack verifies."
ref_format: "what claim.ref looks like"
actor_binding: "what claim.actor means + how it's verified"
env_required: []             # hard requirements — pack fails closed without
env_optional: [X_TOKEN]      # degrade gracefully if absent
determinism: oracle-read
entry: index.ts              # file exporting `validate`
author: your-handle
```

## Two ways to ship a pack

**1. TypeScript module** (primary): `domains/<name>/index.ts` exports
`validate: ValidateFn`. Consumed by the bridge as a workspace import —
same runtime, zero network hop.

**2. HTTP service** (any language): expose

```
POST /validate   body: ValidateInput JSON   → 200 ValidateResult JSON
GET  /health                              → 200 {"ok":true,"domain":"<name>"}
```

`@widespread/protocol-sdk`'s `serve()` wraps a TS pack into exactly this
surface for Workers/Deno/Node — or implement it yourself in any stack.
