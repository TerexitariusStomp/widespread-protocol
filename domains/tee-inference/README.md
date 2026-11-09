# tee-inference — TEE-attested work receipts

Verifies a NEAR AI Cloud `provider_tee` signed completion: re-fetches
`/v1/signature/<id>`, binds the model + nonce/prompt hash the market
declared, records the receipt for offline verification.

**Honest limit** (declared on every record): attestation proves WHICH
model ran on WHICH bytes — never that the response was right.
`verdict_authority: adjudicator-or-payer`.

| param | meaning |
|---|---|
| `model` | required model pin; receipt model must match |
| `nonce_hash` | sha256 of the claim-bound prompt (replay defense) |

`claim.ref` = `<signature_id>` or `<signature_id>|<prompt_sha256>`.

Env: `NEAR_AI_BASE` (default `cloud-api.near.ai/v1`), `NEAR_AI_API_KEY`.
