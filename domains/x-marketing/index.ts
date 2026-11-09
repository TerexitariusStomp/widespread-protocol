// x-marketing — platform-url evidence class. Verifies a published tweet as
// a work deliverable: the artifact resolves on the platform, its author
// binds to the claimed actor, the content is hashed at claim time (a later
// verdict recomputes against the same URL — post-claim edits change the
// hash), and the market's spec params hold.
//
// The claim-time content hash is the anti-bait-and-switch: the deliverable
// is what's published, not what was promised.

import type { DomainCtx, ValidateInput, ValidateResult } from "@widespread/protocol-sdk";
import { fetchJson, sha256Hex, param } from "@widespread/protocol-sdk";

interface TweetData {
  id?: string; text?: string; author_id?: string; created_at?: string;
}
interface TweetLookup {
  data?: TweetData;
  includes?: { users?: { id: string; username: string }[] };
}
interface OEmbed {
  author_name?: string; author_url?: string; html?: string;
}

/** Extract a bare status id from any tweet ref form. */
export function parseTweetRef(ref: string): { id: string; url: string } | null {
  const m = ref.match(/(?:x|twitter)\.com\/[\w]+\/status(?:es)?\/(\d+)/i)
    ?? ref.match(/^(\d{5,})$/);
  if (!m) return null;
  const id = m[1]!;
  return { id, url: `https://x.com/i/status/${id}` };
}

interface Resolved { text: string; handle: string; created_at?: string; source: "api" | "oembed" }

async function resolveTweet(ctx: DomainCtx, id: string, canonicalUrl: string):
  Promise<{ tweet?: Resolved; error?: string }> {
  const token = ctx.env.X_BEARER_TOKEN;
  if (token) {
    const r = await fetchJson<TweetLookup>(ctx,
      `https://api.x.com/2/tweets/${id}?tweet.fields=author_id,created_at&expansions=author_id&user.fields=username`,
      { headers: { authorization: `Bearer ${token}` } });
    if (!r.data?.data?.id) return { error: r.error ?? "tweet not found via api.x.com" };
    const handle = r.data.includes?.users?.find((u) => u.id === r.data!.data!.author_id)?.username;
    if (!handle) return { error: "tweet author unresolved in api.x.com response" };
    return { tweet: { text: r.data.data.text ?? "", handle,
      ...(r.data.data.created_at ? { created_at: r.data.data.created_at } : {}), source: "api" } };
  }
  // Keyless fallback — publish.twitter.com oembed. No created_at field, so
  // timestamp checks only run when a token is configured (honest degrade).
  const r = await fetchJson<OEmbed>(ctx,
    `https://publish.twitter.com/oembed?url=${encodeURIComponent(canonicalUrl)}`);
  if (!r.data?.html) return { error: r.error ?? "tweet not found via oembed" };
  const handle = r.data.author_url?.match(/(?:x|twitter)\.com\/([\w]+)/i)?.[1];
  const text = r.data.html
    .replace(/<a[^>]*>.*?<\/a>/gs, "")          // strip link markup, keep text
    .replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ").trim();
  if (!handle) return { error: "author handle unparseable in oembed response" };
  return { tweet: { text, handle, source: "oembed" } };
}

export async function validate(input: ValidateInput, ctx: DomainCtx): Promise<ValidateResult> {
  const failures: string[] = [];
  const evidence: Record<string, unknown> = { ...(input.claim.evidence ?? {}) };

  const ref = parseTweetRef(input.claim.ref);
  if (!ref) {
    return { failures: ["claim.ref must be a tweet URL (x.com/<handle>/status/<id>) or status id"], evidence };
  }

  // 1. resolve
  const { tweet, error } = await resolveTweet(ctx, ref.id, ref.url);
  if (!tweet) {
    failures.push(`tweet not resolvable: ${error}`);
    return { failures, evidence };
  }
  evidence["platform"] = "x";
  evidence["tweet_id"] = ref.id;
  evidence["url"] = ref.url;
  evidence["author_handle"] = tweet.handle;
  evidence["source"] = tweet.source;
  if (tweet.created_at) evidence["created_at"] = tweet.created_at;

  // 2. bind-identity — author handle == claimed actor
  const actor = (input.claim.actor ?? "").replace(/^@/, "");
  if (actor && actor.toLowerCase() !== tweet.handle.toLowerCase()) {
    failures.push(`actor mismatch: tweet author is @${tweet.handle}, claimed @${actor}`);
  }

  // 3. prove-work — non-empty content, hashed at claim time
  if (!tweet.text) failures.push("tweet has no text content");
  evidence["content_sha256"] = `sha256:${await sha256Hex(tweet.text)}`;
  evidence["content_length"] = tweet.text.length;

  // 4. bind-spec — verification.params acceptance criteria
  const minLen = param<number>(input, "min_length");
  if (minLen !== undefined && tweet.text.length < minLen) {
    failures.push(`content ${tweet.text.length} chars < min_length ${minLen}`);
  }
  const required = param<string[]>(input, "required_terms") ?? [];
  const lower = tweet.text.toLowerCase();
  for (const term of required) {
    if (!lower.includes(term.toLowerCase())) failures.push(`required term missing: "${term}"`);
  }
  // A nonce param binds the deliverable to THIS market — the tweet itself
  // must carry it (no separate proof round-trip needed).
  const nonce = param<string>(input, "nonce");
  if (nonce && !tweet.text.includes(nonce)) failures.push("market nonce absent from tweet");
  const createdAfter = param<number>(input, "created_after") ?? input.market.created_at;
  if (createdAfter !== undefined) {
    if (!tweet.created_at) {
      failures.push("created_after check requested but timestamp unavailable (set X_BEARER_TOKEN)");
    } else if (new Date(tweet.created_at).getTime() < createdAfter) {
      failures.push("tweet predates market creation — not work performed for this market");
    }
  }

  return { failures, evidence };
}
