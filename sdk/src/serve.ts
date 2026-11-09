// serve.ts — wrap a pack's validate() in the spec's HTTP contract:
//   POST /validate  → 200 ValidateResult
//   GET  /health    → 200 {ok, domain}
// Works anywhere a fetch handler works (Workers, Deno.serve, node:http via
// adapter). Domain packs in TS can also just be imported in-process — this
// wrapper is for the service-shaped deployment option.

import type { DomainCtx, ValidateFn, ValidateInput } from "./types.ts";

export function serve(validate: ValidateFn, opts: { domain: string; env?: Record<string, string | undefined> }): (req: Request) => Promise<Response> {
  const env = opts.env ?? (Object.fromEntries(Object.entries(process.env)) as Record<string, string | undefined>);
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, domain: opts.domain });
    }
    if (req.method === "POST" && url.pathname === "/validate") {
      let input: ValidateInput;
      try {
        input = (await req.json()) as ValidateInput;
      } catch {
        return Response.json({ failures: ["json body required"], evidence: {} }, { status: 400 });
      }
      if (!input?.market?.id || !input?.claim?.ref) {
        return Response.json({ failures: ["market.id and claim.ref required"], evidence: {} }, { status: 400 });
      }
      const ctx: DomainCtx = { env, fetch: globalThis.fetch.bind(globalThis) };
      try {
        return Response.json(await validate(input, ctx));
      } catch (e) {
        // A pack should never throw for a checkable condition; if it did,
        // fail closed — a claim that can't be validated is not validated.
        return Response.json(
          { failures: [`validator threw: ${e instanceof Error ? e.message : String(e)}`], evidence: {} },
          { status: 200 },
        );
      }
    }
    return Response.json({ error: "not found" }, { status: 404 });
  };
}
