# c2pa-verify — C2PA content-provenance evidence

Signed Content Credentials on media/design deliverables: manifest
resolves (inline or `<asset>.c2pa` sidecar), issuer bound to market
params, required actions checked, manifest hashed.

**Fail-closed default**: `require_crypto` (default true) demands the
`@contentauth/c2pa-web` verifier (optional peer dep, MIT); the market
may opt into `verification_level: structural` explicitly — the evidence
says which.

| param | meaning |
|---|---|
| `issuer` | required signer identity |
| `required_actions` | assertion strings that must appear |
| `require_crypto` | default true |
| `sidecar` | default true — try `<ref>.c2pa` before ref itself |
