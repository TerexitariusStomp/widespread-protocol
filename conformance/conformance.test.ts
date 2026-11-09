// conformance.test.ts — the contract suite every domain pack must pass.
// Discovers domains/*/ (skipping _template), validates each domain.yaml
// manifest against spec/domain-pack-v1.md, loads the pack's validate(),
// and replays fixture cases from domains/<name>/fixtures/*.json.
//
// Fixtures carry recorded platform responses ("mocks" maps url-substring →
// response) — hermetic by default, consistent with the ecosystem's
// recorded-fixture style. Run: node --test conformance/conformance.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import type { DomainCtx, DomainManifest, ValidateFn, ValidateResult } from "../sdk/src/index.ts";
import { serve } from "../sdk/src/serve.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOMAINS = join(ROOT, "domains");
const EVIDENCE_CLASSES = new Set([
  "forge-artifact", "platform-url", "chain-state", "oracle-metric", "payer-accept",
]);
const DETERMINISMS = new Set(["deterministic", "oracle-read", "adjudicator", "subjective"]);

interface Fixture {
  desc?: string;
  env?: Record<string, string>;
  input: { market: Record<string, unknown>; claim: Record<string, unknown> };
  expect: { failures: "none" | "some" | string };
  evidence_keys?: string[];
  mocks?: Record<string, { status?: number; json?: unknown; text?: string }>;
}

function replayFetch(mocks: Fixture["mocks"]): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    for (const [key, mock] of Object.entries(mocks ?? {})) {
      if (u.includes(key)) {
        if (mock.text !== undefined) {
          return new Response(mock.text, { status: mock.status ?? 200 });
        }
        return Response.json(mock.json ?? {}, { status: mock.status ?? 200 });
      }
    }
    return Response.json({ error: `unmocked url: ${u}` }, { status: 599 });
  }) as typeof fetch;
}

const dirs = readdirSync(DOMAINS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "_template")
  .map((d) => d.name);

for (const name of dirs) {
  test(`manifest: ${name}`, async (t) => {
    const dir = join(DOMAINS, name);
    const yamlPath = join(dir, "domain.yaml");
    assert.ok(existsSync(yamlPath), `${name}/domain.yaml missing`);
    const m = parseYaml(readFileSync(yamlPath, "utf8")) as DomainManifest;
    for (const k of ["name", "version", "evidence_class", "display", "ref_format", "actor_binding", "determinism", "entry"] as const) {
      assert.ok(m[k] !== undefined && m[k] !== null, `manifest.${k} required`);
    }
    assert.equal(m.name, name, "manifest.name must equal directory name");
    assert.ok(EVIDENCE_CLASSES.has(m.evidence_class), `evidence_class "${m.evidence_class}" not in taxonomy`);
    assert.ok(DETERMINISMS.has(m.determinism), `determinism "${m.determinism}" invalid`);
    assert.ok(existsSync(join(dir, m.entry)), `entry file ${m.entry} missing`);
  });

  test(`pack: ${name} — fixtures`, async (t) => {
    const dir = join(DOMAINS, name);
    const manifest = parseYaml(readFileSync(join(dir, "domain.yaml"), "utf8")) as DomainManifest;
    const mod = (await import(pathToFileURL(join(dir, manifest.entry)).href)) as { validate: ValidateFn };
    assert.equal(typeof mod.validate, "function", `${name} must export validate()`);

    const fixDir = join(dir, "fixtures");
    const files = existsSync(fixDir)
      ? readdirSync(fixDir).filter((f) => f.endsWith(".json"))
      : [];
    assert.ok(files.length > 0, `${name}: add at least one fixture under fixtures/`);

    let sawHappy = false;
    for (const f of files) {
      const fx = JSON.parse(readFileSync(join(fixDir, f), "utf8")) as Fixture;
      const ctx: DomainCtx = {
        env: { ...fx.env, ...(fx.env?.X_BEARER_TOKEN === undefined ? { X_BEARER_TOKEN: undefined } : {}) },
        fetch: replayFetch(fx.mocks),
      };
      const res: ValidateResult = await mod.validate(
        fx.input as Parameters<ValidateFn>[0], ctx);
      const tag = `${name}/${f}${fx.desc ? ` (${fx.desc})` : ""}`;

      assert.ok(Array.isArray(res.failures), `${tag}: failures must be an array`);
      assert.ok(res.evidence && typeof res.evidence === "object", `${tag}: evidence must be an object`);
      for (const s of res.failures) assert.equal(typeof s, "string", `${tag}: failure strings only`);

      const want = fx.expect.failures;
      if (want === "none") {
        assert.deepEqual(res.failures, [], `${tag}: expected no failures, got ${JSON.stringify(res.failures)}`);
        sawHappy = true;
      } else if (want === "some") {
        assert.ok(res.failures.length > 0, `${tag}: expected failures, got none`);
      } else {
        assert.ok(res.failures.some((x) => x.includes(want)),
          `${tag}: expected a failure containing ${JSON.stringify(want)}, got ${JSON.stringify(res.failures)}`);
      }
      for (const k of fx.evidence_keys ?? []) {
        assert.ok(k in res.evidence, `${tag}: evidence missing key "${k}"`);
      }
    }
    assert.ok(sawHappy, `${name}: no happy-path fixture (expect.failures: "none")`);
  });
}

// The HTTP wrapper is part of the contract too — exercised hermetically.
test("serve(): HTTP contract surface", async () => {
  const ok: ValidateFn = async () => ({ failures: [], evidence: { k: 1 } });
  const handler = serve(ok, { domain: "test-domain", env: {} });

  const health = await (await handler(new Request("http://x/health"))).json() as Record<string, unknown>;
  assert.equal(health["domain"], "test-domain");

  const bad = await handler(new Request("http://x/validate", { method: "POST", body: "{nope" }));
  assert.equal(bad.status, 400);

  const missing = await handler(new Request("http://x/validate", { method: "POST",
    body: JSON.stringify({ market: {}, claim: {} }) }));
  assert.equal(missing.status, 400);

  const good = await (await handler(new Request("http://x/validate", { method: "POST",
    body: JSON.stringify({ market: { id: "m1" }, claim: { ref: "r" } }) }))).json() as Record<string, unknown>;
  assert.deepEqual(good["failures"], []);
  assert.equal((good["evidence"] as Record<string, unknown>)["k"], 1);

  // a throwing pack still fails closed, not open
  const boom = serve(async () => { throw new Error("boom"); }, { domain: "t", env: {} });
  const res = await (await boom(new Request("http://x/validate", { method: "POST",
    body: JSON.stringify({ market: { id: "m" }, claim: { ref: "r" } }) }))).json() as Record<string, unknown>;
  assert.ok((res["failures"] as string[])[0]?.includes("boom"));
});
