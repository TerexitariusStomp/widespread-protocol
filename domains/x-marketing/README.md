# x-marketing — platform-url evidence class

Verifies a published tweet as a work deliverable.

| claim field | meaning |
|---|---|
| `ref` | `x.com/<handle>/status/<id>`, twitter.com URL, or bare status id |
| `actor` | the `@handle` the deliverable must be posted from |

**verification.params** (market-declared):

| param | check |
|---|---|
| `min_length` | tweet text ≥ N chars |
| `required_terms` | every listed term present (case-insensitive) |
| `nonce` | text must carry the market nonce — binds work to this market |
| `created_after` | tweet newer than timestamp (needs `X_BEARER_TOKEN`; defaults to `market.created_at`) |

**Env**: `X_BEARER_TOKEN` optional — api.x.com v2 path (real `created_at`,
exact handle). Without it the pack falls back to keyless oembed and
timestamp checks report honestly rather than guessing.

**Trust model**: `oracle-read`. The claim-time `content_sha256` is the
anti-bait-and-switch — a verdict recomputes the same URL; edits change the
hash.
