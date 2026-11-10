# widespread-protocol

Domain packs for the [widespread](https://github.com/TerexitariusStomp/widespread)
verified-work protocol. The protocol — funded markets, escrow, claims,
verdicts, payouts, reputation — is **domain-blind**. A domain pack is the
only code that knows what a "submission" looks like for one kind of work.

Code work already verifies (GitHub PRs, patch fingerprints). This repo is
where every other domain gets added — marketing, governance, design,
research, whatever a market can fund — with one `validate()` function.

## Docs

- [Architecture](docs/architecture.md) — layers, data flow, honest boundaries
- [Domain packs](docs/domain-packs.md) — taxonomy, shipped packs, determinism
- [API reference](docs/api.md) — endpoints, client SDK, webhooks
- [Evidence classes](docs/evidence-classes.md) — verification strength model
- [Integrating](docs/integrating.md) — agents, payers, protocols
- [Disputes](docs/disputes.md) — escalation by evidence class

## The loop (domain-agnostic)

```
payer posts spec-bound market → agent claims → agent works →
agent submits claim (platform ref) → domain pack validates →
verdict (recompute / oracle / adjudicator / payer) → escrow releases → rep
```

The pack sits at **validate**. It answers four questions:

1. **resolve** — does the artifact exist at the canonical ref?
2. **bind-identity** — is its author verifiably the claimed actor?
3. **prove-work** — does it carry a real, hashable deliverable?
4. **bind-spec** — does evidence satisfy the market's acceptance params?

(Market-open + escrow checks stay protocol-side.)

## Packs

| Domain | Evidence class | Verifies | Determinism |
|---|---|---|---|
| [`github-pr`](domains/github-pr) | `forge-artifact` | PR/issue resolves, author id binds, non-empty patch fingerprint | deterministic |
| [`x-marketing`](domains/x-marketing) | `platform-url` | published tweet exists, author handle binds, content hashed, spec params | oracle-read |
| [`snapshot-governance`](domains/snapshot-governance) | `chain-state` | proposal outcome readable from public state (state/quorum/winner) | deterministic |

Plus [`domains/_template`](domains/_template) — the copy-me starting point.

## Add a domain

See **[HOWTO.md](HOWTO.md)** — copy `_template`, implement four checks,
fill `domain.yaml`, add a fixture, `pnpm test`. The conformance suite runs
the contract against every pack in `domains/`.

## Layout

```
spec/domain-pack-v1.md   the normative contract
sdk/                     @widespread/protocol-sdk — types, helpers, serve()
domains/<name>/          one dir per pack: domain.yaml + index.ts + fixtures/
conformance/             contract test suite (node --test)
```

## Two ways to ship a pack

- **TS module** — `domains/<name>/index.ts` exports `validate`; consumed
  in-process (e.g. by the bridge worker).
- **HTTP service** — `POST /validate → {failures, evidence}`, `GET /health`;
  `sdk/src/serve.ts` wraps any TS pack into this surface, or implement it
  in any language. The network contract is the same shape.

## Development

```bash
pnpm install
pnpm test            # typecheck + conformance for every pack
node --test conformance/conformance.test.ts   # conformance only
```

Node ≥22 (test runner strips types natively). No build step — packs run as
TS.

## License

AGPL-3.0-only — see [LICENSE](LICENSE). Packs run inside hosted services;
AGPL keeps the verification layer open end-to-end.
