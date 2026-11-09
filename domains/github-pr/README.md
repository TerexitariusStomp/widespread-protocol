# github-pr — reference domain pack

Verifies GitHub PR/issue submissions: artifact resolves, author identity
binds (`claim.actor` = numeric GitHub id, or `@login` as weak form), PRs
carry a non-empty `patch_fingerprint`, spec binding when both sides provide
a specHash.

- **evidence_class**: `forge-artifact` · **determinism**: `deterministic`
- Ported from `widespread-bridge`'s `validateForgeSubmission` — the contract
  every other pack implements.

| claim field | meaning |
|---|---|
| `ref` | `github.com/owner/repo/(issues\|pull)/N` or `owner/repo#N` |
| `actor` | numeric GitHub user id (strong) or `@login` (weak) |

Optional env: `GITHUB_TOKEN` (rate limits).
