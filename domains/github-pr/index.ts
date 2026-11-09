// github-pr — the reference domain pack. Verifies GitHub PR/issue
// submissions. Ported from widespread-bridge's validateForgeSubmission;
// the five-check shape (resolve → bind-identity → prove-work → bind-spec)
// is the contract every domain pack implements.

import type { DomainCtx, ValidateInput, ValidateResult } from "@widespread/protocol-sdk";
import { gh, parseForgeRef, patchFingerprint, type GhFile, type GhIssue, type GhPull } from "./forge.ts";

export async function validate(input: ValidateInput, ctx: DomainCtx): Promise<ValidateResult> {
  const failures: string[] = [];
  const evidence: Record<string, unknown> = { ...(input.claim.evidence ?? {}) };

  const ref = parseForgeRef(input.claim.ref);
  if (!ref) {
    return { failures: ["claim.ref must be a github.com owner/repo/(issues|pull)/N or owner/repo#N"], evidence };
  }

  // 1. resolve — artifact exists on the forge
  const issueRes = await gh<GhIssue>(ctx, `/repos/${ref.owner}/${ref.repo}/issues/${ref.number}`);
  const issue = issueRes.data;
  if (!issue) {
    failures.push(issueRes.error ?? "forge artifact not found");
    return { failures, evidence };
  }
  if (issue.state !== "open" && ref.kind === "issue") failures.push(`issue is ${issue.state}`);

  // 2. bind-identity — artifact author == claimed actor. Numeric id is the
  // strong binding (login can change); @login accepted as weak form.
  const authorId = String(issue.user?.id ?? "");
  const authorLogin = issue.user?.login ?? "";
  const actor = (input.claim.actor ?? "").replace(/^@/, "");
  if (actor) {
    const strong = /^\d+$/.test(actor) && actor === authorId;
    const weak = !/^\d+$/.test(actor) && actor.toLowerCase() === authorLogin.toLowerCase();
    if (!strong && !weak) {
      failures.push(`actor mismatch: artifact author is ${authorId} (${authorLogin}), claimed ${input.claim.actor}`);
    }
    evidence["actor_binding"] = strong ? "github-id" : weak ? "github-login" : "failed";
  }

  if (ref.kind === "pr") {
    // 3. prove-work — non-empty patch fingerprint over the diff
    const prRes = await gh<GhPull>(ctx, `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`);
    const filesRes = await gh<GhFile[]>(ctx, `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files?per_page=100`);
    const files = filesRes.data;
    const fp = files?.length ? await patchFingerprint(files) : null;
    if (prRes.error) failures.push(prRes.error);
    if (filesRes.error) failures.push(filesRes.error);
    if (!fp) failures.push("PR has no computable patch (empty or >100-file diff)");
    else {
      evidence["patch_fingerprint"] = fp;
      if (prRes.data?.head?.sha) evidence["head_sha"] = prRes.data.head.sha;
    }
  }

  evidence["forge"] = "github";
  evidence["forgeRef"] = `https://github.com/${ref.owner}/${ref.repo}/${ref.kind === "pr" ? "pull" : "issues"}/${ref.number}`;
  evidence["forgeUserId"] = authorId;
  evidence["forgeLogin"] = authorLogin;

  // 4. bind-spec — evidence.specHash must match the market's when both exist
  const claimHash = String(input.claim.evidence?.["specHash"] ?? "");
  const marketHash = input.market.specHash ?? "";
  if (claimHash && marketHash && claimHash !== marketHash) {
    failures.push(`specHash mismatch: claim ${claimHash} != market ${marketHash}`);
  }

  return { failures, evidence };
}
