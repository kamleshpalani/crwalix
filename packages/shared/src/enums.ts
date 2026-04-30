// Shared enums mirroring the Prisma schema in packages/db.
// Keep in sync with packages/db/prisma/schema.prisma.

export const Role = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Plan = {
  FREE: "FREE",
  STARTER: "STARTER",
  GROWTH: "GROWTH",
  SCALE: "SCALE",
} as const;
export type Plan = (typeof Plan)[keyof typeof Plan];

export const LeadStatus = {
  NEW: "NEW",
  VERIFIED: "VERIFIED",
  CONTACTED: "CONTACTED",
  INTERESTED: "INTERESTED",
  FOLLOW_UP: "FOLLOW_UP",
  NOT_INTERESTED: "NOT_INTERESTED",
  CONVERTED: "CONVERTED",
  CLOSED: "CLOSED",
  // Deprecated, retained so legacy rows still typecheck.
  ENRICHED: "ENRICHED",
  REVIEWED: "REVIEWED",
  EXPORTED: "EXPORTED",
  ARCHIVED: "ARCHIVED",
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

/**
 * Canonical lifecycle states used in the UI status pickers and bulk
 * actions. The four legacy values are excluded from this list so we don't
 * surface them as options; they remain valid in the type for old rows.
 */
export const LEAD_STATUS_LIFECYCLE: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.VERIFIED,
  LeadStatus.CONTACTED,
  LeadStatus.INTERESTED,
  LeadStatus.FOLLOW_UP,
  LeadStatus.NOT_INTERESTED,
  LeadStatus.CONVERTED,
  LeadStatus.CLOSED,
];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New Lead",
  VERIFIED: "Verified",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  FOLLOW_UP: "Follow-up Required",
  NOT_INTERESTED: "Not Interested",
  CONVERTED: "Converted",
  CLOSED: "Closed",
  ENRICHED: "Enriched (legacy)",
  REVIEWED: "Reviewed (legacy)",
  EXPORTED: "Exported (legacy)",
  ARCHIVED: "Archived (legacy)",
};

export const WebsiteStatus = {
  EXISTS: "EXISTS",
  EXISTS_MISSING_IN_SOURCE: "EXISTS_MISSING_IN_SOURCE",
  LIKELY_NONE: "LIKELY_NONE",
  HIGH_CONFIDENCE_NONE: "HIGH_CONFIDENCE_NONE",
  UNKNOWN: "UNKNOWN",
} as const;
export type WebsiteStatus = (typeof WebsiteStatus)[keyof typeof WebsiteStatus];

/**
 * Outcome of the website-validation enrichment. Determines whether a lead
 * with a live website is a redesign-pitch candidate (medium priority) or
 * already has a healthy modern site (low priority).
 *  - FRESH         → modern, recently maintained site → low value lead.
 *  - NEEDS_REVIEW  → live but mediocre signals (some staleness, missing
 *                    mobile viewport, old copyright, etc.). Worth a manual
 *                    look — medium priority.
 *  - OUTDATED      → multiple strong staleness signals → strong candidate
 *                    for a redesign pitch.
 *  - UNREACHABLE   → site URL is dead, parked, or non-resolvable → treat
 *                    like "no website" → high priority.
 *  - NOT_AUDITED   → audit hasn't run yet (default state).
 */
export const WebsiteHealth = {
  FRESH: "FRESH",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  OUTDATED: "OUTDATED",
  UNREACHABLE: "UNREACHABLE",
  NOT_AUDITED: "NOT_AUDITED",
} as const;
export type WebsiteHealth = (typeof WebsiteHealth)[keyof typeof WebsiteHealth];

/**
 * §9.1 — Human-readable classification of the lead's website state.
 * Derived from the website audit result.
 */
export const WebsiteClassification = {
  /** Lead has no website URL on record. */
  NO_WEBSITE: "NO_WEBSITE",
  /** Website was reachable and passes basic health checks. */
  WEBSITE_FOUND: "WEBSITE_FOUND",
  /** Website URL does not resolve or returns no usable response. */
  NOT_LOADING: "NOT_LOADING",
  /** Site is live but has staleness signals (old copyright, old content). */
  OUTDATED: "OUTDATED",
  /** Site is live, fast, mobile-friendly — minimal improvement scope. */
  MODERN: "MODERN",
  /** Multiple structural/UX failures — prime redesign candidate. */
  NEEDS_REDESIGN: "NEEDS_REDESIGN",
  /** HTTPS failure, Flash, broken redirect, or bot-block detected. */
  TECHNICAL_ISSUES: "TECHNICAL_ISSUES",
} as const;
export type WebsiteClassification =
  (typeof WebsiteClassification)[keyof typeof WebsiteClassification];

export const PriorityTier = {
  /** 80–100: High-priority lead — pitch immediately. */
  CRITICAL: "CRITICAL",
  /** 60–79: Good lead — worth a follow-up call. */
  HIGH: "HIGH",
  /** 40–59: Medium-priority lead — add to nurture sequence. */
  MEDIUM: "MEDIUM",
  /** 20–39: Low-priority lead — only if pipeline is empty. */
  LOW: "LOW",
  /** 0–19: Not recommended — do not contact at this time. */
  NOT_RECOMMENDED: "NOT_RECOMMENDED",
} as const;
export type PriorityTier = (typeof PriorityTier)[keyof typeof PriorityTier];

/**
 * Per-search filter that decides which leads the worker actually persists
 * during ingest. Drives the "find prospects without a website" workflow.
 *  - ALL          → keep every lead returned by the provider (default).
 *  - NO_WEBSITE   → only keep leads whose provider record has no website.
 *  - HIGH_OR_MED  → keep no-website + ambiguous-website leads (drops only
 *                   leads that already have a confirmed live website). Use
 *                   this once website-validation enrichment is live so
 *                   "needs redesign" prospects aren't filtered out.
 */
export const LeadFocus = {
  ALL: "ALL",
  NO_WEBSITE: "NO_WEBSITE",
  HIGH_OR_MED: "HIGH_OR_MED",
} as const;
export type LeadFocus = (typeof LeadFocus)[keyof typeof LeadFocus];

export const EnrichmentKind = {
  WEBSITE_VALIDATION: "WEBSITE_VALIDATION",
  EMAIL: "EMAIL",
  EMAIL_VERIFY: "EMAIL_VERIFY",
  SOCIAL: "SOCIAL",
  COMPANY: "COMPANY",
  CONTACT: "CONTACT",
  /** §8.1 — AI-generated business description from lead signals. */
  BUSINESS_DESCRIPTION: "BUSINESS_DESCRIPTION",
  /** §8.1 — AI-generated review summary from rating + review count. */
  REVIEW_SUMMARY: "REVIEW_SUMMARY",
} as const;
export type EnrichmentKind =
  (typeof EnrichmentKind)[keyof typeof EnrichmentKind];

export const EnrichmentStatus = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
  /** §8.2 — Some enrichment steps succeeded, others failed/skipped. */
  PARTIAL: "PARTIAL",
} as const;
export type EnrichmentStatus =
  (typeof EnrichmentStatus)[keyof typeof EnrichmentStatus];

/**
 * §8.2 — Aggregate enrichment lifecycle status on the Lead level.
 * Computed from the set of Enrichment rows for a given lead.
 */
export const LeadEnrichmentStatus = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  PARTIALLY_COMPLETED: "PARTIALLY_COMPLETED",
} as const;
export type LeadEnrichmentStatus =
  (typeof LeadEnrichmentStatus)[keyof typeof LeadEnrichmentStatus];

export const JobStatus = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELED: "CANCELED",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const ExportStatus = {
  QUEUED: "QUEUED",
  BUILDING: "BUILDING",
  READY: "READY",
  FAILED: "FAILED",
} as const;
export type ExportStatus = (typeof ExportStatus)[keyof typeof ExportStatus];

export const ExportFormat = {
  CSV: "CSV",
  XLSX: "XLSX",
  GOOGLE_SHEETS: "GOOGLE_SHEETS",
} as const;
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

// -------- CRM ----------------------------------------------------------------
// Mirror schema.prisma enums for Pipeline/Deal/Activity/Proposal.

export const DealStatus = {
  OPEN: "OPEN",
  WON: "WON",
  LOST: "LOST",
} as const;
export type DealStatus = (typeof DealStatus)[keyof typeof DealStatus];

export const ActivityKind = {
  NOTE: "NOTE",
  EMAIL_OUT: "EMAIL_OUT",
  EMAIL_IN: "EMAIL_IN",
  CALL: "CALL",
  TASK: "TASK",
  STAGE_CHANGE: "STAGE_CHANGE",
  SYSTEM: "SYSTEM",
} as const;
export type ActivityKind = (typeof ActivityKind)[keyof typeof ActivityKind];

export const ProposalStatus = {
  DRAFT: "DRAFT",
  READY: "READY",
  SENT: "SENT",
  VIEWED: "VIEWED",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
} as const;
export type ProposalStatus =
  (typeof ProposalStatus)[keyof typeof ProposalStatus];

export const ProjectStatus = {
  PLANNING: "PLANNING",
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  ARCHIVED: "ARCHIVED",
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const ProjectTaskStatus = {
  TODO: "TODO",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
  BLOCKED: "BLOCKED",
} as const;
export type ProjectTaskStatus =
  (typeof ProjectTaskStatus)[keyof typeof ProjectTaskStatus];

export const BusinessStatus = {
  OPERATIONAL: "OPERATIONAL",
  CLOSED_TEMP: "CLOSED_TEMP",
  CLOSED_PERM: "CLOSED_PERM",
  UNKNOWN: "UNKNOWN",
} as const;
export type BusinessStatus =
  (typeof BusinessStatus)[keyof typeof BusinessStatus];

/**
 * Human-readable priority label + recommended sales action derived from a
 * lead's PriorityTier. Used in the UI (lead list / detail) and exports.
 */
export interface PriorityRecommendation {
  label:
    | "Critical Priority"
    | "High Priority"
    | "Medium Priority"
    | "Low Priority"
    | "Not Recommended"
    | "Unscored";
  action: string;
  /** §10.1 — Score band for this tier. */
  scoreBand: string;
}

export function getPriorityRecommendation(
  tier: PriorityTier | string | null | undefined,
): PriorityRecommendation {
  switch (tier) {
    case PriorityTier.CRITICAL:
      return {
        label: "Critical Priority",
        action: "Contact immediately — pitch new website or full redesign",
        scoreBand: "80–100",
      };
    case PriorityTier.HIGH:
      return {
        label: "High Priority",
        action: "Follow up this week — good fit for redesign or SEO",
        scoreBand: "60–79",
      };
    case PriorityTier.MEDIUM:
      return {
        label: "Medium Priority",
        action: "Add to nurture sequence — pitch improvements",
        scoreBand: "40–59",
      };
    case PriorityTier.LOW:
      return {
        label: "Low Priority",
        action: "Low priority — contact only if pipeline is empty",
        scoreBand: "20–39",
      };
    case PriorityTier.NOT_RECOMMENDED:
      return {
        label: "Not Recommended",
        action:
          "Do not contact — poor fit or already has strong online presence",
        scoreBand: "0–19",
      };
    default:
      return {
        label: "Unscored",
        action: "Awaiting score",
        scoreBand: "N/A",
      };
  }
}

/**
 * Service pitch tags surfaced on a lead. Drives the "what to sell them"
 * column in the dashboard / CSV export. Multiple pitches can apply.
 */
export const ServicePitch = {
  NEW_WEBSITE: "NEW_WEBSITE",
  REDESIGN: "REDESIGN",
  MOBILE_REDESIGN: "MOBILE_REDESIGN",
  SEO: "SEO",
  BOOKING_SYSTEM: "BOOKING_SYSTEM",
  CONTACT_FORM: "CONTACT_FORM",
  SOCIAL_ONLY: "SOCIAL_ONLY",
} as const;
export type ServicePitch = (typeof ServicePitch)[keyof typeof ServicePitch];

export const SERVICE_PITCH_LABELS: Record<ServicePitch, string> = {
  NEW_WEBSITE: "New Website",
  REDESIGN: "Redesign",
  MOBILE_REDESIGN: "Mobile Redesign",
  SEO: "SEO",
  BOOKING_SYSTEM: "Booking System",
  CONTACT_FORM: "Contact Form",
  SOCIAL_ONLY: "Move off social-only",
};

export interface ServicePitchInput {
  priorityTier?: PriorityTier | string | null;
  websiteHealth?: WebsiteHealth | string | null;
  hasWebsite?: boolean;
  hasMobileViewport?: boolean;
  hasContactForm?: boolean;
  hasBookingForm?: boolean;
  hasSeoBasics?: boolean;
  hasFacebook?: boolean;
  hasInstagram?: boolean;
}

/**
 * Derive recommended service pitches from priority + audit signals.
 * Returns ServicePitch values (string codes); use SERVICE_PITCH_LABELS
 * for display text.
 */
export function getServicePitch(input: ServicePitchInput): ServicePitch[] {
  const out: ServicePitch[] = [];
  const tier = input.priorityTier ?? null;
  const health = input.websiteHealth ?? null;
  const noWebsite =
    input.hasWebsite === false || health === WebsiteHealth.UNREACHABLE;

  if (noWebsite) {
    out.push(ServicePitch.NEW_WEBSITE);
    if (input.hasFacebook || input.hasInstagram)
      out.push(ServicePitch.SOCIAL_ONLY);
  } else if (
    tier === PriorityTier.MEDIUM ||
    health === WebsiteHealth.OUTDATED ||
    health === WebsiteHealth.NEEDS_REVIEW
  ) {
    out.push(ServicePitch.REDESIGN);
  }

  if (!noWebsite && input.hasMobileViewport === false) {
    out.push(ServicePitch.MOBILE_REDESIGN);
  }
  if (!noWebsite && input.hasSeoBasics === false) {
    out.push(ServicePitch.SEO);
  }
  if (!noWebsite && input.hasBookingForm === false) {
    out.push(ServicePitch.BOOKING_SYSTEM);
  }
  if (!noWebsite && input.hasContactForm === false) {
    out.push(ServicePitch.CONTACT_FORM);
  }

  // Dedupe while preserving order.
  return Array.from(new Set(out));
}

/**
 * §11 — Business-scale classification. 5-tier model drives sales-team
 * segmentation and scoring adjustments.
 * WHEN TO USE EACH TIER:
 *   MICRO      — sole trader / owner-operated, ≤ 5 staff, local only
 *   SMALL      — independent SME, 6–50 staff, maybe a few locations
 *   MEDIUM     — regional chain / multi-department, 51–250 staff
 *   LARGE      — national or multi-national, 251–999 staff
 *   ENTERPRISE — public company / franchise group, 1000+ staff
 *   UNKNOWN    — insufficient signals to classify
 */
export const BusinessScale = {
  MICRO: "MICRO",
  SMALL: "SMALL",
  MEDIUM: "MEDIUM",
  LARGE: "LARGE",
  ENTERPRISE: "ENTERPRISE",
  UNKNOWN: "UNKNOWN",
} as const;
export type BusinessScale = (typeof BusinessScale)[keyof typeof BusinessScale];

export const BUSINESS_SCALE_LABELS: Record<BusinessScale, string> = {
  MICRO: "Micro business",
  SMALL: "Small business",
  MEDIUM: "Medium business",
  LARGE: "Large business",
  ENTERPRISE: "Enterprise",
  UNKNOWN: "Unclassified",
};

export interface BusinessScaleInput {
  name?: string | null;
  categoryPrimary?: string | null;
  categories?: string[] | null;
  reviewCount?: number | null;
  rating?: number | null;
  /** From website audit. */
  websiteHealthScore?: number | null;
  technologies?: string[] | null;
  hasSeoBasics?: boolean | null;
  hasOgTags?: boolean | null;
  pageBytes?: number | null;
  hasFacebook?: boolean | null;
  hasInstagram?: boolean | null;
  hasWebsite?: boolean | null;
  /** LinkedIn employee-count band, when known (e.g. "11-50", "1001-5000"). */
  linkedinEmployeeRange?: string | null;
  /** §11 — Number of physical locations / branches. */
  locationCount?: number | null;
  /** §11 — Publicly available revenue band string (e.g. "$1M–$10M"). */
  revenueEstimate?: string | null;
  /** §11 — Estimated headcount from public sources; takes precedence over linkedinEmployeeRange. */
  employeeEstimate?: number | null;
}

export interface BusinessScaleSignal {
  signal: string;
  weight: number;
  scale: Exclude<BusinessScale, "UNKNOWN">;
}

export interface BusinessScaleResult {
  scale: BusinessScale;
  /** 0–100 — relative gap between top & runner-up, capped. */
  confidence: number;
  signals: BusinessScaleSignal[];
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type ScaleTier = Exclude<BusinessScale, "UNKNOWN">;
type BucketMap = Record<ScaleTier, number>;

// ---------------------------------------------------------------------------
// Keyword lists — checked against name + categories haystack
// ---------------------------------------------------------------------------

const ENTERPRISE_KEYWORDS = [
  "multinational",
  "conglomerate",
  "plc",
  "publicly traded",
  "stock exchange",
  "airline",
  "telecommunications",
  "telecom",
  "pharmaceuticals",
  "pharmaceutical",
  "oil & gas",
  "utilities",
  "central bank",
  "investment bank",
  "international",
  "global",
];

const LARGE_KEYWORDS = [
  "corporation",
  "corp",
  "enterprises",
  "industries",
  "group",
  "holdings",
  "manufacturing",
  "manufacturer",
  "factory",
  "plant",
  "logistics",
  "wholesale",
  "distributor",
  "hospital",
  "university",
  "bank",
  "insurance",
];

const MEDIUM_KEYWORDS = [
  "agency",
  "firm",
  "consulting",
  "consultancy",
  "clinic",
  "dental group",
  "law firm",
  "medical center",
  "real estate",
  "dealership",
  "showroom",
  "academy",
  "training center",
  "fitness center",
];

const SMALL_KEYWORDS = [
  "boutique",
  "salon",
  "barber",
  "cafe",
  "café",
  "coffee shop",
  "bistro",
  "studio",
  "tailor",
  "florist",
  "bakery",
  "bakeshop",
  "spa",
  "pet groomer",
  "tutor",
  "auto repair",
  "tattoo",
  "nail",
  "restaurant",
  "pizzeria",
  "food truck",
  "photographer",
  "videographer",
];

const MICRO_KEYWORDS = [
  "sole trader",
  "self-employed",
  "home-based",
  "owner-operated",
  "freelance",
  "mobile service",
  "one man",
  "one woman",
  "independent contractor",
];

/** Enterprise CMS / platform tech that signals a large-budget operation. */
const ENTERPRISE_TECH = new Set([
  "sitecore",
  "adobe experience",
  "oracle",
  "sap",
  "salesforce cms",
  "drupal",
]);

// ---------------------------------------------------------------------------
// bandSize — parse "11-50" → 30 (midpoint) or "5000+" → 5000
// ---------------------------------------------------------------------------
function bandSize(range: string | null | undefined): number | null {
  if (!range) return null;
  const clean = String(range).replaceAll(/[, ]/g, "");
  const rangeMatch = /(\d+)[-–](\d+)/.exec(clean);
  if (rangeMatch)
    return Math.round((Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2);
  const singleMatch = /(\d+)\+?/.exec(clean);
  return singleMatch ? Number(singleMatch[1]) : null;
}

// ---------------------------------------------------------------------------
// parseRevenueMillions — "$1M–$10M" → 10, "$500K" → 0.5, "$2B" → 2000
// ---------------------------------------------------------------------------
function parseRevenueMillions(
  estimate: string | null | undefined,
): number | null {
  if (!estimate) return null;
  const pattern = /(\d+(?:\.\d+)?)\s*([KMBkmb]?)/g;
  const values: number[] = [];
  let m = pattern.exec(estimate);
  while (m !== null) {
    const v = Number(m[1]);
    const unit = m[2].toUpperCase();
    if (unit === "K") values.push(v / 1000);
    else if (unit === "B") values.push(v * 1000);
    else values.push(v);
    m = pattern.exec(estimate);
  }
  return values.length > 0 ? Math.max(...values) : null;
}

// ---------------------------------------------------------------------------
// Signal scorers — each mutates buckets + signals in-place
// ---------------------------------------------------------------------------

function scoreFromKeywords(
  hay: string,
  buckets: BucketMap,
  signals: BusinessScaleSignal[],
): void {
  const push = (scale: ScaleTier, weight: number, signal: string) => {
    buckets[scale] += weight;
    signals.push({ scale, weight, signal });
  };
  if (ENTERPRISE_KEYWORDS.some((k) => hay.includes(k)))
    push("ENTERPRISE", 25, "name/category implies enterprise scale");
  if (LARGE_KEYWORDS.some((k) => hay.includes(k)))
    push("LARGE", 20, "name/category implies large business");
  if (MEDIUM_KEYWORDS.some((k) => hay.includes(k)))
    push("MEDIUM", 18, "category implies mid-size firm");
  if (SMALL_KEYWORDS.some((k) => hay.includes(k)))
    push("SMALL", 18, "category implies small/independent business");
  if (MICRO_KEYWORDS.some((k) => hay.includes(k)))
    push("MICRO", 20, "name/category implies micro/sole-trader");
}

function scoreFromReviews(
  reviews: number,
  buckets: BucketMap,
  signals: BusinessScaleSignal[],
): void {
  const push = (scale: ScaleTier, weight: number, signal: string) => {
    buckets[scale] += weight;
    signals.push({ scale, weight, signal });
  };
  if (reviews >= 5000)
    push("ENTERPRISE", 20, `${reviews} reviews — household-name scale`);
  else if (reviews >= 1000)
    push("LARGE", 15, `${reviews} reviews — major footprint`);
  else if (reviews >= 300)
    push("MEDIUM", 12, `${reviews} reviews — established footprint`);
  else if (reviews >= 50) push("SMALL", 10, `${reviews} reviews`);
  else if (reviews >= 10)
    push("SMALL", 8, `${reviews} reviews — growing presence`);
  else if (reviews > 0) push("MICRO", 12, `only ${reviews} reviews`);
  else push("MICRO", 10, "no review history");
}

function scoreFromHeadcount(
  headcount: number | null,
  rangeLabel: string,
  buckets: BucketMap,
  signals: BusinessScaleSignal[],
): void {
  if (headcount === null) return;
  const push = (scale: ScaleTier, weight: number, signal: string) => {
    buckets[scale] += weight;
    signals.push({ scale, weight, signal });
  };
  if (headcount >= 1000) push("ENTERPRISE", 30, `${rangeLabel} employees`);
  else if (headcount >= 201) push("LARGE", 25, `${rangeLabel} employees`);
  else if (headcount >= 21) push("MEDIUM", 20, `${rangeLabel} employees`);
  else if (headcount >= 3) push("SMALL", 20, `${rangeLabel} employees`);
  else push("MICRO", 20, `${rangeLabel} employees — micro team`);
}

function scoreFromLocations(
  locationCount: number | null | undefined,
  buckets: BucketMap,
  signals: BusinessScaleSignal[],
): void {
  if (!locationCount) return;
  const push = (scale: ScaleTier, weight: number, signal: string) => {
    buckets[scale] += weight;
    signals.push({ scale, weight, signal });
  };
  if (locationCount >= 21) push("ENTERPRISE", 20, `${locationCount} locations`);
  else if (locationCount >= 6) push("LARGE", 15, `${locationCount} locations`);
  else if (locationCount >= 2) push("MEDIUM", 10, `${locationCount} locations`);
  else push("SMALL", 8, "single location");
}

function scoreFromRevenue(
  revenueEstimate: string | null | undefined,
  buckets: BucketMap,
  signals: BusinessScaleSignal[],
): void {
  const revM = parseRevenueMillions(revenueEstimate);
  if (revM === null) return;
  const push = (scale: ScaleTier, weight: number, signal: string) => {
    buckets[scale] += weight;
    signals.push({ scale, weight, signal });
  };
  if (revM >= 500) push("ENTERPRISE", 20, `revenue ~${revenueEstimate}`);
  else if (revM >= 50) push("LARGE", 15, `revenue ~${revenueEstimate}`);
  else if (revM >= 5) push("MEDIUM", 12, `revenue ~${revenueEstimate}`);
  else if (revM >= 0.5) push("SMALL", 12, `revenue ~${revenueEstimate}`);
  else push("MICRO", 15, `revenue ~${revenueEstimate}`);
}

function scoreFromWebsite(
  input: BusinessScaleInput,
  buckets: BucketMap,
  signals: BusinessScaleSignal[],
): void {
  const push = (scale: ScaleTier, weight: number, signal: string) => {
    buckets[scale] += weight;
    signals.push({ scale, weight, signal });
  };
  const tech = new Set((input.technologies ?? []).map((t) => t.toLowerCase()));
  const score = input.websiteHealthScore ?? null;

  if (input.hasWebsite === false) push("MICRO", 10, "no website on file");

  const onlySocial =
    input.hasWebsite === false &&
    (input.hasFacebook === true || input.hasInstagram === true);
  if (onlySocial) push("MICRO", 12, "social-only online presence");

  if ([...tech].some((t) => ENTERPRISE_TECH.has(t)))
    push("LARGE", 10, "enterprise CMS detected");
  if (tech.has("nextjs") || tech.has("react"))
    push("MEDIUM", 8, "modern JS framework");
  if (tech.has("shopify")) push("SMALL", 5, "Shopify store");
  if (tech.has("wix") || tech.has("squarespace") || tech.has("webflow"))
    push("SMALL", 8, "hosted site builder");
  if (tech.has("wordpress")) push("SMALL", 6, "WordPress site");
  if (tech.has("legacy-jquery") || tech.has("html-frames") || tech.has("flash"))
    push("SMALL", 5, "legacy front-end stack");
  if (score !== null && score >= 85 && (input.hasSeoBasics ?? false))
    push("MEDIUM", 6, `polished website (health ${score})`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * §11 — Classify a lead into one of five business-scale tiers based on
 * publicly observable signals: reviews, headcount, locations, revenue,
 * website technology, and category keywords.
 */
export function classifyBusinessScale(
  input: BusinessScaleInput,
): BusinessScaleResult {
  const buckets: BucketMap = {
    MICRO: 0,
    SMALL: 0,
    MEDIUM: 0,
    LARGE: 0,
    ENTERPRISE: 0,
  };
  const signals: BusinessScaleSignal[] = [];

  const hay = [
    input.name ?? "",
    input.categoryPrimary ?? "",
    ...(input.categories ?? []),
  ]
    .join(" | ")
    .toLowerCase();

  scoreFromKeywords(hay, buckets, signals);
  scoreFromReviews(input.reviewCount ?? 0, buckets, signals);

  // Prefer explicit employeeEstimate; fall back to linkedinEmployeeRange.
  const headcount =
    input.employeeEstimate ?? bandSize(input.linkedinEmployeeRange);
  const rangeLabel =
    input.employeeEstimate !== null && input.employeeEstimate !== undefined
      ? String(input.employeeEstimate)
      : (input.linkedinEmployeeRange ?? "");
  scoreFromHeadcount(headcount, rangeLabel, buckets, signals);

  scoreFromLocations(input.locationCount, buckets, signals);
  scoreFromRevenue(input.revenueEstimate, buckets, signals);
  scoreFromWebsite(input, buckets, signals);

  const ordered = (Object.entries(buckets) as Array<[ScaleTier, number]>).sort(
    (a, b) => b[1] - a[1],
  );
  const [topScale, topScore] = ordered[0];
  const [, second] = ordered[1] ?? (["MICRO", 0] as [ScaleTier, number]);

  if (topScore < 15) {
    return {
      scale: BusinessScale.UNKNOWN,
      confidence: 0,
      signals,
      reasoning: "Not enough public signals to classify.",
    };
  }

  const confidence = Math.max(
    0,
    Math.min(100, Math.round((topScore - second) * 5 + 30)),
  );
  const topSignals = signals
    .filter((s) => s.scale === topScale)
    .slice(0, 3)
    .map((s) => s.signal)
    .join("; ");

  return {
    scale: topScale,
    confidence,
    signals,
    reasoning:
      topSignals ||
      `${BUSINESS_SCALE_LABELS[topScale]} based on combined signals.`,
  };
}
