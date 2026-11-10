# ACP evaluator — domain packs inside Virtuals ACP

Virtuals ACP's evaluator role is a market for verification agents. Any
domain pack (deployed via `serve()` or the bridge) can fill it:

```ts
import { ACPEvaluator } from "@widespread/acp-evaluator";
const evaluator = new ACPEvaluator({ packUrl: "https://pack.example.workers.dev" });

// inside your ACP evaluator-handler:
const { verdict, reasons, evidence } = await evaluator.evaluate({
  jobId: job.id,
  deliverable: { ref: "https://github.com/o/r/pull/12", actor: "github:88124" },
  acceptance: { class: "forge-artifact", params: { spec_hash: "sha256:…" } },
});
// verdict "approve"|"reject", reasons verbatim from the pack's failures[]
```

`evaluateLocal(validate, job)` runs a pack's validate() directly — zero
infra, good for demos/tests. Evidence maps land verbatim on the ACP
audit trail.
