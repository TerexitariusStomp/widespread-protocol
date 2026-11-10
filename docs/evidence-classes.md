# Evidence classes

The market's `verification.class` declares HOW strongly a claim can be
checked — and the label travels with the evidence so payers know what
they're buying.

| class | what it proves | packs | determinism |
|---|---|---|---|
| `forge-artifact` | signed forge evidence: actor bound, work fingerprinted | github-pr, tee-inference | deterministic |
| `platform-url` | published content on a platform | x-marketing, zktls-verify, c2pa-verify | oracle-read → deterministic (zkTLS/C2PA) |
| `chain-state` | public on-chain/graph state | snapshot-governance | deterministic |
| `oracle-metric` | a number crossed a threshold | oracle-metric | oracle-read |
| `payer-accept` | artifact exists + hashed; payer judges | payer-accept, research-reports | subjective |

## Strength upgrade paths

- `platform-url` → **zkTLS**: swap "bridge fetched it" for a TLSNotary
  presentation proving the bytes came from the host.
- `oracle-metric` → **optimistic oracle**: post the metric as a UMA
  assertion — bonded, challengeable, jury-resolved.
- `payer-accept` → **attested adjudication**: rubric criteria run in a
  TEE (NEAR AI Cloud provider_tee receipts — `tee-inference` verifies).
- anything → **C2PA**: signed provenance on the deliverable itself.
