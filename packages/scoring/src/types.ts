import type {
  PriorityTier,
  WebsiteStatus,
  WebsiteHealth,
  BusinessStatus,
} from "@crawlix/shared";

/** Minimum lead shape the scoring engine needs. */
export interface ScorableLead {
  id: string;
  websiteStatus: WebsiteStatus;
  /** Outcome of the website-validation enrichment, if it has run. */
  websiteHealth?: WebsiteHealth | null;
  websiteHealthScore?: number | null;
  businessStatus: BusinessStatus;
  rating: number | null | undefined;
  reviewCount: number | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  country: string | null | undefined;
  categoryPrimary: string | null | undefined;
  categories: string[];
  phone: string | null | undefined;
  website: string | null | undefined;
  /** When the lead was first discovered; used for freshness scoring. */
  firstSeenAt?: Date | string | null;
  /** When the lead data was last refreshed from the source. */
  lastSeenAt?: Date | string | null;
  // §10.2 — extended fields for new scoring rules
  /** §10.2 — Email address; adds to contact reachability score. */
  email?: string | null;
  /** §10.2 — Facebook page URL from website audit. */
  facebookUrl?: string | null;
  /** §10.2 — Instagram profile URL from website audit. */
  instagramUrl?: string | null;
  /** §10.2 — Business scale classification (MICRO/SMALL/MEDIUM/LARGE/ENTERPRISE). */
  businessScale?: string | null;
  /** §10.2 — §9.1 website classification for deeper weakness signals. */
  websiteClassification?: string | null;
  /** §10.2 — Whether website has online booking form. */
  hasBookingForm?: boolean | null;
  /** §10.2 — Whether website has a lead capture form (email input in form). */
  hasLeadCaptureForm?: boolean | null;
  /** §10.2 — Whether website passes basic SEO checks. */
  hasSeoBasics?: boolean | null;
  /** §10.2 — Whether website has schema.org markup. */
  hasSchemaMarkup?: boolean | null;
  /** §10.2 — Whether website has analytics tracking. */
  hasAnalytics?: boolean | null;
}

export interface ScoreContribution {
  ruleId: string;
  weight: number;
  contribution: number; // signed, after weighting
  reason: string;
}

export interface ScoreResult {
  score: number; // clamped 0..100
  priorityTier: PriorityTier;
  breakdown: ScoreContribution[];
  rulesetVersion: string;
}

export interface ScoreRule {
  id: string;
  weight: number;
  applies(lead: ScorableLead): boolean;
  evaluate(lead: ScorableLead): { contribution: number; reason: string };
}

export interface Ruleset {
  version: string;
  rules: ScoreRule[];
  /**
   * Tier thresholds (inclusive lower bounds).
   * §10.1 — 5-tier system:
   *   critical ≥ 80 | high ≥ 60 | medium ≥ 40 | low ≥ 20 | not_recommended < 20
   */
  tiers: { critical: number; high: number; medium: number; low: number };
}
