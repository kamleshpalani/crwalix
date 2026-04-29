import { aiComplete } from "./router";
import type { AiCompleteResult } from "./types";

export interface ProposalLeadInput {
  name: string;
  category?: string | null;
  city?: string | null;
  country?: string | null;
  website?: string | null;
  websiteHealth?: string | null;
  websiteHealthScore?: number | null;
  servicePitch?: string[] | null;
  /** Free-form intel summary (from website audit / intel report). */
  intelSummary?: string | null;
}

export interface ProposalOrgInput {
  name: string;
  /** One-line value prop e.g. "We build modern websites for local businesses". */
  pitch?: string | null;
}

export interface DraftProposalArgs {
  organizationId: string;
  org: ProposalOrgInput;
  lead: ProposalLeadInput;
  /** Override target service/offering, e.g. "Website redesign". */
  offering?: string;
}

const SYSTEM = `You are an expert B2B sales engineer writing concise, personalized proposals.
Output a clean self-contained HTML document (no markdown, no <html>/<head> wrapper — just a <section>) with these blocks in order:
1. <h1> headline naming the prospect's business
2. <p> opener that proves you researched them (reference 1–2 specific findings)
3. <h2>Why now</h2> + <ul> with 3–5 issues you observed
4. <h2>What we propose</h2> + <ul> with 3 deliverables
5. <h2>Investment</h2> + a single <p> with a price band (placeholder e.g. "$X–Y")
6. <h2>Next step</h2> + a 1-sentence call to action
Keep total length under 350 words. Never invent specific data not present in the input.`;

function userPrompt(args: DraftProposalArgs): string {
  const { org, lead, offering } = args;
  const findings = [
    lead.website ? `website: ${lead.website}` : "no website on record",
    lead.websiteHealth ? `health: ${lead.websiteHealth}` : null,
    typeof lead.websiteHealthScore === "number"
      ? `score: ${lead.websiteHealthScore}/100`
      : null,
    lead.servicePitch?.length
      ? `recommended pitches: ${lead.servicePitch.join(", ")}`
      : null,
    lead.intelSummary ? `intel: ${lead.intelSummary}` : null,
  ]
    .filter(Boolean)
    .join("\n  - ");

  return [
    `Sender: ${org.name}${org.pitch ? " — " + org.pitch : ""}`,
    `Prospect: ${lead.name}${lead.category ? " (" + lead.category + ")" : ""}` +
      (lead.city || lead.country
        ? ` — ${[lead.city, lead.country].filter(Boolean).join(", ")}`
        : ""),
    `Findings:\n  - ${findings || "(none)"}`,
    offering
      ? `Offering: ${offering}`
      : "Offering: pick the best fit from the recommended pitches.",
  ].join("\n\n");
}

export interface DraftProposalResult {
  html: string;
  usage: AiCompleteResult["usage"];
  provider: AiCompleteResult["provider"];
  model: AiCompleteResult["model"];
}

export async function draftProposal(
  args: DraftProposalArgs,
): Promise<DraftProposalResult> {
  const result = await aiComplete({
    taskKind: "proposal.draft",
    organizationId: args.organizationId,
    temperature: 0.4,
    maxTokens: 1200,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userPrompt(args) },
    ],
  });
  return {
    html: result.text.trim(),
    usage: result.usage,
    provider: result.provider,
    model: result.model,
  };
}

/* -------------------------------------------------------------------------- */
/* Inbound reply classifier (Phase 1.8)                                        */
/* -------------------------------------------------------------------------- */

export type ReplyVerdict =
  | "INTERESTED"
  | "NOT_INTERESTED"
  | "OUT_OF_OFFICE"
  | "QUESTION"
  | "UNSUBSCRIBE"
  | "OTHER";

export interface ClassifyReplyArgs {
  organizationId: string;
  /** Original outreach we sent — gives the model context. */
  originalSubject?: string | null;
  originalSnippet?: string | null;
  /** Inbound reply we want to classify (text preferred, HTML stripped). */
  replySubject?: string | null;
  replyBody: string;
}

export interface ClassifyReplyResult {
  verdict: ReplyVerdict;
  /** Model-reported confidence in [0,1]; clamped on parse. */
  confidence: number;
  /** Short rationale for audit / dashboards. */
  reason: string;
  usage: AiCompleteResult["usage"];
  provider: AiCompleteResult["provider"];
  model: AiCompleteResult["model"];
}

const CLASSIFY_SYSTEM = `You are an email triage assistant for a sales team.
Classify the inbound reply into exactly one of these labels:
- INTERESTED: prospect wants to talk, asks for a call/demo, says yes
- NOT_INTERESTED: explicit no, "remove me", "not a fit"
- OUT_OF_OFFICE: auto-reply, vacation, will be back on date
- QUESTION: asks a clarifying question, wants more info before deciding
- UNSUBSCRIBE: explicit unsubscribe / opt-out request
- OTHER: anything that doesn't fit the above (forwarded, garbled, off-topic)

Respond ONLY as compact JSON with this exact shape:
{"verdict":"<LABEL>","confidence":<0..1>,"reason":"<<= 140 chars>"}`;

const VALID_VERDICTS: ReadonlySet<ReplyVerdict> = new Set([
  "INTERESTED",
  "NOT_INTERESTED",
  "OUT_OF_OFFICE",
  "QUESTION",
  "UNSUBSCRIBE",
  "OTHER",
]);

function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function parseClassifyJson(text: string): {
  verdict: ReplyVerdict;
  confidence: number;
  reason: string;
} {
  // Tolerate stray prose around the JSON object.
  const match = text.match(/\{[\s\S]*\}/);
  const raw = match ? match[0] : text;
  let parsed: { verdict?: string; confidence?: number; reason?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { verdict: "OTHER", confidence: 0, reason: "unparseable response" };
  }
  const upper = String(parsed.verdict ?? "")
    .toUpperCase()
    .trim();
  const verdict = VALID_VERDICTS.has(upper as ReplyVerdict)
    ? (upper as ReplyVerdict)
    : "OTHER";
  return {
    verdict,
    confidence: clampConfidence(parsed.confidence),
    reason: String(parsed.reason ?? "").slice(0, 280),
  };
}

export async function classifyReply(
  args: ClassifyReplyArgs,
): Promise<ClassifyReplyResult> {
  const userBlock = [
    args.originalSubject
      ? `Original subject we sent: ${args.originalSubject}`
      : null,
    args.originalSnippet
      ? `Original body excerpt: ${args.originalSnippet.slice(0, 600)}`
      : null,
    args.replySubject ? `Reply subject: ${args.replySubject}` : null,
    `Reply body:\n${args.replyBody.slice(0, 4000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await aiComplete({
    taskKind: "reply.classify",
    organizationId: args.organizationId,
    temperature: 0,
    maxTokens: 200,
    jsonMode: true,
    messages: [
      { role: "system", content: CLASSIFY_SYSTEM },
      { role: "user", content: userBlock },
    ],
  });

  const parsed = parseClassifyJson(result.text);
  return {
    ...parsed,
    usage: result.usage,
    provider: result.provider,
    model: result.model,
  };
}
