import { BusinessStatus, WebsiteStatus } from '@crawlix/shared';
import type { Ruleset, ScoreRule } from '../types.js';

const missingWebsite: ScoreRule = {
  id: 'missing_website',
  weight: 1,
  applies: () => true,
  evaluate: (l) => {
    switch (l.websiteStatus) {
      case WebsiteStatus.HIGH_CONFIDENCE_NONE:
        return { contribution: 45, reason: 'Confirmed no website — prime prospect' };
      case WebsiteStatus.LIKELY_NONE:
        return { contribution: 30, reason: 'Likely no website (not listed in source)' };
      case WebsiteStatus.EXISTS_MISSING_IN_SOURCE:
        return { contribution: 5, reason: 'Has a website but not attached in source' };
      case WebsiteStatus.EXISTS:
        return { contribution: -10, reason: 'Already has a website' };
      default:
        return { contribution: 0, reason: 'Website status unknown' };
    }
  },
};

const businessStatusRule: ScoreRule = {
  id: 'business_status',
  weight: 1,
  applies: () => true,
  evaluate: (l) =>
    l.businessStatus === BusinessStatus.OPERATIONAL
      ? { contribution: 5, reason: 'Operational' }
      : l.businessStatus === BusinessStatus.CLOSED_PERM
      ? { contribution: -60, reason: 'Permanently closed' }
      : l.businessStatus === BusinessStatus.CLOSED_TEMP
      ? { contribution: -20, reason: 'Temporarily closed' }
      : { contribution: 0, reason: 'Unknown status' },
};

const reviewActivity: ScoreRule = {
  id: 'review_activity',
  weight: 1,
  applies: (l) => typeof l.reviewCount === 'number',
  evaluate: (l) => {
    const c = l.reviewCount ?? 0;
    if (c >= 100) return { contribution: 15, reason: `Strong review volume (${c})` };
    if (c >= 25) return { contribution: 10, reason: `Healthy review volume (${c})` };
    if (c >= 5) return { contribution: 5, reason: `Some reviews (${c})` };
    return { contribution: 0, reason: 'Few/no reviews' };
  },
};

const ratingRule: ScoreRule = {
  id: 'rating',
  weight: 1,
  applies: (l) => typeof l.rating === 'number',
  evaluate: (l) => {
    const r = l.rating ?? 0;
    if (r >= 4.5) return { contribution: 10, reason: `Excellent rating (${r})` };
    if (r >= 4.0) return { contribution: 5, reason: `Good rating (${r})` };
    if (r < 3.0 && r > 0) return { contribution: -10, reason: `Low rating (${r})` };
    return { contribution: 0, reason: 'Average rating' };
  },
};

const chainLikelihood: ScoreRule = {
  id: 'chain_likelihood',
  weight: 1,
  applies: () => true,
  evaluate: (l) => {
    // Simple heuristic: known chain keywords deprioritize.
    const chainHints = /mcdonald|starbucks|subway|domino|walmart|target|7-eleven|kfc|chipotle/i;
    if (chainHints.test(l.categoryPrimary ?? '') || chainHints.test(l.categories.join(' '))) {
      return { contribution: -25, reason: 'Likely chain/franchise' };
    }
    return { contribution: 0, reason: 'Independent likely' };
  },
};

export const defaultRuleset: Ruleset = {
  version: 'v1.0.0',
  rules: [missingWebsite, businessStatusRule, reviewActivity, ratingRule, chainLikelihood],
  tiers: { high: 75, medium: 45 },
};
