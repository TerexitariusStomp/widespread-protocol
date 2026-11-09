# research-reports — structural checks on written deliverables

Reports, analyses, documents: quality stays the payer's verdict
(`determinism: subjective`), but structure is honestly checkable —
artifact resolves, `content_sha256` at claim time, plus params:

| param | check |
|---|---|
| `min_words` | word count floor |
| `required_sections` | headings/strings that must appear |
| `min_citations` | URL or `[n]` reference count floor |

`claim.ref` = document URL, or `inline:<content>` for direct delivery.
`claim.actor` recorded, not verified.
