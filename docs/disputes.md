# Disputes & escalation

Verification strength is declared, so disputes route by class:

## Deterministic classes — no dispute needed

Recompute the evidence: `patch_fingerprint`, `content_sha256`,
`signature_record`. If recomputation disagrees with the verdict, the
verdict was wrong and the evidence log shows which step.

## Oracle-read classes — challenge the read, not the judge

`oracle-metric` observations are hashed at claim time
(`raw_sha256`, `observed_at`). A dispute asserts a different number —
escalate to the optimistic oracle: bonded `assertTruth`, liveness
window, UMA/Kleros-style resolution. `POST /api/disputes` records +
posts when `DISPUTE_*` env is set.

## Subjective classes — payer-accept with adjudicator backup

`verdict_authority: payer` is literal: the pack never claimed to judge.
If payer and claimant disagree, the rubric adjudicator's per-criterion
reasons on the record are the audit trail — and `cannot_assess`
verdicts route to disputes rather than forced outcomes.

## Futarchy governance — challenge windows

Resolutions carry `challengeWindowNs`; a registered resolver may post a
different attestation inside the window (`challenge()`), and `redeem`
stays locked until it closes.
