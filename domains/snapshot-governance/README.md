# snapshot-governance — chain-state evidence class

Verifies governance work against Snapshot — the strongest non-code
verifier: the outcome lives on a public indexer, so validation is a
deterministic read (the merge=accept trick, with the ledger as the
acceptance attestation).

| claim field | meaning |
|---|---|
| `ref` | proposal URL (`snapshot.box/#/<space>/proposal/<id>`, `snapshot.org`) or bare proposal id |
| `actor` | proposal author's ETH address (authorship-shaped work) |

**verification.params**:

| param | check |
|---|---|
| `space` | proposal's space id must match |
| `state` | `active`, `closed`, … must match |
| `min_scores_total` | participation floor |
| `winning_choice` | argmax of scores must equal the named choice |

Two work shapes fit: **authorship** ("submit proposal X" — bind
`proposal.author` to `actor`) and **outcome** ("get X passed" — verify
state/quorum/winner). No env requirements — `hub.snapshot.org` is a public
endpoint.
