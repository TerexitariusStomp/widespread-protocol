// snapshot-governance — chain-state evidence class. The strongest
// non-code verifier in the taxonomy: the deliverable's outcome lives on a
// public indexer, so validation is a deterministic read — the same trick
// merge=accept plays for code, with the ledger as the acceptance
// attestation.
//
// Two work shapes fit this pack:
//   - authorship: "draft/submit proposal X" — bind proposal.author to actor
//   - outcome:    "get proposal X passed" — verify state/quorum/winner

import type { DomainCtx, ValidateInput, ValidateResult } from "@widespread/protocol-sdk";
import { fetchJson, sha256Hex, param } from "@widespread/protocol-sdk";

const HUB = "https://hub.snapshot.org/graphql";

interface Proposal {
  id: string; title?: string; body?: string; author?: string;
  space?: { id?: string }; state?: string;
  choices?: string[]; scores?: number[]; scores_total?: number;
  quorum?: number; created?: number; end?: number;
}
interface GqlResp { data?: { proposal?: Proposal | null }; errors?: { message?: string }[] }

/** Extract a bare proposal id from URL or raw-id ref forms. */
export function parseProposalRef(ref: string): string | null {
  const m = ref.match(/\/proposal\/(0x[0-9a-fA-F]+|Qm[\w]+|bafk[\w]+)/);
  if (m) return m[1]!;
  if (/^(0x[0-9a-fA-F]{8,}|Qm[\w]{20,}|bafk[\w]{10,})$/.test(ref.trim())) return ref.trim();
  return null;
}

export async function validate(input: ValidateInput, ctx: DomainCtx): Promise<ValidateResult> {
  const failures: string[] = [];
  const evidence: Record<string, unknown> = { ...(input.claim.evidence ?? {}) };

  const id = parseProposalRef(input.claim.ref);
  if (!id) {
    return { failures: ["claim.ref must be a Snapshot proposal URL or proposal id"], evidence };
  }

  // 1. resolve — deterministic public-state read
  const r = await fetchJson<GqlResp>(ctx, HUB, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: {
      query: `query ($id: String!) { proposal(id: $id) {
        id title body author state choices scores scores_total quorum created end
        space { id } } }`,
      variables: { id },
    },
  });
  const p = r.data?.data?.proposal;
  if (!p) {
    failures.push(r.error ?? r.data?.errors?.[0]?.message ?? "proposal not found on snapshot hub");
    return { failures, evidence };
  }
  evidence["platform"] = "snapshot";
  evidence["proposal_id"] = p.id;
  evidence["space"] = p.space?.id;
  evidence["state"] = p.state;
  evidence["author"] = p.author;
  evidence["scores_total"] = p.scores_total;
  evidence["quorum"] = p.quorum;

  // 2. bind-identity — proposal author == claimed actor (ETH address)
  const actor = (input.claim.actor ?? "").toLowerCase();
  if (actor && (p.author ?? "").toLowerCase() !== actor) {
    failures.push(`actor mismatch: proposal author is ${p.author}, claimed ${input.claim.actor}`);
  }

  // 3. prove-work — the deliverable hashed; body is the authored artifact
  evidence["body_sha256"] = `sha256:${await sha256Hex(p.body ?? "")}`;
  if (!p.body?.trim()) failures.push("proposal has empty body — no deliverable");

  // 4. bind-spec — declared outcome params
  const space = param<string>(input, "space");
  if (space && (p.space?.id ?? "").toLowerCase() !== space.toLowerCase()) {
    failures.push(`space mismatch: proposal is in ${p.space?.id}, spec requires ${space}`);
  }
  const wantState = param<string>(input, "state");
  if (wantState && (p.state ?? "") !== wantState) {
    failures.push(`state is "${p.state}", spec requires "${wantState}"`);
  }
  const minTotal = param<number>(input, "min_scores_total");
  if (minTotal !== undefined && (p.scores_total ?? 0) < minTotal) {
    failures.push(`scores_total ${p.scores_total ?? 0} < min_scores_total ${minTotal}`);
  }
  const wantWinner = param<string>(input, "winning_choice");
  if (wantWinner && p.choices?.length && p.scores?.length) {
    const winnerIdx = p.scores.indexOf(Math.max(...p.scores));
    const winner = p.choices[winnerIdx] ?? "";
    evidence["winning_choice"] = winner;
    if (winner.toLowerCase() !== wantWinner.toLowerCase()) {
      failures.push(`winning choice is "${winner}", spec requires "${wantWinner}"`);
    }
  }

  return { failures, evidence };
}
