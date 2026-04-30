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
  /** Voice / register the AI should adopt. Defaults to "professional". */
  tone?: "professional" | "friendly" | "concise" | "persuasive" | "executive";
  /** Optional pricing band the AI must use verbatim, e.g. "$3,000–$4,500". */
  priceBand?: string;
}

const TONE_GUIDANCE: Record<NonNullable<DraftProposalArgs["tone"]>, string> = {
  professional:
    "Voice: confident, polished, business-appropriate. Avoid slang.",
  friendly:
    "Voice: warm, conversational, first-name energy without being casual.",
  concise:
    "Voice: terse and dense. Prefer short sentences and bullets. Cut filler.",
  persuasive:
    "Voice: outcome-driven, benefit-led. Emphasise ROI and risk of inaction.",
  executive:
    "Voice: C-suite ready. Lead with strategic outcomes, downplay tactics.",
};

const SYSTEM_TEMPLATE = (tone: string, priceBand?: string) =>
  `You are an expert B2B sales engineer writing concise, personalized proposals.
${tone}
Output a clean self-contained HTML document (no markdown, no <html>/<head> wrapper — just a <section>) using these labelled blocks IN THIS EXACT ORDER. Each block must be wrapped in <section data-block="<id>"> so downstream renderers can re-style them:
  cover       — <h1> with the prospect's business name + a one-line subtitle
  summary     — <p> 2–3 sentences proving you researched them; reference 1–2 specific findings
  problems    — <h2>Problems we observed</h2> + <ul> with 3–5 issues (each <li> tagged with <strong> impact label)
  solution    — <h2>Our approach</h2> + <p> describing the recommended path
  scope       — <h2>Scope</h2> + <ul> of in-scope items
  deliverables— <h2>Deliverables</h2> + <ul> with 3–5 concrete artifacts
  timeline    — <h2>Timeline</h2> + <ol> with 3–4 phases (week ranges)
  pricing     — <h2>Investment</h2> + <p> with the price${priceBand ? ` (use exactly: ${priceBand})` : ' band (placeholder e.g. "$X–Y")'}
  terms       — <h2>Terms</h2> + <ul> with 3–4 short bullets (validity, deposit, deliverable acceptance)
  cta         — <h2>Next step</h2> + 1-sentence call to action
Keep total length under 500 words. Never invent specific numbers or facts not present in the input. Do NOT include any text outside the outer <section>.`;

function userPrompt(args: DraftProposalArgs): string {
  const { org, lead, offering, priceBand } = args;
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

  const senderLine = org.pitch
    ? `Sender: ${org.name} — ${org.pitch}`
    : `Sender: ${org.name}`;
  const locationBits = [lead.city, lead.country].filter(Boolean).join(", ");
  const prospectLine =
    `Prospect: ${lead.name}` +
    (lead.category ? ` (${lead.category})` : "") +
    (locationBits ? ` — ${locationBits}` : "");

  return [
    senderLine,
    prospectLine,
    `Findings:\n  - ${findings || "(none)"}`,
    offering
      ? `Offering: ${offering}`
      : "Offering: pick the best fit from the recommended pitches.",
    priceBand
      ? `Price band (use verbatim in pricing block): ${priceBand}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
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
  const tone = args.tone ?? "professional";
  const system = SYSTEM_TEMPLATE(TONE_GUIDANCE[tone], args.priceBand);
  const result = await aiComplete({
    taskKind: "proposal.draft",
    organizationId: args.organizationId,
    temperature: 0.4,
    maxTokens: 1600,
    messages: [
      { role: "system", content: system },
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

// ─────────────────────────────────────────────────────────────────────
// Phase 4.6 — natural-language search query parser.
//
// Converts a free-text query (e.g. "high priority leads in Texas with no
// website created last week") into a strongly-typed filter spec that the
// app can run against Prisma. Constrained to a small enum so the LLM
// can't invent fields that don't exist.
// ─────────────────────────────────────────────────────────────────────

export type SearchEntity = "leads" | "deals" | "projects";

export interface NlLeadFilter {
  status?: string[]; // LeadStatus values
  priorityTier?: ("LOW" | "MEDIUM" | "HIGH")[];
  city?: string[];
  state?: string[];
  country?: string[];
  hasWebsite?: boolean; // true = website present, false = missing
  scoreGte?: number; // 0..100
  createdWithinDays?: number; // 1..365
  search?: string; // text search on name
}

export interface NlDealFilter {
  status?: ("OPEN" | "WON" | "LOST")[];
  amountGteCents?: number;
  amountLteCents?: number;
  createdWithinDays?: number;
  expectedCloseWithinDays?: number;
  search?: string; // text on title
}

export interface NlProjectFilter {
  status?: string[]; // PLANNING|ACTIVE|PAUSED|COMPLETED|ARCHIVED
  createdWithinDays?: number;
  search?: string;
}

export interface NlSearchSpec {
  entities: SearchEntity[];
  leads?: NlLeadFilter;
  deals?: NlDealFilter;
  projects?: NlProjectFilter;
  /** Brief explanation of how the query was interpreted, shown in UI. */
  interpretation: string;
}

const NL_SEARCH_SYSTEM = `You convert short natural-language queries about a CRM into a JSON filter spec.

Return ONLY JSON matching this TypeScript type:
{
  "entities": ("leads" | "deals" | "projects")[],
  "leads"?: {
    "status"?: string[],          // any of: NEW VERIFIED CONTACTED INTERESTED FOLLOW_UP NOT_INTERESTED CONVERTED CLOSED
    "priorityTier"?: ("LOW"|"MEDIUM"|"HIGH")[],
    "city"?: string[], "state"?: string[], "country"?: string[],
    "hasWebsite"?: boolean,
    "scoreGte"?: number,          // 0..100
    "createdWithinDays"?: number, // 1..365
    "search"?: string             // free-text on name
  },
  "deals"?: {
    "status"?: ("OPEN"|"WON"|"LOST")[],
    "amountGteCents"?: number,
    "amountLteCents"?: number,
    "createdWithinDays"?: number,
    "expectedCloseWithinDays"?: number,
    "search"?: string             // free-text on title
  },
  "projects"?: {
    "status"?: string[],          // PLANNING ACTIVE PAUSED COMPLETED ARCHIVED
    "createdWithinDays"?: number,
    "search"?: string
  },
  "interpretation": string         // ≤120 chars, plain English
}

Rules:
- If unsure which entity, default to ["leads"].
- Convert money phrases to cents ($5k → 500000, $10k+ → amountGteCents 1000000).
- "this week" → 7 days, "this month" → 30 days, "this quarter" → 90 days.
- Map natural status words ("hot lead" → priorityTier ["HIGH"], "won deals" → status ["WON"]).
- Never invent fields. If something has no representation, drop it from the spec.
- Output JSON only, no prose, no markdown fences.`;

function parseNlSearchJson(text: string): {
  entities?: unknown;
  leads?: unknown;
  deals?: unknown;
  projects?: unknown;
  interpretation?: unknown;
} {
  const match = text.match(/\{[\s\S]*\}/);
  const raw = match ? match[0] : text;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function clampDays(n: unknown): number | undefined {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return undefined;
  return Math.max(1, Math.min(365, Math.round(v)));
}

function clampScore(n: unknown): number | undefined {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return undefined;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function sanitizeStringArray(v: unknown, max = 10): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const arr = v
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .slice(0, max)
    .map((s) => s.slice(0, 80));
  return arr.length === 0 ? undefined : arr;
}

const VALID_ENTITIES: ReadonlyArray<SearchEntity> = [
  "leads",
  "deals",
  "projects",
];
const VALID_DEAL_STATUS = new Set(["OPEN", "WON", "LOST"]);
const VALID_TIER = new Set(["LOW", "MEDIUM", "HIGH"]);

export async function parseSearchQuery(args: {
  organizationId: string;
  query: string;
}): Promise<NlSearchSpec & { usage: AiCompleteResult["usage"] }> {
  const result = await aiComplete({
    taskKind: "search.parse",
    organizationId: args.organizationId,
    temperature: 0,
    maxTokens: 400,
    jsonMode: true,
    messages: [
      { role: "system", content: NL_SEARCH_SYSTEM },
      { role: "user", content: args.query.slice(0, 500) },
    ],
  });

  const raw = parseNlSearchJson(result.text);
  const entities =
    Array.isArray(raw.entities) && raw.entities.length > 0
      ? (raw.entities.filter(
          (e: unknown): e is SearchEntity =>
            typeof e === "string" && VALID_ENTITIES.includes(e as SearchEntity),
        ) as SearchEntity[])
      : (["leads"] as SearchEntity[]);

  const spec: NlSearchSpec = {
    entities: entities.length > 0 ? entities : ["leads"],
    interpretation:
      typeof raw.interpretation === "string"
        ? raw.interpretation.slice(0, 200)
        : "Searching with default filters.",
  };

  if (raw.leads && typeof raw.leads === "object") {
    const l = raw.leads as Record<string, unknown>;
    spec.leads = {
      status: sanitizeStringArray(l.status),
      priorityTier: (sanitizeStringArray(l.priorityTier) ?? []).filter((s) =>
        VALID_TIER.has(s),
      ) as ("LOW" | "MEDIUM" | "HIGH")[] | undefined,
      city: sanitizeStringArray(l.city, 5),
      state: sanitizeStringArray(l.state, 5),
      country: sanitizeStringArray(l.country, 5),
      hasWebsite: typeof l.hasWebsite === "boolean" ? l.hasWebsite : undefined,
      scoreGte: clampScore(l.scoreGte),
      createdWithinDays: clampDays(l.createdWithinDays),
      search:
        typeof l.search === "string" && l.search.length > 0
          ? l.search.slice(0, 100)
          : undefined,
    };
    if (spec.leads.priorityTier && spec.leads.priorityTier.length === 0) {
      spec.leads.priorityTier = undefined;
    }
  }

  if (raw.deals && typeof raw.deals === "object") {
    const d = raw.deals as Record<string, unknown>;
    const status = (sanitizeStringArray(d.status) ?? []).filter((s) =>
      VALID_DEAL_STATUS.has(s),
    ) as ("OPEN" | "WON" | "LOST")[];
    spec.deals = {
      status: status.length > 0 ? status : undefined,
      amountGteCents:
        typeof d.amountGteCents === "number" && d.amountGteCents >= 0
          ? Math.round(d.amountGteCents)
          : undefined,
      amountLteCents:
        typeof d.amountLteCents === "number" && d.amountLteCents >= 0
          ? Math.round(d.amountLteCents)
          : undefined,
      createdWithinDays: clampDays(d.createdWithinDays),
      expectedCloseWithinDays: clampDays(d.expectedCloseWithinDays),
      search:
        typeof d.search === "string" && d.search.length > 0
          ? d.search.slice(0, 100)
          : undefined,
    };
  }

  if (raw.projects && typeof raw.projects === "object") {
    const p = raw.projects as Record<string, unknown>;
    spec.projects = {
      status: sanitizeStringArray(p.status),
      createdWithinDays: clampDays(p.createdWithinDays),
      search:
        typeof p.search === "string" && p.search.length > 0
          ? p.search.slice(0, 100)
          : undefined,
    };
  }

  return { ...spec, usage: result.usage };
}

// =============================================================================
// support.answer — RAG-style support agent
// =============================================================================

export interface SupportAgentArticle {
  id: string;
  title: string;
  content: string;
  /** Optional similarity score 0..1 the caller already computed. */
  score?: number;
}

export interface SupportAgentArgs {
  organizationId: string;
  question: string;
  /** Top-K articles, already ranked by the caller (highest first). */
  articles: SupportAgentArticle[];
  /** Optional prior turns for multi-turn threads. */
  history?: { role: "USER" | "AI" | "AGENT"; content: string }[];
  /** Caller-supplied org pitch / brand voice hint. */
  brandVoice?: string;
}

export interface SupportAgentReply {
  answer: string;
  /** 0..1 — model self-rated. <0.6 should set needsHandoff true. */
  confidence: number;
  needsHandoff: boolean;
  citedArticleIds: string[];
  usage: AiCompleteResult["usage"];
}

const SUPPORT_SYS_PROMPT = `You are a customer support assistant. Use ONLY the
provided knowledge base snippets to answer. If the snippets do not cover the
question, set needsHandoff=true and reply with a short message asking the user
to wait for a teammate.

Output STRICT JSON matching this shape, with no prose outside the JSON:
{
  "answer": "string, friendly, <= 4 short paragraphs",
  "confidence": number between 0 and 1,
  "needsHandoff": boolean,
  "citedArticleIds": ["id of every snippet you actually used"]
}

Rules:
- If confidence < 0.6, set needsHandoff = true.
- Never invent product features, prices, or policies.
- Cite every snippet you relied on.
- Keep the tone calm and concise.`;

function clamp01(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, v));
}

export async function answerSupportQuestion(
  args: SupportAgentArgs,
): Promise<SupportAgentReply> {
  const ctxBlocks = args.articles
    .slice(0, 5)
    .map(
      (a, i) =>
        `[#${i + 1} id=${a.id}] ${a.title}\n${a.content.slice(0, 1500)}`,
    )
    .join("\n\n---\n\n");

  const historyText = (args.history ?? [])
    .slice(-6)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const userMsg = [
    args.brandVoice ? `Brand voice: ${args.brandVoice}` : "",
    "Knowledge base snippets:",
    ctxBlocks || "(none — knowledge base empty)",
    historyText ? `\nConversation so far:\n${historyText}` : "",
    `\nUser question:\n${args.question}`,
    "\nReturn JSON only.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await aiComplete({
    taskKind: "support.answer",
    organizationId: args.organizationId,
    temperature: 0.2,
    messages: [
      { role: "system", content: SUPPORT_SYS_PROMPT },
      { role: "user", content: userMsg },
    ],
  });

  let parsed: {
    answer?: unknown;
    confidence?: unknown;
    needsHandoff?: unknown;
    citedArticleIds?: unknown;
  } = {};
  try {
    const text = result.text.trim();
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    parsed =
      jsonStart >= 0 && jsonEnd > jsonStart
        ? JSON.parse(text.slice(jsonStart, jsonEnd + 1))
        : {};
  } catch {
    parsed = {};
  }

  const answer =
    typeof parsed.answer === "string" && parsed.answer.trim().length > 0
      ? parsed.answer.trim()
      : "I'm not sure yet — let me hand this to a teammate.";
  const confidence = clamp01(parsed.confidence);
  const needsHandoff =
    confidence < 0.6 ||
    parsed.needsHandoff === true ||
    args.articles.length === 0;
  const citedArticleIds = Array.isArray(parsed.citedArticleIds)
    ? parsed.citedArticleIds
        .filter((x): x is string => typeof x === "string")
        .slice(0, 10)
    : [];

  return {
    answer,
    confidence,
    needsHandoff,
    citedArticleIds,
    usage: result.usage,
  };
}

/* -------------------------------------------------------------------------- */
/* AI Lead Scoring                                                              */
/* -------------------------------------------------------------------------- */

export interface AiScoreLeadInput {
  organizationId: string;
  lead: {
    name: string;
    category?: string | null;
    city?: string | null;
    country?: string | null;
    website?: string | null;
    websiteStatus?: string | null;
    phone?: string | null;
    email?: string | null;
    rating?: number | null;
    reviewCount?: number | null;
    score?: number | null;
    tags?: string[] | null;
    intelSummary?: string | null;
  };
}

export interface AiScoreLeadResult {
  /** AI-assigned 0-100 score. */
  score: number;
  /** One of: CRITICAL | HIGH | MEDIUM | LOW */
  tier: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  /** Short reasoning paragraph (1-3 sentences). */
  reasoning: string;
  usage: AiCompleteResult["usage"];
  provider: AiCompleteResult["provider"];
  model: AiCompleteResult["model"];
}

const AI_SCORE_SYSTEM = `You are an expert B2B lead qualification analyst. Given a business lead's data, produce a qualification score and tier.

Respond ONLY with a valid JSON object (no markdown, no prose):
{
  "score": <integer 0-100>,
  "tier": "<CRITICAL|HIGH|MEDIUM|LOW>",
  "reasoning": "<1-3 sentence explanation>"
}

Scoring guidance:
- 80-100 (CRITICAL): Multiple contact methods, strong online presence, high category value, positive signals
- 60-79 (HIGH): Good contact data, decent web presence, clear category fit  
- 40-59 (MEDIUM): Partial contact data, limited online presence or unclear fit
- 0-39 (LOW): Missing contacts, no website, very low rating or unknown category

Factors (in rough weight order):
1. Contact completeness: phone + email > phone or email > neither
2. Website status: healthy > exists but issues > no website
3. Rating and review count: high rating with many reviews is very positive
4. Category value: e.g. law firms, dentists, architects score higher than vague categories
5. Intel summary: positive signals from crawled website boost score
6. Location data: having city/country adds trustworthiness`;

function getContactStatus(
  phone?: string | null,
  email?: string | null,
): string {
  if (phone && email) return "phone + email";
  if (phone) return "phone only";
  if (email) return "email only";
  return "none";
}

function getRatingLine(
  rating?: number | null,
  reviewCount?: number | null,
): string | null {
  if (typeof rating !== "number") return null;
  const suffix =
    typeof reviewCount === "number" ? ` (${reviewCount} reviews)` : "";
  return `Rating: ${rating.toFixed(1)}${suffix}`;
}

function buildLeadScorePrompt(input: AiScoreLeadInput["lead"]): string {
  const lines = [
    `Business name: ${input.name}`,
    input.category ? `Category: ${input.category}` : null,
    (input.city ?? input.country)
      ? `Location: ${[input.city, input.country].filter(Boolean).join(", ")}`
      : "Location: unknown",
    input.website ? `Website: ${input.website}` : "Website: none",
    input.websiteStatus ? `Website status: ${input.websiteStatus}` : null,
    `Contacts: ${getContactStatus(input.phone, input.email)}`,
    getRatingLine(input.rating, input.reviewCount),
    input.score !== null && input.score !== undefined
      ? `Rule-based score: ${input.score}/100`
      : null,
    input.tags?.length ? `Tags: ${input.tags.join(", ")}` : null,
    input.intelSummary ? `Intel summary:\n${input.intelSummary}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `Evaluate this lead:\n\n${lines}`;
}

function clampScore(n: unknown): number {
  let v: number;
  if (typeof n === "number") {
    v = n;
  } else if (typeof n === "string") {
    v = Number.parseFloat(n);
  } else {
    v = Number.NaN;
  }
  if (Number.isNaN(v)) return 50;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function scoreToTier(score: number): AiScoreLeadResult["tier"] {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

const VALID_TIERS = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);

export async function scoreLeadWithAi(
  args: AiScoreLeadInput,
): Promise<AiScoreLeadResult> {
  const result = await aiComplete({
    taskKind: "lead.score",
    organizationId: args.organizationId,
    temperature: 0.1,
    maxTokens: 300,
    jsonMode: true,
    messages: [
      { role: "system", content: AI_SCORE_SYSTEM },
      { role: "user", content: buildLeadScorePrompt(args.lead) },
    ],
  });

  let parsed: { score?: unknown; tier?: unknown; reasoning?: unknown } = {};
  try {
    const text = result.text.trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      parsed = JSON.parse(text.slice(start, end + 1)) as typeof parsed;
    }
  } catch {
    // fallback to defaults below
  }

  const score = clampScore(parsed.score);
  const tier =
    typeof parsed.tier === "string" && VALID_TIERS.has(parsed.tier)
      ? (parsed.tier as AiScoreLeadResult["tier"])
      : scoreToTier(score);
  const reasoning =
    typeof parsed.reasoning === "string" && parsed.reasoning.trim().length > 0
      ? parsed.reasoning.trim()
      : "Score derived from available lead data.";

  return {
    score,
    tier,
    reasoning,
    usage: result.usage,
    provider: result.provider,
    model: result.model,
  };
}
