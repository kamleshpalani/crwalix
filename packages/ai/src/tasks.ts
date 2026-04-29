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

/* -------------------------------------------------------------------------- */
/* Weekly digest (Phase 4.1)                                                   */
/* -------------------------------------------------------------------------- */

export interface WeeklyDigestStats {
  /** ISO date strings — what window the report covers. */
  periodStart: string;
  periodEnd: string;
  newLeads: number;
  newDeals: number;
  dealsWon: number;
  dealsLost: number;
  /** Sum of `value` field on deals that closed-won this period (cents). */
  revenueWonCents: number;
  /** Total open pipeline value at end of period (cents). */
  openPipelineCents: number;
  /** Conversion: dealsWon / (dealsWon + dealsLost), 0..1. */
  conversionRate: number;
  /** Median days from deal-created to deal-won this period (null if 0 wins). */
  medianCycleDays: number | null;
  /** Top blockers — free-form strings: dead-pipeline, missing data, etc. */
  blockers: string[];
  /** Top performing sequence (name + reply rate). */
  topSequence?: { name: string; replyRate: number } | null;
}

export interface WeeklyDigestArgs {
  organizationId: string;
  orgName: string;
  stats: WeeklyDigestStats;
  /** Currency code for revenue formatting; default USD. */
  currency?: string;
}

export interface WeeklyDigestResult {
  /** Plain-text digest (used as email text/* fallback). */
  text: string;
  /** Self-contained HTML <section> for rendering inside an email template. */
  html: string;
  /** One-line subject suitable for the email subject header. */
  subject: string;
  usage: AiCompleteResult["usage"];
  provider: AiCompleteResult["provider"];
  model: AiCompleteResult["model"];
}

const DIGEST_SYSTEM = `You are a sales operations analyst writing a friendly, scannable weekly business digest for a sales team founder/owner.
Tone: confident, direct, no fluff. Reference the numbers given — never invent figures.
Output a JSON object with this exact shape:
{
  "subject": "<<= 70 chars, includes a key number>",
  "text": "<plain text digest, 5-9 short lines, no markdown>",
  "html": "<self-contained HTML section, NO <html>/<head>, just <section>...</section>; use <h2>/<ul>/<p>; never include <script> or external resources>"
}

The digest must include, in this order:
1. Headline (e.g. "$X won this week, Y new deals opened")
2. "What moved" — 2-4 bullets of pipeline activity
3. "What's stuck" — 1-3 bullets if blockers exist; otherwise omit this section
4. "Recommended next step" — exactly ONE concrete action for the user this week`;

function formatMoney(cents: number, currency: string): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

function digestUserPrompt(args: WeeklyDigestArgs): string {
  const cur = args.currency ?? "USD";
  const s = args.stats;
  const lines = [
    `Organization: ${args.orgName}`,
    `Period: ${s.periodStart} → ${s.periodEnd}`,
    `New leads: ${s.newLeads}`,
    `New deals: ${s.newDeals}`,
    `Deals won: ${s.dealsWon}`,
    `Deals lost: ${s.dealsLost}`,
    `Revenue won: ${formatMoney(s.revenueWonCents, cur)}`,
    `Open pipeline: ${formatMoney(s.openPipelineCents, cur)}`,
    `Win rate: ${(s.conversionRate * 100).toFixed(0)}%`,
    s.medianCycleDays !== null
      ? `Median cycle: ${s.medianCycleDays} days`
      : "Median cycle: n/a (no wins yet)",
    s.topSequence
      ? `Top sequence: ${s.topSequence.name} (${(s.topSequence.replyRate * 100).toFixed(0)}% reply)`
      : "Top sequence: n/a",
    s.blockers.length > 0
      ? `Blockers:\n  - ${s.blockers.join("\n  - ")}`
      : "Blockers: none flagged",
  ];
  return lines.join("\n");
}

function parseDigestJson(text: string): {
  subject: string;
  text: string;
  html: string;
} {
  const match = text.match(/\{[\s\S]*\}/);
  const raw = match ? match[0] : text;
  try {
    const parsed = JSON.parse(raw);
    return {
      subject: String(parsed.subject ?? "Weekly digest").slice(0, 140),
      text: String(parsed.text ?? "").trim(),
      html: String(parsed.html ?? "").trim(),
    };
  } catch {
    // Last-resort: ship the raw text with a generic subject so the user
    // still gets something useful.
    return {
      subject: "Weekly digest",
      text: text.trim(),
      html: `<section><pre>${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c)}</pre></section>`,
    };
  }
}

export async function generateWeeklyDigest(
  args: WeeklyDigestArgs,
): Promise<WeeklyDigestResult> {
  const result = await aiComplete({
    taskKind: "report.weekly",
    organizationId: args.organizationId,
    temperature: 0.3,
    maxTokens: 1200,
    jsonMode: true,
    messages: [
      { role: "system", content: DIGEST_SYSTEM },
      { role: "user", content: digestUserPrompt(args) },
    ],
  });

  const parsed = parseDigestJson(result.text);
  return {
    ...parsed,
    usage: result.usage,
    provider: result.provider,
    model: result.model,
  };
}
