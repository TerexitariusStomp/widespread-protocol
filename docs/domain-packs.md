# Domain packs

Every market declares a `verification.class`; the pack implementing that
class answers four checks:

1. **resolve** — does the external artifact exist?
2. **bind-identity** — is it bound to the claimed identity?
3. **prove-work** — does real work/state exist?
4. **bind-spec** — is the evidence bound to this market's spec?

Packs ship as importable libraries (`validate()`), HTTP services
(`serve()` → `POST /validate`), or ACP evaluators. See `HOWTO.md` for the
30-minute authoring path and `spec/domain-pack-v1.md` for the contract.

## Shipped packs

| pack | class | determinism | checks |
|---|---|---|---|
| `github-pr` | forge-artifact | deterministic | PR resolves, author = claimed id, patch fingerprint, spec hash |
| `x-marketing` | platform-url | oracle-read | tweet resolves, author handle, content hash, spec params |
| `snapshot-governance` | chain-state | deterministic | proposal state/quorum/choice via public GraphQL |
| `oracle-metric` | oracle-metric | oracle-read | declared metric endpoint + threshold + observation window |
| `payer-accept` | payer-accept | subjective | artifact resolves + hashed; verdict_authority: payer |
| `research-reports` | payer-accept | subjective | structure checks (words/sections/citations); payer judges |
| `tee-inference` | forge-artifact | deterministic | NEAR AI Cloud signature record, model+nonce binding |
| `zktls-verify` | platform-url | deterministic | TLSNotary presentation: host, freshness, transcript, crypto |
| `c2pa-verify` | platform-url | deterministic | C2PA manifest: issuer, actions, signature |

## Determinism labels are the honest surface

`deterministic` = recomputable · `oracle-read` = trusted source, hashed at
claim time · `subjective` = a human verdict, declared. Settlement never
changes — the trust label on the evidence does.

## Crypto verifiers

`zktls-verify` and `c2pa-verify` are fail-closed by default
(`require_crypto`): without the optional verifier (`tlsn-js`,
`@contentauth/c2pa-web`) claims fail unless the market explicitly accepts
`verification_level: structural`.
