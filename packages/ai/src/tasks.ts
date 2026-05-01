import { aiComplete } from "./router";
import type { AiCompleteResult, AiUsage } from "./types";

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
  /** Optional maintenance/support packages to include in the proposal. */
  maintenanceOptions?: string[] | null;
  /** Optional add-on services to surface, e.g. ["SEO audit", "Copywriting"]. */
  addons?: string[] | null;
  /** Custom terms & conditions text; if omitted AI generates sensible defaults. */
  termsAndConditions?: string | null;
  /** Name of the acceptance/signatory contact, used to personalise the acceptance block. */
  signatoryName?: string | null;
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
  cover            — <h1> with the prospect's business name + a one-line subtitle
  summary          — <p> 2–3 sentences proving you researched them; reference 1–2 specific findings
  problems         — <h2>Problems we observed</h2> + <ul> with 3–5 issues (each <li> tagged with <strong> impact label)
  solution         — <h2>Our approach</h2> + <p> describing the recommended path
  scope            — <h2>Scope</h2> + <ul> of in-scope items
  deliverables     — <h2>Deliverables</h2> + <ul> with 3–5 concrete artifacts
  timeline         — <h2>Timeline</h2> + <ol> with 3–4 phases (week ranges)
  pricing          — <h2>Investment</h2> + <p> with the price${priceBand ? ` (use exactly: ${priceBand})` : ' band (placeholder e.g. "$X–Y")'}
  payment_terms    — <h2>Payment Terms</h2> + <ul> with deposit %, milestone schedule, and final payment trigger
  maintenance      — <h2>Maintenance & Support</h2> + <ul> listing ongoing support options and monthly retainer range (use provided options if given, otherwise suggest sensible defaults)
  addons           — <h2>Optional Add-ons</h2> + <ul> of enhancement services with indicative prices (use provided list if given)
  terms_conditions — <h2>Terms & Conditions</h2> + <ul> with 5–7 bullets: IP ownership, revision rounds, confidentiality, liability cap, governing law, cancellation, force majeure (use provided text if given, otherwise generate reasonable defaults)
  acceptance       — <h2>Acceptance</h2> + a short paragraph asking the client to confirm by reply or signature, a blank line for signature + printed name, and a date field. If a signatory name was provided, pre-fill the printed name field.
  cta              — <h2>Next step</h2> + 1-sentence call to action
Keep total length under 700 words. Never invent specific numbers or facts not present in the input. Do NOT include any text outside the outer <section>.`;

function userPrompt(args: DraftProposalArgs): string {
  const {
    org,
    lead,
    offering,
    priceBand,
    maintenanceOptions,
    addons,
    termsAndConditions,
    signatoryName,
  } = args;
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
    maintenanceOptions?.length
      ? `Maintenance options to include: ${maintenanceOptions.join(", ")}`
      : null,
    addons?.length ? `Optional add-ons to list: ${addons.join(", ")}` : null,
    termsAndConditions
      ? `Custom T&C (use verbatim in terms_conditions block):\n${termsAndConditions}`
      : null,
    signatoryName
      ? `Signatory name for acceptance block: ${signatoryName}`
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
    maxTokens: 2400,
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
/* §10 AI Lead Scoring + Recommendations                                       */
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
    /** §9.1 — 7-state website classification from audit. */
    websiteClassification?: string | null;
    phone?: string | null;
    email?: string | null;
    rating?: number | null;
    reviewCount?: number | null;
    score?: number | null;
    tags?: string[] | null;
    intelSummary?: string | null;
    /** §8.1 — Business scale. */
    businessScale?: string | null;
    /** §10.2 — Audit signals for deeper scoring context. */
    hasBookingForm?: boolean | null;
    hasLeadCaptureForm?: boolean | null;
    hasSeoBasics?: boolean | null;
    hasSchemaMarkup?: boolean | null;
    hasAnalytics?: boolean | null;
    hasMobileViewport?: boolean | null;
    websiteHealthScore?: number | null;
  };
}

export interface AiScoreLeadResult {
  /** §10.1 — AI-assigned 0-100 score. */
  score: number;
  /** §10.1 — One of: CRITICAL | HIGH | MEDIUM | LOW | NOT_RECOMMENDED */
  tier: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NOT_RECOMMENDED";
  /** Short reasoning paragraph (1-3 sentences). */
  reasoning: string;
  /** §10.3 — Whether to contact this lead (true = yes). */
  contactRecommended: boolean;
  /** §10.3 — Best service to pitch (e.g. "Website Redesign + SEO"). */
  bestServicePitch: string;
  /** §10.3 — Best outreach angle (1-2 sentences addressing their specific pain). */
  outreachAngle: string;
  /** §10.3 — Suggested service package name. */
  suggestedPackage: string;
  /** §10.3 — Estimated deal size range (e.g. "$2,000–$5,000"). */
  estimatedDealSize: string;
  /** §10.3 — Probability of conversion 0-100. */
  conversionProbability: number;
  /** §10.3 — Suggested immediate next action. */
  suggestedNextAction: string;
  usage: AiCompleteResult["usage"];
  provider: AiCompleteResult["provider"];
  model: AiCompleteResult["model"];
}

const AI_SCORE_SYSTEM = `You are an expert B2B lead qualification analyst for a web design and digital marketing agency.
Given a business lead's data, produce a qualification score, tier, and full §10 sales recommendation.

Respond ONLY with a valid JSON object (no markdown, no prose):
{
  "score": <integer 0-100>,
  "tier": "<CRITICAL|HIGH|MEDIUM|LOW|NOT_RECOMMENDED>",
  "reasoning": "<1-3 sentence explanation>",
  "contactRecommended": <true|false>,
  "bestServicePitch": "<concise service name, e.g. 'Website Redesign + SEO'>",
  "outreachAngle": "<1-2 sentences addressing their specific business pain>",
  "suggestedPackage": "<package tier name, e.g. 'Starter Website + Local SEO'>",
  "estimatedDealSize": "<range, e.g. '$2,000–$4,000'>",
  "conversionProbability": <integer 0-100>,
  "suggestedNextAction": "<concrete next step for the sales rep>"
}

§10.1 Scoring tiers:
- 80-100 (CRITICAL): Contact immediately — no/broken website, high category value, multiple contact methods
- 60-79 (HIGH): Follow up this week — good fit, some digital weakness to exploit
- 40-59 (MEDIUM): Nurture sequence — partial fit, lower urgency
- 20-39 (LOW): Low priority — already has decent online presence or weak signals
- 0-19 (NOT_RECOMMENDED): Do not contact — modern site, chain/franchise, permanently closed

§10.2 Key factors:
1. No website or broken/parked website → strongest signal (+++)
2. Outdated / mobile-unfriendly website → strong signal (++)
3. Poor website performance (low health score) → good signal (+)
4. High business rating (4.0+) with 25+ reviews → social proof, ability to pay (+)
5. Phone + email available → ideal dual-channel outreach (+)
6. High-demand industry (dental, legal, spa, fitness, restaurant, etc.) → higher budget (+)
7. Known city + country → enables geo-personalisation (+)
8. Micro / small independent → ideal package size (+)
9. Active on Facebook / Instagram → digitally aware but under-served (+)
10. Weak SEO (missing title/meta/h1/schema) → SEO upsell opportunity (+)
11. No booking system (for service businesses) → booking integration pitch (+)
12. No e-commerce (for retail) → online store opportunity (+)
13. No lead capture form → conversion optimisation upsell (+)
14. High review count + high-value category → estimated strong ability to pay (+)
15. No analytics detected → basic digital literacy gap, extra upsell (+)

§10.3 Recommendation rules:
- contactRecommended: true if score >= 40
- bestServicePitch: match the single biggest gap (new website > redesign > SEO > booking > e-commerce > lead form)
- outreachAngle: must mention the business name and a specific weakness
- suggestedPackage: use tier-based naming (Starter/Growth/Premium/Enterprise)
- estimatedDealSize: based on category + scale (micro=$1k-3k, small=$2k-5k, medium=$4k-10k)
- conversionProbability: higher for CRITICAL leads with contact data (40-60% typical range)
- suggestedNextAction: one of "Call today", "Send cold email", "LinkedIn connect", "Add to nurture sequence", "Do not contact"`;

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

function buildAuditSignalLines(input: AiScoreLeadInput["lead"]): string[] {
  const lines: (string | null)[] = [
    input.websiteClassification
      ? `Website classification: ${input.websiteClassification}`
      : null,
    typeof input.websiteHealthScore === "number"
      ? `Website health score: ${input.websiteHealthScore}/100`
      : null,
    input.hasMobileViewport === false ? "Mobile viewport: missing" : null,
    input.hasSeoBasics === false ? "SEO basics: missing" : null,
    input.hasSchemaMarkup === false ? "Schema markup: missing" : null,
    input.hasAnalytics === false ? "Analytics: not detected" : null,
    input.hasBookingForm === false ? "Online booking: none" : null,
    input.hasLeadCaptureForm === false ? "Lead capture form: none" : null,
  ];
  return lines.filter((l): l is string => l !== null);
}

function buildLeadScorePrompt(input: AiScoreLeadInput["lead"]): string {
  const auditLines = buildAuditSignalLines(input);
  const auditSection = auditLines.map((l) => `  - ${l}`).join("\n");

  const lines = [
    `Business name: ${input.name}`,
    input.category ? `Category: ${input.category}` : null,
    (input.city ?? input.country)
      ? `Location: ${[input.city, input.country].filter(Boolean).join(", ")}`
      : "Location: unknown",
    input.businessScale ? `Business scale: ${input.businessScale}` : null,
    input.website ? `Website: ${input.website}` : "Website: none",
    input.websiteStatus ? `Website status: ${input.websiteStatus}` : null,
    `Contacts: ${getContactStatus(input.phone, input.email)}`,
    getRatingLine(input.rating, input.reviewCount),
    input.score !== null && input.score !== undefined
      ? `Rule-based score: ${input.score}/100`
      : null,
    input.tags?.length ? `Tags: ${input.tags.join(", ")}` : null,
    input.intelSummary ? `Intel summary:\n${input.intelSummary}` : null,
    auditLines.length > 0 ? `\nAudit signals:\n${auditSection}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `Qualify this lead and provide a full sales recommendation:\n\n${lines}`;
}

function clampLeadScore(n: unknown): number {
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

function scoreToTier(s: number): AiScoreLeadResult["tier"] {
  if (s >= 80) return "CRITICAL";
  if (s >= 60) return "HIGH";
  if (s >= 40) return "MEDIUM";
  if (s >= 20) return "LOW";
  return "NOT_RECOMMENDED";
}

const VALID_TIERS = new Set<string>([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "NOT_RECOMMENDED",
]);

function parseAiScoreFields(
  parsed: Record<string, unknown>,
  score: number,
  leadName: string,
): Omit<AiScoreLeadResult, "score" | "tier" | "usage" | "provider" | "model"> {
  const reasoning =
    typeof parsed.reasoning === "string" && parsed.reasoning.trim().length > 0
      ? parsed.reasoning.trim()
      : "Score derived from available lead data.";

  const contactRecommended =
    typeof parsed.contactRecommended === "boolean"
      ? parsed.contactRecommended
      : score >= 40;

  const bestServicePitch =
    typeof parsed.bestServicePitch === "string" &&
    parsed.bestServicePitch.trim()
      ? parsed.bestServicePitch.trim()
      : "Website Review";

  const outreachAngle =
    typeof parsed.outreachAngle === "string" && parsed.outreachAngle.trim()
      ? parsed.outreachAngle.trim()
      : `We noticed ${leadName} may benefit from digital improvements.`;

  const suggestedPackage =
    typeof parsed.suggestedPackage === "string" &&
    parsed.suggestedPackage.trim()
      ? parsed.suggestedPackage.trim()
      : "Starter Package";

  const estimatedDealSize =
    typeof parsed.estimatedDealSize === "string" &&
    parsed.estimatedDealSize.trim()
      ? parsed.estimatedDealSize.trim()
      : "Contact for quote";

  const conversionProbability = clampLeadScore(parsed.conversionProbability);
  const defaultNextAction = contactRecommended
    ? "Send cold email"
    : "Do not contact";
  const suggestedNextAction =
    typeof parsed.suggestedNextAction === "string" &&
    parsed.suggestedNextAction.trim()
      ? parsed.suggestedNextAction.trim()
      : defaultNextAction;

  return {
    reasoning,
    contactRecommended,
    bestServicePitch,
    outreachAngle,
    suggestedPackage,
    estimatedDealSize,
    conversionProbability,
    suggestedNextAction,
  };
}

export async function scoreLeadWithAi(
  args: AiScoreLeadInput,
): Promise<AiScoreLeadResult> {
  const result = await aiComplete({
    taskKind: "lead.score",
    organizationId: args.organizationId,
    temperature: 0.1,
    maxTokens: 500,
    jsonMode: true,
    messages: [
      { role: "system", content: AI_SCORE_SYSTEM },
      { role: "user", content: buildLeadScorePrompt(args.lead) },
    ],
  });

  let parsed: Record<string, unknown> = {};
  try {
    const text = result.text.trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      parsed = JSON.parse(text.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
    }
  } catch {
    // fallback to defaults below
  }

  const score = clampLeadScore(parsed.score);
  const tier =
    typeof parsed.tier === "string" && VALID_TIERS.has(parsed.tier)
      ? (parsed.tier as AiScoreLeadResult["tier"])
      : scoreToTier(score);

  const fields = parseAiScoreFields(parsed, score, args.lead.name);

  return {
    score,
    tier,
    ...fields,
    usage: result.usage,
    provider: result.provider,
    model: result.model,
  };
}

// ---------------------------------------------------------------------------
// §9.3 — Website Audit AI Report
// ---------------------------------------------------------------------------

/** Structured scores + recommendations generated for a website audit. */
export interface WebsiteAiReport {
  /** 0–100 overall impression. */
  overallScore: number;
  /** UI/UX quality impression 0–100. */
  uiUxScore: number;
  /** SEO fundamentals score 0–100. */
  seoScore: number;
  /** Page performance score 0–100. */
  performanceScore: number;
  /** Mobile-friendliness score 0–100. */
  mobileScore: number;
  /** Trust signals score 0–100 (HTTPS, reviews, badges). */
  trustScore: number;
  /** Content quality / completeness score 0–100. */
  contentScore: number;
  /** Top 3–5 problems, ranked by business impact. */
  mainProblems: string[];
  /** One paragraph: how these problems affect the business's bottom line. */
  businessImpact: string;
  /** Prioritised improvement list (most impactful first). */
  recommendedImprovements: string[];
  /** Agency service package name that best fits the lead's needs. */
  suggestedPackage: string;
  /** Ballpark project value range, e.g. "$3,000–$5,000". */
  estimatedProjectValue: string;
  /** 2–3 sentence personalised outreach message to the business owner. */
  outreachMessage: string;
}

export interface AiWebsiteAuditInput {
  organizationId: string;
  lead: {
    name: string;
    category?: string | null;
    city?: string | null;
    country?: string | null;
    website?: string | null;
    rating?: number | null;
    reviewCount?: number | null;
  };
  auditIssues: string[];
  auditCategories: Record<
    string,
    { status: "pass" | "warn" | "fail"; findings: string[] }
  >;
  healthScore: number;
  websiteClassification: string;
}

const AI_WEBSITE_AUDIT_SYSTEM = `You are a web design agency consultant who evaluates small-business websites.
Given technical audit signals about a website, produce a concise, client-friendly JSON analysis.

Return ONLY valid JSON with these exact keys:
{
  "overallScore": <integer 0-100>,
  "uiUxScore": <integer 0-100>,
  "seoScore": <integer 0-100>,
  "performanceScore": <integer 0-100>,
  "mobileScore": <integer 0-100>,
  "trustScore": <integer 0-100>,
  "contentScore": <integer 0-100>,
  "mainProblems": [<string>, ...],
  "businessImpact": "<string>",
  "recommendedImprovements": [<string>, ...],
  "suggestedPackage": "<string>",
  "estimatedProjectValue": "<string>",
  "outreachMessage": "<string>"
}

Guidelines:
- overallScore = weighted average of sub-scores
- mainProblems: top 3-5 issues, short phrases (under 10 words each)
- businessImpact: 2-3 sentences; focus on lost revenue / customers
- recommendedImprovements: 4-6 items, most impactful first
- suggestedPackage: e.g. "Website Redesign + SEO", "Mobile Optimisation + Speed", "Local SEO + Google Maps"
- estimatedProjectValue: realistic range like "$2,500–$4,500"
- outreachMessage: personalised, empathetic, avoid being pushy; mention the business name`;

function getRatingLineFull(
  rating?: number | null,
  reviewCount?: number | null,
): string | null {
  if (rating == null) return null;
  const suffix = reviewCount == null ? "" : ` (${reviewCount} reviews)`;
  return `Rating: ${rating.toFixed(1)}${suffix}`;
}

function buildWebsiteAuditPrompt(input: AiWebsiteAuditInput): string {
  const {
    lead,
    auditIssues,
    auditCategories,
    healthScore,
    websiteClassification,
  } = input;

  const categoryLines = Object.entries(auditCategories)
    .map(([name, cat]) => {
      const findingStr =
        cat.findings.length > 0 ? ` → ${cat.findings.join("; ")}` : "";
      return `  ${name}: ${cat.status}${findingStr}`;
    })
    .join("\n");

  const issueList =
    auditIssues.length > 0
      ? auditIssues.slice(0, 12).join("\n  - ")
      : "none detected";

  const lines = [
    `Business name: ${lead.name}`,
    lead.category ? `Category: ${lead.category}` : null,
    (lead.city ?? lead.country)
      ? `Location: ${[lead.city, lead.country].filter(Boolean).join(", ")}`
      : null,
    lead.website ? `Website: ${lead.website}` : "Website: unknown",
    `Overall health score: ${healthScore}/100`,
    `Classification: ${websiteClassification}`,
    getRatingLineFull(lead.rating, lead.reviewCount),
    `\nAudit categories:\n${categoryLines}`,
    `\nDetected issues:\n  - ${issueList}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `Analyse this small business website and provide improvement recommendations:\n\n${lines}`;
}

function clampAuditScore(n: unknown): number {
  const v = typeof n === "number" ? n : Number.parseFloat(String(n));
  if (Number.isNaN(v)) return 50;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export async function auditWebsiteWithAi(args: AiWebsiteAuditInput): Promise<{
  report: WebsiteAiReport;
  usage: AiUsage;
  provider: string;
  model: string;
}> {
  const result = await aiComplete({
    taskKind: "website.audit",
    organizationId: args.organizationId,
    temperature: 0.2,
    maxTokens: 800,
    jsonMode: true,
    messages: [
      { role: "system", content: AI_WEBSITE_AUDIT_SYSTEM },
      { role: "user", content: buildWebsiteAuditPrompt(args) },
    ],
  });

  let parsed: Record<string, unknown> = {};
  try {
    const text = result.text.trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      parsed = JSON.parse(text.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
    }
  } catch {
    // fallback to defaults below
  }

  const toStrArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const report: WebsiteAiReport = {
    overallScore: clampAuditScore(parsed.overallScore),
    uiUxScore: clampAuditScore(parsed.uiUxScore),
    seoScore: clampAuditScore(parsed.seoScore),
    performanceScore: clampAuditScore(parsed.performanceScore),
    mobileScore: clampAuditScore(parsed.mobileScore),
    trustScore: clampAuditScore(parsed.trustScore),
    contentScore: clampAuditScore(parsed.contentScore),
    mainProblems: toStrArr(parsed.mainProblems),
    businessImpact:
      typeof parsed.businessImpact === "string"
        ? parsed.businessImpact.trim()
        : "No business impact analysis available.",
    recommendedImprovements: toStrArr(parsed.recommendedImprovements),
    suggestedPackage:
      typeof parsed.suggestedPackage === "string"
        ? parsed.suggestedPackage.trim()
        : "Website Review",
    estimatedProjectValue:
      typeof parsed.estimatedProjectValue === "string"
        ? parsed.estimatedProjectValue.trim()
        : "Contact for quote",
    outreachMessage:
      typeof parsed.outreachMessage === "string"
        ? parsed.outreachMessage.trim()
        : `We noticed ${args.lead.name}'s website has room for improvement. We'd love to help you attract more customers online.`,
  };

  return {
    report,
    usage: result.usage,
    provider: result.provider,
    model: result.model,
  };
}

/* -------------------------------------------------------------------------- */
/* Vibe Prospecting — Claude-powered full lead analysis + outreach generation  */
/* -------------------------------------------------------------------------- */

export interface VibeProspectInput {
  organizationId: string;
  lead: {
    name: string;
    category?: string | null;
    city?: string | null;
    country?: string | null;
    website?: string | null;
    phone?: string | null;
    email?: string | null;
    rating?: number | null;
    reviewCount?: number | null;
    websiteStatus?: string | null;
    websiteHealthScore?: number | null;
    websiteClassification?: string | null;
    hasBookingForm?: boolean | null;
    hasSeoBasics?: boolean | null;
    hasAnalytics?: boolean | null;
    hasLeadCaptureForm?: boolean | null;
    hasContactForm?: boolean | null;
    hasSchemaMarkup?: boolean | null;
    isMobileReady?: boolean | null;
    facebookUrl?: string | null;
    instagramUrl?: string | null;
    techStack?: string[] | null;
    digitalPresenceScore?: number | null;
    businessScale?: string | null;
    source?: string | null;
    intelSummary?: string | null;
  };
  /** Optional name/pitch of the agency running the prospecting. */
  agencyName?: string | null;
}

export interface VibeProspectResult {
  /** 0–100 AI vibe score. */
  leadScore: number;
  /** Whether the AI recommends contacting this lead. */
  shouldContact: boolean;
  /** Short description of the business's digital vibe. */
  vibe: string;
  /** Detected business pain points. */
  painPoints: string[];
  /** Recommended primary service. */
  recommendedService: string;
  /** Recommended package name (Starter / Growth / Premium / Enterprise). */
  recommendedPackage: string;
  /** One-sentence strongest hook / outreach angle. */
  outreachAngle: string;
  /** Estimated deal size range, e.g. '$3,000–$7,000'. */
  estimatedDealSize: string;
  /** 0–100 estimated probability of conversion. */
  conversionProbability: number;
  /** Suggested immediate next action. */
  nextAction: string;
  /** Personalised cold email ready to send. */
  coldEmail: string;
  /** Personalised WhatsApp message (short, conversational). */
  whatsappMessage: string;
  /** 60-second call script opening. */
  callScript: string;
  /** Short follow-up message for day 3–5. */
  followUpMessage: string;
  usage: AiCompleteResult["usage"];
  provider: AiCompleteResult["provider"];
  model: AiCompleteResult["model"];
}

const VIBE_SYSTEM = `You are an expert B2B sales consultant helping a digital agency identify high-value small business prospects.
Analyse the provided business lead data and return a full vibe prospecting analysis.

Respond ONLY with valid JSON matching this exact shape (no markdown, no prose outside the object):
{
  "leadScore": <integer 0-100>,
  "shouldContact": <true|false — true if score >= 40 and the business is a realistic prospect>,
  "vibe": "<one sentence: the business's digital presence vibe, e.g. 'Established local restaurant with zero online booking and an outdated mobile site'>",
  "painPoints": ["<pain point 1>", "<pain point 2>", ...up to 6],
  "recommendedService": "<primary service, e.g. 'Website Redesign + Local SEO'>",
  "recommendedPackage": "<package tier: Starter | Growth | Premium | Enterprise>",
  "outreachAngle": "<one sentence: the single strongest hook — what specific problem will you solve for them>",
  "estimatedDealSize": "<realistic price range based on package tier, e.g. '$3,000–$7,000'>",
  "conversionProbability": <integer 0-100 — likelihood this lead converts to a paying client>,
  "nextAction": "<specific recommended immediate next step, e.g. 'Send cold email today, follow up on WhatsApp in 3 days if no reply'>",
  "coldEmail": "<full personalised cold email, subject line first on its own line prefixed 'Subject: ', then body; 100-150 words; polite, not pushy>",
  "whatsappMessage": "<50-80 word conversational WhatsApp intro; friendly tone; end with a question>",
  "callScript": "<60-second call opener script; 80-120 words; include a hook, value prop, and one open question>",
  "followUpMessage": "<50-70 word polite follow-up for 3-5 days after first contact>"
}

Scoring guide — consider ALL of these factors:
- No website or completely broken → +25
- Outdated / low health score (<50) → +15
- Poor mobile readiness → +10
- High-demand category (dental, legal, medical, spa, fitness, restaurant, hotel) → +15
- High rating (4.0+) + high review count (100+) → +10 (ability and social proof to pay)
- Contact details available (phone + email) → +5
- Active social media presence (has Facebook/Instagram) → -5 (already digital)
- Weak SEO (missing title, meta, schema markup) → +10
- Missing online booking for bookable business → +10
- Missing e-commerce for retail/product business → +10
- Missing lead capture / contact form → +8
- Low digital presence score (<40) → +10
- Business location (high-income area → higher priority) → ±5
- Business size (micro/small with revenue potential → higher; enterprise already has agency) → ±5
- Estimated ability to pay: derive from scale + category + rating signals

Score categories:
- 80–100: High-priority lead — contact immediately
- 60–79: Good lead — worth pursuing
- 40–59: Medium-priority — nurture
- 20–39: Low-priority — low urgency
- 0–19: Not recommended — skip

Package tiers:
- Starter ($1,000–$3,000): simple site, basic SEO
- Growth ($3,000–$7,000): full redesign, SEO, booking or lead form
- Premium ($7,000–$15,000): advanced features, e-commerce, automation
- Enterprise ($15,000+): custom solutions, multiple integrations

Rules:
- Always mention the business name in emails and messages
- Reference at least one specific pain point in each message
- Keep outreach polite, personalised, and non-spammy
- Never fabricate contact details or prices the data doesn't support
- callScript must start naturally: "Hi, is this [Name]? …"
- conversionProbability should reflect real sales realism (rarely above 70 unless very strong signals)`;

function buildVibePrompt(input: VibeProspectInput): string {
  const { lead, agencyName } = input;

  // Detect e-commerce signals from tech stack
  const ecommerceKeywords = [
    "shopify",
    "woocommerce",
    "magento",
    "bigcommerce",
    "opencart",
  ];
  const hasEcommerce = lead.techStack
    ? lead.techStack.some((t) =>
        ecommerceKeywords.some((k) => t.toLowerCase().includes(k)),
      )
    : null;

  const lines = [
    `Business name: ${lead.name}`,
    lead.category ? `Category: ${lead.category}` : null,
    [lead.city, lead.country].filter(Boolean).length
      ? `Location: ${[lead.city, lead.country].filter(Boolean).join(", ")}`
      : "Location: unknown",
    lead.website ? `Website: ${lead.website}` : "Website: NONE",
    lead.websiteClassification
      ? `Website classification: ${lead.websiteClassification}`
      : null,
    lead.websiteStatus ? `Website status: ${lead.websiteStatus}` : null,
    typeof lead.websiteHealthScore === "number"
      ? `Website health score: ${lead.websiteHealthScore}/100`
      : null,
    lead.isMobileReady === false
      ? "Mobile readiness: NOT mobile-ready"
      : lead.isMobileReady === true
        ? "Mobile readiness: mobile-ready"
        : null,
    lead.phone ? `Phone: available` : "Phone: not available",
    lead.email ? `Email: available` : "Email: not available",
    typeof lead.rating === "number"
      ? `Rating: ${lead.rating.toFixed(1)} (${lead.reviewCount ?? 0} reviews)`
      : "Rating: unknown",
    lead.businessScale ? `Business scale: ${lead.businessScale}` : null,
    typeof lead.digitalPresenceScore === "number"
      ? `Digital presence score: ${lead.digitalPresenceScore}/100`
      : null,
    // Social presence
    lead.facebookUrl ? `Facebook: active page` : "Facebook: none",
    lead.instagramUrl ? `Instagram: active account` : "Instagram: none",
    // Website feature signals
    lead.hasBookingForm === false ? "Online booking: MISSING" : null,
    lead.hasLeadCaptureForm === false ? "Lead capture form: MISSING" : null,
    lead.hasContactForm === false ? "Contact form: MISSING" : null,
    lead.hasSeoBasics === false ? "SEO basics (title/meta): MISSING" : null,
    lead.hasSchemaMarkup === false ? "Schema markup: MISSING" : null,
    lead.hasAnalytics === false ? "Web analytics: not detected" : null,
    hasEcommerce === false ? "E-commerce: NONE detected" : null,
    hasEcommerce === true ? "E-commerce: present" : null,
    lead.techStack?.length
      ? `Tech stack: ${lead.techStack.slice(0, 8).join(", ")}`
      : null,
    lead.source ? `Lead source: ${lead.source}` : null,
    lead.intelSummary ? `Intel summary: ${lead.intelSummary}` : null,
    agencyName ? `\nAgency name (use in outreach): ${agencyName}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `Analyse this business lead and generate a complete vibe prospecting package:\n\n${lines}`;
}

function parseVibeJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  const raw = match ? match[0] : text;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function vibeProspectLead(
  args: VibeProspectInput,
): Promise<VibeProspectResult> {
  const result = await aiComplete({
    taskKind: "vibe.prospect",
    organizationId: args.organizationId,
    temperature: 0.5,
    maxTokens: 1200,
    jsonMode: true,
    messages: [
      { role: "system", content: VIBE_SYSTEM },
      { role: "user", content: buildVibePrompt(args) },
    ],
  });

  const parsed = parseVibeJson(result.text);
  const toStrArr = (v: unknown, max = 8): string[] =>
    Array.isArray(v)
      ? v
          .filter(
            (x): x is string => typeof x === "string" && x.trim().length > 0,
          )
          .slice(0, max)
          .map((s) => s.trim())
      : [];

  const leadScore = clampLeadScore(parsed.leadScore);
  const conversionProbability = clampLeadScore(parsed.conversionProbability);

  return {
    leadScore,
    shouldContact:
      typeof parsed.shouldContact === "boolean"
        ? parsed.shouldContact
        : leadScore >= 40,
    vibe:
      typeof parsed.vibe === "string" && parsed.vibe.trim()
        ? parsed.vibe.trim()
        : "Business detected with limited digital presence data.",
    painPoints: toStrArr(parsed.painPoints),
    recommendedService:
      typeof parsed.recommendedService === "string" &&
      parsed.recommendedService.trim()
        ? parsed.recommendedService.trim()
        : "Website Review",
    recommendedPackage:
      typeof parsed.recommendedPackage === "string" &&
      parsed.recommendedPackage.trim()
        ? parsed.recommendedPackage.trim()
        : "Starter",
    outreachAngle:
      typeof parsed.outreachAngle === "string" && parsed.outreachAngle.trim()
        ? parsed.outreachAngle.trim()
        : "Help improve their digital presence and attract more customers.",
    estimatedDealSize:
      typeof parsed.estimatedDealSize === "string" &&
      parsed.estimatedDealSize.trim()
        ? parsed.estimatedDealSize.trim()
        : "$1,000–$3,000",
    conversionProbability,
    nextAction:
      typeof parsed.nextAction === "string" && parsed.nextAction.trim()
        ? parsed.nextAction.trim()
        : "Send personalised cold email, follow up in 3–5 days.",
    coldEmail:
      typeof parsed.coldEmail === "string" && parsed.coldEmail.trim()
        ? parsed.coldEmail.trim()
        : `Subject: Quick question about ${args.lead.name}'s online presence\n\nHi,\n\nI came across ${args.lead.name} and wanted to reach out about how we could help boost your online visibility.\n\nWould you be open to a quick 10-minute call?`,
    whatsappMessage:
      typeof parsed.whatsappMessage === "string" &&
      parsed.whatsappMessage.trim()
        ? parsed.whatsappMessage.trim()
        : `Hi! I came across ${args.lead.name} and think we could help you get more customers online. Would you be open to a quick chat?`,
    callScript:
      typeof parsed.callScript === "string" && parsed.callScript.trim()
        ? parsed.callScript.trim()
        : `Hi, is this the owner of ${args.lead.name}? Great! I'm reaching out because I noticed your business online and I think we can help you attract more customers. Do you have 2 minutes?`,
    followUpMessage:
      typeof parsed.followUpMessage === "string" &&
      parsed.followUpMessage.trim()
        ? parsed.followUpMessage.trim()
        : `Hi, just following up on my earlier message about ${args.lead.name}. I'd love to share a few ideas that could help your business grow online. Let me know if you're interested!`,
    usage: result.usage,
    provider: result.provider,
    model: result.model,
  };
}

/* -------------------------------------------------------------------------- */
/* §12 CRM — AI Next-Best-Action recommendation                                */
/* -------------------------------------------------------------------------- */

export interface CrmNextActionInput {
  organizationId: string;
  deal: {
    title: string;
    amountCents: number;
    currency: string;
    status: string;
    stageName: string;
    stageProbability: number;
    isWonStage: boolean;
    isLostStage: boolean;
    ownerName?: string | null;
    expectedCloseAt?: string | null;
    followUpAt?: string | null;
    leadName?: string | null;
    leadCategory?: string | null;
    leadWebsite?: string | null;
    leadScore?: number | null;
  };
  /** Last N activities on this deal, newest first. */
  recentActivities: {
    kind: string;
    summary: string;
    occurredAt: string;
    isDone?: boolean;
  }[];
  /** How many open tasks exist. */
  openTaskCount: number;
}

export interface CrmNextActionResult {
  /** Short headline, e.g. "Follow up with a demo offer". */
  headline: string;
  /** 2–4 sentence explanation of why this is the best action. */
  rationale: string;
  /** One concrete action (verb phrase), e.g. "Send the revised proposal today". */
  action: string;
  /** Urgency level. */
  urgency: "NOW" | "THIS_WEEK" | "NEXT_WEEK" | "LOW";
  /** Suggested message template (1–3 sentences) the user can copy. */
  messageTemplate: string;
  usage: AiCompleteResult["usage"];
  provider: AiCompleteResult["provider"];
  model: AiCompleteResult["model"];
}

const NBA_SYSTEM = `You are an expert B2B sales coach advising a sales rep on their next best action for a specific CRM deal.
Analyse the deal stage, recent activity, and context, then return a focused, concrete recommendation.

Respond ONLY with valid JSON (no markdown, no prose outside the object):
{
  "headline": "<8 words or fewer — the key action>",
  "rationale": "<2-4 sentences explaining WHY this is the best move right now>",
  "action": "<one concrete verb phrase the rep can act on immediately>",
  "urgency": "<NOW | THIS_WEEK | NEXT_WEEK | LOW>",
  "messageTemplate": "<1-3 sentence message template the rep can adapt and send>"
}

Guidelines:
- Base urgency on stage progress, days since last activity, and expected close date
- If there have been no activities in >7 days and the deal is open, urgency should be at least THIS_WEEK
- If the deal is in Negotiation or Proposal Sent, urgency is at least THIS_WEEK
- If the deal is at risk of stalling (open tasks, no recent contact), say so in the rationale
- messageTemplate should be personalised to the lead/deal — include their name or deal title
- Never recommend actions that are inappropriate (e.g. calling a lost/do-not-contact lead)
- If the deal is Won or Lost, return a wrap-up action (e.g. "Log project kickoff" or "Send breakup note")
- Keep headline extremely short and action-focused`;

function buildNbaPrompt(input: CrmNextActionInput): string {
  const { deal, recentActivities, openTaskCount } = input;
  const today = new Date().toISOString().split("T")[0];
  const amount = (deal.amountCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: deal.currency,
    maximumFractionDigits: 0,
  });

  const activityLines =
    recentActivities.length === 0
      ? "  (no activity yet)"
      : recentActivities
          .slice(0, 8)
          .map(
            (a) =>
              `  [${a.occurredAt.slice(0, 10)}] ${a.kind}: ${a.summary}${a.isDone === false ? " (open task)" : ""}`,
          )
          .join("\n");

  let dealStatus: string;
  if (deal.isWonStage) {
    dealStatus = "Status: WON";
  } else if (deal.isLostStage) {
    dealStatus = "Status: LOST";
  } else {
    dealStatus = `Status: ${deal.status}`;
  }

  const lines = [
    `Today: ${today}`,
    `Deal: ${deal.title}`,
    `Amount: ${amount}`,
    `Stage: ${deal.stageName} (probability ${deal.stageProbability}%)`,
    dealStatus,
    deal.expectedCloseAt
      ? `Expected close: ${deal.expectedCloseAt.slice(0, 10)}`
      : "Expected close: not set",
    deal.followUpAt
      ? `Next follow-up set: ${deal.followUpAt.slice(0, 10)}`
      : "Follow-up: not scheduled",
    deal.leadName ? `Lead: ${deal.leadName}` : null,
    deal.leadCategory ? `Category: ${deal.leadCategory}` : null,
    deal.leadWebsite ? `Website: ${deal.leadWebsite}` : null,
    typeof deal.leadScore === "number"
      ? `Lead score: ${deal.leadScore}/100`
      : null,
    deal.ownerName ? `Owner: ${deal.ownerName}` : null,
    `Open tasks: ${openTaskCount}`,
    `\nRecent activity (newest first):\n${activityLines}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `Recommend the best next action for this deal:\n\n${lines}`;
}

const VALID_URGENCIES = new Set(["NOW", "THIS_WEEK", "NEXT_WEEK", "LOW"]);

export async function crmNextAction(
  args: CrmNextActionInput,
): Promise<CrmNextActionResult> {
  const result = await aiComplete({
    taskKind: "crm.nextAction",
    organizationId: args.organizationId,
    temperature: 0.3,
    maxTokens: 400,
    jsonMode: true,
    messages: [
      { role: "system", content: NBA_SYSTEM },
      { role: "user", content: buildNbaPrompt(args) },
    ],
  });

  let parsed: Record<string, unknown> = {};
  try {
    const text = result.text.trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      parsed = JSON.parse(text.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
    }
  } catch {
    // fallback below
  }

  const urgencyRaw =
    typeof parsed.urgency === "string"
      ? parsed.urgency.toUpperCase().trim()
      : "";
  const urgency = VALID_URGENCIES.has(urgencyRaw)
    ? (urgencyRaw as CrmNextActionResult["urgency"])
    : "THIS_WEEK";

  return {
    headline:
      typeof parsed.headline === "string" && parsed.headline.trim()
        ? parsed.headline.trim()
        : "Follow up with the prospect",
    rationale:
      typeof parsed.rationale === "string" && parsed.rationale.trim()
        ? parsed.rationale.trim()
        : "No recent activity detected. Following up keeps the deal moving.",
    action:
      typeof parsed.action === "string" && parsed.action.trim()
        ? parsed.action.trim()
        : "Send a follow-up email or call the prospect",
    urgency,
    messageTemplate:
      typeof parsed.messageTemplate === "string" &&
      parsed.messageTemplate.trim()
        ? parsed.messageTemplate.trim()
        : `Hi, just checking in on our conversation about ${args.deal.title}. Are you still interested in moving forward?`,
    usage: result.usage,
    provider: result.provider,
    model: result.model,
  };
}
