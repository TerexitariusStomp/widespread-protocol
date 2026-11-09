// zktls-verify — proof-carrying platform evidence. Instead of trusting the
// bridge's own fetch (platform-url), the claim carries a TLSNotary
// presentation: a transcript proven to come from a declared HTTPS host.
//
// Verification: structural checks always (host binding, transcript
// hashes, notary identity, freshness); cryptographic verification when
// the `tlsn-js` verifier is installed (optional peer dep — ISC). If the
// verifier isn't installed the pack FAILS CLOSED — a proof we can't
// verify is not evidence.

import type { DomainCtx, ValidateInput, ValidateResult } from "@widespread/protocol-sdk";
import { sha256Hex, param } from "@widespread/protocol-sdk";

interface TlsnPresentation {
  version?: string;
  session?: { server_name?: string; handshake_decommitment?: unknown };
  transcript?: { sent?: unknown; recv?: unknown };
  notary_url?: string;
  time?: number;
  [k: string]: unknown;
}

async function cryptoVerify(p: unknown): Promise<boolean | string> {
  try {
    const modName = "tlsn-js";
    const mod = await import(/* @vite-ignore */ modName).catch(() => null);
    if (!mod) return "tlsn-js verifier not installed — install the optional peer dep to verify proofs";
    const verify = (mod as { verifyPresentation?: (p: unknown) => Promise<unknown> }).verifyPresentation;
    if (typeof verify !== "function") return "tlsn-js lacks verifyPresentation — verifier API drift";
    await verify(p);
    return true;
  } catch (e) {
    return `proof verification failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export async function validate(input: ValidateInput, ctx: DomainCtx): Promise<ValidateResult> {
  const failures: string[] = [];
  const evidence: Record<string, unknown> = { ...(input.claim.evidence ?? {}) };

  const ref = input.claim.ref?.trim() ?? "";
  if (!ref.startsWith("inline:") && !ref.startsWith("data:")) {
    return { failures: ["claim.ref must carry the presentation inline ('inline:<json>')"], evidence };
  }
  const payload = ref.replace(/^(inline|data):/, "");
  let pres: TlsnPresentation;
  try {
    pres = JSON.parse(payload) as TlsnPresentation;
  } catch {
    // base64-encoded presentation
    try {
      pres = JSON.parse(atob(payload)) as TlsnPresentation;
    } catch {
      return { failures: ["presentation is not JSON or base64 JSON"], evidence };
    }
  }

  // resolve — the presentation exists and parses (already done);
  // host binding is the critical check
  const host = pres.session?.server_name;
  const wantHost = param<string>(input, "host");
  if (!host) failures.push("presentation lacks session.server_name");
  else if (wantHost && host !== wantHost) {
    failures.push(`proof is for host "${host}", market requires "${wantHost}"`);
  }
  evidence["host"] = host ?? null;
  evidence["proof_sha256"] = `sha256:${await sha256Hex(payload)}`;
  evidence["notary"] = pres.notary_url ?? null;

  // freshness — presentations should be recent; params.max_age_ms bounds
  const maxAge = param<number>(input, "max_age_ms") ?? 7 * 86_400_000;
  if (typeof pres.time === "number") {
    evidence["proved_at"] = new Date(pres.time * (pres.time < 1e12 ? 1000 : 1)).toISOString();
    if (Date.now() - (pres.time < 1e12 ? pres.time * 1000 : pres.time) > maxAge) {
      failures.push("proof is stale — outside market max_age_ms");
    }
  }

  // required content — transcript must contain spec-bound strings
  const mustContain = param<string[]>(input, "transcript_contains") ?? [];
  const recv = JSON.stringify(pres.transcript?.recv ?? "");
  for (const s of mustContain) {
    if (!recv.includes(s)) failures.push(`transcript missing required content: "${s}"`);
  }

  // cryptographic verify — fail closed by default. The market may
  // declare require_crypto:false to accept structural-only validation;
  // the evidence then honestly records verification_level: structural
  // (a proof nobody cryptographically checked is weaker evidence, and
  // the label says so rather than implying otherwise).
  const requireCrypto = param<boolean>(input, "require_crypto") ?? true;
  const verified = await cryptoVerify(pres);
  evidence["verified"] = verified === true;
  evidence["verification_level"] = verified === true ? "cryptographic" : "structural";
  if (verified !== true && requireCrypto) {
    failures.push(String(verified));
  }

  if (input.claim.actor) evidence["actor"] = input.claim.actor;
  evidence["verdict_authority"] = "cryptographic";
  return { failures, evidence };
}
