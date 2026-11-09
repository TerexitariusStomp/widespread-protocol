# HOWTO — add a domain to widespread

Thirty minutes, one function. This guide walks a domain pack from zero to
merged: a verifier that lets widespread markets fund, validate, and pay for
work in your domain.

## 0. Pick your evidence class

Before writing code, decide *what proves the work*. That's the whole
design.

| Ask | → class | Trust anchor |
|---|---|---|
| The deliverable is a forge artifact (PR, MR, issue, commit) | `forge-artifact` | forge API + diff hash |
| The deliverable is published content at a URL (tweet, video, post) | `platform-url` | platform API + claim-time content hash |
| The outcome is readable from a public ledger/indexer (vote, proposal, transfer) | `chain-state` | deterministic public-state read |
| The acceptance is a metric at a window ("≥10k impressions in 7d") | `oracle-metric` | metric API read at declared source |
| Only a human can judge it (design, research, writing quality) | `payer-accept` | payer verdict — keep evidence minimal |

Rule of thumb: **prefer the strongest class that honestly applies.** A
`chain-state` read beats an `oracle-read` beats an adjudicator score.
`payer-accept` is honest, not a failure — subjective work exists — but it
means the pack's job is identity + artifact hashing, and the verdict moves
to the payer.

## 1. Scaffold

```bash
cp -r domains/_template domains/my-domain
```

Fill `domain.yaml` — the manifest declares your trust model to the
protocol:

```yaml
name: my-domain                # must equal the directory name
evidence_class: platform-url
determinism: oracle-read       # deterministic | oracle-read | adjudicator | subjective
ref_format: "platform.com/item/<id>"
actor_binding: "numeric platform user id — compared to artifact author"
env_optional: [PLATFORM_TOKEN] # declare every secret you read from ctx.env
entry: index.ts
```

## 2. Implement `validate()`

`domains/my-domain/index.ts` exports one function:

```ts
export async function validate(input: ValidateInput, ctx: DomainCtx):
  Promise<ValidateResult>
```

Work the four checks **in order** — `_template/index.ts` is annotated:

```ts
const failures: string[] = [];
const evidence: Record<string, unknown> = { ...(input.claim.evidence ?? {}) };

// 1. resolve — fetch the artifact at claim.ref via ctx.fetch
//    → failure: "artifact not resolvable: http 404 for …"

// 2. bind-identity — artifact's author vs claim.actor
//    → failure: "actor mismatch: author is X, claimed Y"
//    → evidence: author_id, author_handle, actor_binding

// 3. prove-work — hash the deliverable NOW
//    → evidence: content_sha256 / patch_fingerprint — the verdict
//      recomputes this later; post-claim edits change the hash.

// 4. bind-spec — enforce market.verification.params (read via param<T>())
//    → failures: one per violated param, human-readable
```

### Rules that get packs merged

- **Failures, not throws.** Anything a payer could disagree with is a
  failure string. Throwing means "validator bug" — `serve()` still fails
  closed, but your pack should never rely on it.
- **`ctx.fetch` and `ctx.env` only.** No global fetch, no `process.env` —
  the pack runs inside callers that supply both (Workers, tests, other
  hosts). Declare every env key in `domain.yaml`.
- **Evidence = identifiers + hashes, never secrets.** It lands on the
  claim record verbatim and may be exported in attestations.
- **Fail closed on missing env.** A required token absent → the check that
  needed it fails with a string saying so (see `x-marketing`'s
  `created_after` handling — honest degrade, not a silent skip).
- **Timestamp checks when available.** If the platform gives you
  `created_at`, and the market carries `created_at` or params carry
  `created_after`, reject work that predates the market — that check alone
  kills most replay fraud.

## 3. Bind the actor

Every domain needs an answer to "who did this work" that isn't
self-reported. Strongest to weakest:

1. **Platform-verified id** — numeric GitHub id, ETH address, handle from
   the API response itself (never trust a caller-supplied author field).
2. **Nonce binding** — the market issues a nonce the deliverable must
   carry (`x-marketing`'s `nonce` param): the work self-proves it's *for
   this market* with no separate round-trip.
3. **Address/account signature** — for chain domains, a signature over the
   market id from the claimed address.

`claim.actor` is a claim, not a fact — your pack verifies it against the
platform's own record of authorship.

## 4. Declare acceptance params

`market.verification.params` is the payer's acceptance criteria, checked
in step 4. Naming convention — reuse these where they fit:

| param | meaning |
|---|---|
| `min_length` / `min_size` | deliverable size floor |
| `required_terms` | strings that must appear |
| `nonce` | market-binding token the deliverable must carry |
| `created_after` | artifact must postdate timestamp |
| `state` | expected lifecycle state (`closed`, `merged`, …) |
| `min_scores_total` / `min_quorum` | participation floors |
| `winning_choice` | expected outcome |
| `space` / `org` / `repo` | scope pinning |

Document the params you honor in your pack's README — they're the contract
payers write against.

## 5. Add fixtures

`domains/my-domain/fixtures/*.json` — each is a case the conformance suite
runs hermetically:

```json
{
  "desc": "happy path — artifact resolves, actor binds, params hold",
  "input": {
    "market": { "id": "m-1", "verification": { "class": "platform-url",
        "params": { "min_length": 5 } } },
    "claim": { "ref": "platform.com/item/42", "actor": "12345" }
  },
  "mocks": {
    "api.example.com/items/42": { "json": { "author_id": "12345", "size": 10 } }
  },
  "expect": { "failures": "none" },
  "evidence_keys": ["author_id", "content_sha256"]
}
```

- `mocks` maps **url substrings** → recorded responses. Record real API
  shapes; don't invent fields the platform doesn't return.
- `expect.failures`: `"none"` (happy path — required at least once),
  `"some"`, or a substring a failure must contain.
- Cover: valid, actor-mismatch, bad-ref, and at least one spec-param
  violation.

## 6. Test

```bash
pnpm install
pnpm test        # typecheck + conformance — your pack runs against the suite
node --test conformance/conformance.test.ts   # conformance only
```

The suite checks the manifest, loads `entry`, replays every fixture, and
requires a happy path. Green = contract-conformant.

## 7. PR checklist

- [ ] `domain.yaml` complete and honest about `determinism`/`env_*`
- [ ] four checks implemented; failures are strings, no throws
- [ ] evidence contains ids + hashes only — no secrets
- [ ] fixtures cover happy path + each failure mode you claim
- [ ] pack README documents `claim.ref`, `claim.actor`, params, env
- [ ] `pnpm test` green; CI re-runs it on the PR

## After merge: consuming the pack

- **In-process (TS)**: the caller imports your `validate` and dispatches on
  `market.verification.class`/domain — how `widespread-bridge` consumes
  packs.
- **As a service**: `serve()` from `@widespread/protocol-sdk` wraps your
  pack into the `POST /validate` + `GET /health` contract — deployable
  anywhere a fetch handler runs, or implement the same surface in another
  language.

The pack spec is `spec/domain-pack-v1.md` — when in doubt, it's normative.
