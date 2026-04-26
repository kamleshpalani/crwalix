import type { PriorityTier, WebsiteStatus, WebsiteHealth, BusinessStatus } from '@crawlix/shared';

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
  /** Tier thresholds; contribution is already weighted. */
  tiers: { high: number; medium: number };
}
