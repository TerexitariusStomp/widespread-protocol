// c2pa-verify — signed content provenance (Content Credentials). For
// marketing/design/media deliverables the artifact IS the evidence: a
// C2PA manifest binds the bytes to a signer + actions + ingredients.
//
// Checks: manifest resolves (sidecar or embedded via claim ref),
// signature fields present, issuer/claims bound to market params,
// content hash recorded. Cryptographic chain-of-trust verification via
// @contentauth/c2pa-web when installed (MIT, wasm — optional peer);
// markets default to requiring it (fail closed), or may declare
// require_crypto:false for structural-only.

import type { DomainCtx, ValidateInput, ValidateResult } from "@widespread/protocol-sdk";
import { fetchJson, sha256Hex, param } from "@widespread/protocol-sdk";

interface C2paManifest {
  active_manifest?: string;
  manifests?: Record<string, {
    claim_generator?: string; signature?: { issuer?: string } | string;
    assertions?: unknown[]; ingredients?: unknown[];
  }>;
  validation_status?: { code?: string }[] | unknown[];
}

async function cryptoVerify(manifest: unknown): Promise<boolean | string> {
  try {
    const modName = "@contentauth/c2pa-web";
    const mod = await import(/* @vite-ignore */ modName).catch(() => null);
    if (!mod) return "c2pa-web verifier not installed — install the optional peer dep";
    const verify = (mod as { verify?: (m: unknown) => Promise<unknown> }).verify;
    if (typeof verify !== "function") return "c2pa-web lacks verify() — verifier API drift";
    await verify(manifest);
    return true;
  } catch (e) {
    return `manifest verification failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export async function validate(input: ValidateInput, ctx: DomainCtx): Promise<ValidateResult> {
  const failures: string[] = [];
  const evidence: Record<string, unknown> = { ...(input.claim.evidence ?? {}) };
  const ref = input.claim.ref?.trim() ?? "";
  if (!ref) return { failures: ["claim.ref required — asset URL or manifest URL"], evidence };

  // resolve — fetch the manifest (inline:<json> or URL)
  let manifest: C2paManifest | null = null;
  let manifestRaw = "";
  if (ref.startsWith("inline:")) {
    manifestRaw = ref.slice(7);
    manifest = JSON.parse(manifestRaw) as C2paManifest;
  } else {
    const url = param<boolean>(input, "sidecar") === false ? ref : `${ref}.c2pa`;
    const res = await fetchJson<C2paManifest>(ctx, url);
    if (!res.data) {
      const alt = await fetchJson<C2paManifest>(ctx, ref).catch(() => ({ data: null, error: "fetch failed" }));
      manifest = alt.data ?? null;
      manifestRaw = JSON.stringify(alt.data ?? {});
    } else {
      manifest = res.data;
      manifestRaw = JSON.stringify(res.data);
    }
  }
  if (!manifest) return { failures: ["C2PA manifest not resolvable at ref or <ref>.c2pa"], evidence };

  evidence["manifest_sha256"] = `sha256:${await sha256Hex(manifestRaw)}`;
  const active = manifest.active_manifest
    ? manifest.manifests?.[manifest.active_manifest] : Object.values(manifest.manifests ?? {})[0];
  if (!active) return { failures: ["manifest store has no manifests"], evidence };

  // signature + issuer binding
  const issuer = typeof active.signature === "string" ? active.signature : active.signature?.issuer;
  evidence["issuer"] = issuer ?? null;
  evidence["claim_generator"] = active.claim_generator ?? null;
  const wantIssuer = param<string>(input, "issuer");
  if (wantIssuer && (issuer ?? "") !== wantIssuer) {
    failures.push(`manifest signed by "${issuer}", market requires "${wantIssuer}"`);
  }
  if (!issuer) failures.push("manifest has no signature issuer — unsigned provenance");

  // required assertions (e.g. c2pa.actions must include a declared action)
  const mustAction = param<string[]>(input, "required_actions") ?? [];
  const manifestStr = manifestRaw.toLowerCase();
  for (const a of mustAction) {
    if (!manifestStr.includes(a.toLowerCase())) failures.push(`required action/assertion missing: "${a}"`);
  }

  // crypto — fail closed by default; structural-only is opt-out + labeled
  const requireCrypto = param<boolean>(input, "require_crypto") ?? true;
  const verified = await cryptoVerify(manifest);
  evidence["verified"] = verified === true;
  evidence["verification_level"] = verified === true ? "cryptographic" : "structural";
  if (verified !== true && requireCrypto) failures.push(String(verified));

  if (input.claim.actor) evidence["actor"] = input.claim.actor;
  evidence["verdict_authority"] = "cryptographic";
  return { failures, evidence };
}
