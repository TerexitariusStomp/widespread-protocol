# zktls-verify — proof-carrying web evidence

Upgrades `platform-url` from "we fetched it" to "cryptographically proven
to come from the host": the claim carries a TLSNotary presentation.

**Fail-closed**: if the `tlsn-js` verifier isn't installed (optional peer
dep), structural checks still run but the claim FAILS — an unverifiable
proof isn't evidence.

| param | meaning |
|---|---|
| `host` | required — `session.server_name` must match |
| `max_age_ms` | proof freshness bound (default 7d) |
| `transcript_contains` | strings the revealed transcript must contain |

`claim.ref` = `inline:<json|base64>` presentation payload.
