# oracle-metric — outcome-verified work

"Did it work?" not "was it shipped?" — the class advertisers actually buy.

| claim field | meaning |
|---|---|
| `ref` | the metric endpoint URL reporting the outcome (JSON API) |
| `actor` | recorded, not verified |

**verification.params** (market-declared — payer picks the oracle):

| param | check |
|---|---|
| `field` | dotted path to the numeric metric (`data.impressions`) — required |
| `min` / `max` | threshold bounds — at least one required |
| `observed_field` | dotted path to a timestamp; with `window_start`/`market.created_at` rejects predated observations |
| `window_start` | ms epoch floor for `observed_field` |

**Env**: `METRIC_BEARER_TOKEN` optional — forwarded as `Authorization`.
`oracle-read` determinism: the market binds WHICH endpoint is the oracle;
the pack reads it and hashes the raw payload for re-verification.
