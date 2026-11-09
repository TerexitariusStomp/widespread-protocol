# @widespread/bridge-client

Thin typed client for the Widespread bridge API. Zero runtime deps.

```ts
import { client } from "@widespread/bridge-client";
const wide = client(); // or client({ base, fetch })

const feed = await wide.feed({ min_usd: 50, sort: "trust" });
const page = await wide.mirrors();
await wide.claim("mirror:github-thirdparty:owner/repo#123", "https://github.com/o/r/pull/45");
await wide.payout("mirror:…");
const rep = await wide.repExport("12345678"); // signed RepEvent[]
const health = await wide.treasury();         // settle_rate & totals
```

Spec: `GET /api/openapi.json` on any bridge deployment.
