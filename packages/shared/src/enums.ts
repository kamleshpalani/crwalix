// Shared enums mirroring the Prisma schema in packages/db.
// Keep in sync with packages/db/prisma/schema.prisma.

export const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Plan = {
  FREE: 'FREE',
  STARTER: 'STARTER',
  GROWTH: 'GROWTH',
  SCALE: 'SCALE',
} as const;
export type Plan = (typeof Plan)[keyof typeof Plan];

export const LeadStatus = {
  NEW: 'NEW',
  VERIFIED: 'VERIFIED',
  CONTACTED: 'CONTACTED',
  INTERESTED: 'INTERESTED',
  FOLLOW_UP: 'FOLLOW_UP',
  NOT_INTERESTED: 'NOT_INTERESTED',
  CONVERTED: 'CONVERTED',
  CLOSED: 'CLOSED',
  // Deprecated, retained so legacy rows still typecheck.
  ENRICHED: 'ENRICHED',
  REVIEWED: 'REVIEWED',
  EXPORTED: 'EXPORTED',
  ARCHIVED: 'ARCHIVED',
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
  NEW: 'New Lead',
  VERIFIED: 'Verified',
  CONTACTED: 'Contacted',
  INTERESTED: 'Interested',
  FOLLOW_UP: 'Follow-up Required',
  NOT_INTERESTED: 'Not Interested',
  CONVERTED: 'Converted',
  CLOSED: 'Closed',
  ENRICHED: 'Enriched (legacy)',
  REVIEWED: 'Reviewed (legacy)',
  EXPORTED: 'Exported (legacy)',
  ARCHIVED: 'Archived (legacy)',
};

export const WebsiteStatus = {
  EXISTS: 'EXISTS',
  EXISTS_MISSING_IN_SOURCE: 'EXISTS_MISSING_IN_SOURCE',
  LIKELY_NONE: 'LIKELY_NONE',
  HIGH_CONFIDENCE_NONE: 'HIGH_CONFIDENCE_NONE',
  UNKNOWN: 'UNKNOWN',
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
  FRESH: 'FRESH',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  OUTDATED: 'OUTDATED',
  UNREACHABLE: 'UNREACHABLE',
  NOT_AUDITED: 'NOT_AUDITED',
} as const;
export type WebsiteHealth = (typeof WebsiteHealth)[keyof typeof WebsiteHealth];

export const PriorityTier = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
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
  ALL: 'ALL',
  NO_WEBSITE: 'NO_WEBSITE',
  HIGH_OR_MED: 'HIGH_OR_MED',
} as const;
export type LeadFocus = (typeof LeadFocus)[keyof typeof LeadFocus];

export const EnrichmentKind = {
  WEBSITE_VALIDATION: 'WEBSITE_VALIDATION',
  EMAIL: 'EMAIL',
  EMAIL_VERIFY: 'EMAIL_VERIFY',
  SOCIAL: 'SOCIAL',
  COMPANY: 'COMPANY',
  CONTACT: 'CONTACT',
} as const;
export type EnrichmentKind = (typeof EnrichmentKind)[keyof typeof EnrichmentKind];

export const EnrichmentStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;
export type EnrichmentStatus = (typeof EnrichmentStatus)[keyof typeof EnrichmentStatus];

export const JobStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const ExportStatus = {
  QUEUED: 'QUEUED',
  BUILDING: 'BUILDING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;
export type ExportStatus = (typeof ExportStatus)[keyof typeof ExportStatus];

export const ExportFormat = {
  CSV: 'CSV',
  XLSX: 'XLSX',
  GOOGLE_SHEETS: 'GOOGLE_SHEETS',
} as const;
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

export const BusinessStatus = {
  OPERATIONAL: 'OPERATIONAL',
  CLOSED_TEMP: 'CLOSED_TEMP',
  CLOSED_PERM: 'CLOSED_PERM',
  UNKNOWN: 'UNKNOWN',
} as const;
export type BusinessStatus = (typeof BusinessStatus)[keyof typeof BusinessStatus];

/**
 * Human-readable priority label + recommended sales action derived from a
 * lead's PriorityTier. Used in the UI (lead list / detail) and exports.
 */
export interface PriorityRecommendation {
  label: 'No Website' | 'Website Needs Improvement' | 'Proper Website' | 'Unscored';
  action: string;
}

export function getPriorityRecommendation(
  tier: PriorityTier | string | null | undefined
): PriorityRecommendation {
  switch (tier) {
    case PriorityTier.HIGH:
      return { label: 'No Website', action: 'Pitch new website package' };
    case PriorityTier.MEDIUM:
      return { label: 'Website Needs Improvement', action: 'Pitch redesign / modernization' };
    case PriorityTier.LOW:
      return { label: 'Proper Website', action: 'Low priority — nurture later' };
    default:
      return { label: 'Unscored', action: 'Awaiting score' };
  }
}

/**
 * Service pitch tags surfaced on a lead. Drives the "what to sell them"
 * column in the dashboard / CSV export. Multiple pitches can apply.
 */
export const ServicePitch = {
  NEW_WEBSITE: 'NEW_WEBSITE',
  REDESIGN: 'REDESIGN',
  MOBILE_REDESIGN: 'MOBILE_REDESIGN',
  SEO: 'SEO',
  BOOKING_SYSTEM: 'BOOKING_SYSTEM',
  CONTACT_FORM: 'CONTACT_FORM',
  SOCIAL_ONLY: 'SOCIAL_ONLY',
} as const;
export type ServicePitch = (typeof ServicePitch)[keyof typeof ServicePitch];

export const SERVICE_PITCH_LABELS: Record<ServicePitch, string> = {
  NEW_WEBSITE: 'New Website',
  REDESIGN: 'Redesign',
  MOBILE_REDESIGN: 'Mobile Redesign',
  SEO: 'SEO',
  BOOKING_SYSTEM: 'Booking System',
  CONTACT_FORM: 'Contact Form',
  SOCIAL_ONLY: 'Move off social-only',
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
    if (input.hasFacebook || input.hasInstagram) out.push(ServicePitch.SOCIAL_ONLY);
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
 * Business-scale classification. Drives sales-team segmentation: SMEs get
 * lightweight website packages, mid-market get redesign + integrations,
 * large enterprises get bespoke proposals.
 */
export const BusinessScale = {
  SME: 'SME',
  MID_MARKET: 'MID_MARKET',
  LARGE: 'LARGE',
  UNKNOWN: 'UNKNOWN',
} as const;
export type BusinessScale = (typeof BusinessScale)[keyof typeof BusinessScale];

export const BUSINESS_SCALE_LABELS: Record<BusinessScale, string> = {
  SME: 'Small / SME',
  MID_MARKET: 'Mid-market',
  LARGE: 'Large enterprise',
  UNKNOWN: 'Unclassified',
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
}

export interface BusinessScaleSignal {
  signal: string;
  weight: number;
  scale: Exclude<BusinessScale, 'UNKNOWN'>;
}

export interface BusinessScaleResult {
  scale: BusinessScale;
  /** 0–100 — relative gap between top & runner-up, capped. */
  confidence: number;
  signals: BusinessScaleSignal[];
  reasoning: string;
}

const LARGE_KEYWORDS = [
  'corporation', 'corp', 'enterprises', 'industries', 'group', 'holdings',
  'international', 'global', 'manufacturing', 'manufacturer', 'factory',
  'plant', 'logistics', 'wholesale', 'distributor', 'hospital',
  'university', 'airline', 'bank', 'insurance', 'pharmaceuticals',
  'oil & gas', 'utilities', 'telecom'
];

const SME_KEYWORDS = [
  'boutique', 'salon', 'barber', 'cafe', 'café', 'coffee shop', 'bistro',
  'studio', 'tailor', 'florist', 'bakery', 'bakeshop', 'spa',
  'pet groomer', 'tutor', 'auto repair', 'tattoo', 'nail',
  'restaurant', 'pizzeria', 'food truck', 'photographer', 'videographer'
];

const MID_KEYWORDS = [
  'agency', 'firm', 'consulting', 'consultancy', 'clinic', 'dental group',
  'law firm', 'medical center', 'real estate', 'dealership', 'showroom',
  'academy', 'training center', 'fitness center'
];

function bandSize(range: string | null | undefined): number | null {
  if (!range) return null;
  const m = String(range).replace(/[, ]/g, '').match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return Math.round((Number(m[1]) + Number(m[2])) / 2);
  const single = String(range).match(/(\d+)\+?/);
  return single ? Number(single[1]) : null;
}

/**
 * Classify a lead into SME / MID_MARKET / LARGE based on publicly observable
 * signals. Each signal contributes points to one of the three buckets; the
 * winner is returned along with confidence and the contributing signals.
 *
 * Heuristic-only — no claim of LinkedIn-scraped truth. Pass
 * `linkedinEmployeeRange` if/when an enrichment provider supplies it.
 */
export function classifyBusinessScale(input: BusinessScaleInput): BusinessScaleResult {
  const buckets: Record<Exclude<BusinessScale, 'UNKNOWN'>, number> = {
    SME: 0,
    MID_MARKET: 0,
    LARGE: 0,
  };
  const signals: BusinessScaleSignal[] = [];
  const push = (
    scale: Exclude<BusinessScale, 'UNKNOWN'>,
    weight: number,
    signal: string
  ) => {
    buckets[scale] += weight;
    signals.push({ scale, weight, signal });
  };

  const hay = [
    input.name ?? '',
    input.categoryPrimary ?? '',
    ...(input.categories ?? [])
  ]
    .join(' | ')
    .toLowerCase();

  // 1. Name / category keywords.
  if (LARGE_KEYWORDS.some((k) => hay.includes(k))) {
    push('LARGE', 25, 'name/category implies enterprise scale');
  }
  if (MID_KEYWORDS.some((k) => hay.includes(k))) {
    push('MID_MARKET', 18, 'category implies mid-market firm');
  }
  if (SME_KEYWORDS.some((k) => hay.includes(k))) {
    push('SME', 18, 'category implies small/independent business');
  }

  // 2. Review count (popularity / footprint signal).
  const reviews = input.reviewCount ?? 0;
  if (reviews >= 5000) push('LARGE', 20, `${reviews} reviews — household-name traffic`);
  else if (reviews >= 1000) push('LARGE', 12, `${reviews} reviews — major footprint`);
  else if (reviews >= 300) push('MID_MARKET', 14, `${reviews} reviews — established footprint`);
  else if (reviews >= 50) push('MID_MARKET', 8, `${reviews} reviews`);
  else if (reviews > 0) push('SME', 8, `only ${reviews} reviews`);
  else push('SME', 5, 'no review history');

  // 3. LinkedIn employee range (if provided by an enrichment).
  const headcount = bandSize(input.linkedinEmployeeRange);
  if (headcount !== null) {
    if (headcount >= 1000) push('LARGE', 30, `LinkedIn band ${input.linkedinEmployeeRange}`);
    else if (headcount >= 200) push('MID_MARKET', 25, `LinkedIn band ${input.linkedinEmployeeRange}`);
    else if (headcount >= 50) push('MID_MARKET', 15, `LinkedIn band ${input.linkedinEmployeeRange}`);
    else push('SME', 20, `LinkedIn band ${input.linkedinEmployeeRange}`);
  }

  // 4. Website tech & quality.
  const tech = (input.technologies ?? []).map((t) => t.toLowerCase());
  const score = input.websiteHealthScore ?? null;
  const bytes = input.pageBytes ?? 0;

  if (input.hasWebsite === false) {
    push('SME', 20, 'no website on file');
  }

  if (tech.includes('nextjs') || tech.includes('react')) {
    push('MID_MARKET', 10, 'modern JS framework (Next.js/React)');
  }
  if (tech.includes('shopify') || tech.includes('wix') || tech.includes('squarespace') || tech.includes('webflow')) {
    push('SME', 12, 'hosted site builder (Shopify/Wix/Squarespace/Webflow)');
  }
  if (tech.includes('wordpress')) {
    push('SME', 6, 'WordPress site');
  }
  if (tech.includes('legacy-jquery') || tech.includes('html-frames') || tech.includes('flash')) {
    push('SME', 8, 'legacy front-end stack');
  }
  if (score !== null && score >= 85 && (input.hasSeoBasics ?? false) && (input.hasOgTags ?? false)) {
    push('MID_MARKET', 8, `polished website (health ${score})`);
  }
  if (bytes >= 200_000) {
    push('MID_MARKET', 6, `heavy homepage (${Math.round(bytes / 1024)} KB)`);
  }
  if (bytes >= 800_000) {
    push('LARGE', 6, 'enterprise-weight homepage');
  }

  // 5. Online presence — SMEs often live on Facebook/Instagram only.
  const onlySocial =
    input.hasWebsite === false && (input.hasFacebook || input.hasInstagram);
  if (onlySocial) push('SME', 10, 'social-only presence');

  // Pick winner.
  const ordered = (Object.entries(buckets) as Array<
    [Exclude<BusinessScale, 'UNKNOWN'>, number]
  >).sort((a, b) => b[1] - a[1]);
  const [topScale, topScore] = ordered[0];
  const [, second] = ordered[1] ?? ['SME', 0];

  if (topScore < 15) {
    return {
      scale: BusinessScale.UNKNOWN,
      confidence: 0,
      signals,
      reasoning: 'Not enough public signals to classify.',
    };
  }

  const confidence = Math.max(0, Math.min(100, Math.round((topScore - second) * 5 + 30)));
  const reasoning = signals
    .filter((s) => s.scale === topScale)
    .slice(0, 3)
    .map((s) => s.signal)
    .join('; ');

  return {
    scale: topScale,
    confidence,
    signals,
    reasoning: reasoning || `${BUSINESS_SCALE_LABELS[topScale]} based on combined signals.`,
  };
}
