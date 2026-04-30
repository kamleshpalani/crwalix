import { BusinessStatus, WebsiteHealth, WebsiteStatus } from "@crawlix/shared";
import type { Ruleset, ScoreRule } from "../types";

/** Domains that look like a website but are really just a social/booking link. */
const SOCIAL_ONLY_HOSTS = [
  "facebook.com",
  "m.facebook.com",
  "fb.com",
  "instagram.com",
  "linktr.ee",
  "linkin.bio",
  "business.site",
  "sites.google.com",
  "wa.me",
  "api.whatsapp.com",
  "t.me",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
];

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Categories where SMEs typically pay for a website refresh. */
const HIGH_VALUE_CATEGORY =
  /\b(dental|dermatolog|physiotherap|clinic|hospital|spa|salon|beauty|aesthetic|cosmetic|veterinar|legal|law|attorney|lawyer|accountant|consult|real[\s-]?estate|property|interior|fit[\s-]?out|architect|construction|contracting|catering|restaurant|cafe|coffee|hotel|resort|gym|fitness|yoga|pilates|nursery|preschool|tutor|driving[\s-]?school|car[\s-]?garage|auto[\s-]?repair|auto[\s-]?service|car[\s-]?wash|cleaning|pest[\s-]?control|ac[\s-]?repair|hvac|plumb|electrician|moving|movers|landscap|printing|signage|uniform|tailor|laundry|bakery|florist|photograph|videograph|wedding|event|jeweler|optician|pharmacy|courier)\b/i;

const missingWebsite: ScoreRule = {
  id: "missing_website",
  weight: 1,
  applies: () => true,
  evaluate: (l) => {
    // A "social-only" listing (facebook.com / instagram.com / linktr.ee etc.)
    // is effectively no website for sales purposes.
    const host = hostOf(l.website);
    const isSocialOnly =
      host !== null &&
      SOCIAL_ONLY_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
    if (isSocialOnly) {
      return {
        contribution: 35,
        reason: `Only a social/booking link (${host}) — no real website`,
      };
    }
    switch (l.websiteStatus) {
      case WebsiteStatus.HIGH_CONFIDENCE_NONE:
        return {
          contribution: 40,
          reason: "Confirmed no website — prime prospect",
        };
      case WebsiteStatus.LIKELY_NONE:
        return {
          contribution: 30,
          reason: "Likely no website (not listed in source)",
        };
      case WebsiteStatus.EXISTS_MISSING_IN_SOURCE:
        return {
          contribution: 5,
          reason: "Has a website but not attached in source",
        };
      case WebsiteStatus.EXISTS:
        return { contribution: -10, reason: "Already has a website" };
      default:
        return { contribution: 0, reason: "Website status unknown" };
    }
  },
};

/**
 * Refines the missing-website signal once the website-validation enrichment
 * has run. Mirrors the user's pitch model:
 *   speed/UX < 50  ≈ OUTDATED  → +25
 *   missing CTAs   ≈ NEEDS_REVIEW
 *   modern site    ≈ FRESH     → demote
 */
const websiteHealthRule: ScoreRule = {
  id: "website_health",
  weight: 1,
  applies: (l) =>
    Boolean(l.websiteHealth) && l.websiteHealth !== WebsiteHealth.NOT_AUDITED,
  evaluate: (l) => {
    switch (l.websiteHealth) {
      case WebsiteHealth.UNREACHABLE:
        return { contribution: 35, reason: "Website unreachable / parked" };
      case WebsiteHealth.OUTDATED:
        return {
          contribution: 25,
          reason: "Outdated site — strong redesign candidate",
        };
      case WebsiteHealth.NEEDS_REVIEW:
        return {
          contribution: 15,
          reason: "Site has aging / weak-conversion signals",
        };
      case WebsiteHealth.FRESH:
        return { contribution: -25, reason: "Modern, well-maintained site" };
      default:
        return { contribution: 0, reason: "Website not yet audited" };
    }
  },
};

const businessStatusRule: ScoreRule = {
  id: "business_status",
  weight: 1,
  applies: () => true,
  evaluate: (l) =>
    l.businessStatus === BusinessStatus.OPERATIONAL
      ? { contribution: 5, reason: "Operational" }
      : l.businessStatus === BusinessStatus.CLOSED_PERM
        ? { contribution: -60, reason: "Permanently closed" }
        : l.businessStatus === BusinessStatus.CLOSED_TEMP
          ? { contribution: -20, reason: "Temporarily closed" }
          : { contribution: 0, reason: "Unknown status" },
};

const reviewActivity: ScoreRule = {
  id: "review_activity",
  weight: 1,
  applies: (l) => typeof l.reviewCount === "number",
  evaluate: (l) => {
    const c = l.reviewCount ?? 0;
    if (c >= 100)
      return { contribution: 15, reason: `Strong review volume (${c})` };
    if (c >= 50)
      return { contribution: 15, reason: `Healthy review volume (${c})` };
    if (c >= 25) return { contribution: 10, reason: `Some reviews (${c})` };
    if (c >= 5) return { contribution: 5, reason: `Few reviews (${c})` };
    return { contribution: 0, reason: "No meaningful review volume" };
  },
};

const ratingRule: ScoreRule = {
  id: "rating",
  weight: 1,
  applies: (l) => typeof l.rating === "number",
  evaluate: (l) => {
    const r = l.rating ?? 0;
    if (r >= 4.5)
      return { contribution: 15, reason: `Excellent rating (${r})` };
    if (r >= 4.0) return { contribution: 15, reason: `Good rating (${r})` };
    if (r < 3.0 && r > 0)
      return { contribution: -10, reason: `Low rating (${r})` };
    return { contribution: 0, reason: "Average rating" };
  },
};

const highValueCategory: ScoreRule = {
  id: "high_value_category",
  weight: 1,
  applies: () => true,
  evaluate: (l) => {
    const haystack = `${l.categoryPrimary ?? ""} ${l.categories.join(" ")}`;
    if (HIGH_VALUE_CATEGORY.test(haystack)) {
      return {
        contribution: 20,
        reason: "High-value SME category (likely to invest in website)",
      };
    }
    return { contribution: 0, reason: "Generic / low-spend category" };
  },
};

const contactReachability: ScoreRule = {
  id: "contact_reachability",
  weight: 1,
  applies: () => true,
  evaluate: (l) => {
    if (l.phone && l.phone.trim().length >= 6) {
      return {
        contribution: 10,
        reason: "Phone number available for outreach",
      };
    }
    return { contribution: 0, reason: "No phone on file" };
  },
};

const chainLikelihood: ScoreRule = {
  id: "chain_likelihood",
  weight: 1,
  applies: () => true,
  evaluate: (l) => {
    const chainHints =
      /mcdonald|starbucks|subway|domino|walmart|target|7-eleven|kfc|chipotle|burger\s?king|wendy|taco\s?bell|pizza\s?hut|costco|tesco|sainsbur|asda|morrisons|aldi|lidl|carrefour|lulu|spinneys|adnoc|emirates[\s-]?nbd|adcb|fab|reliance|bigbasket|dmart|tata|infosys|hsbc|barclays|lloyds|natwest|santander|bnp\s?paribas|deutsche\s?bank|ing|rabobank|ikea|h&m|zara|uniqlo|decathlon|7\s?eleven|family\s?mart|lawson|woolworths|coles|aldi/i;
    if (
      chainHints.test(l.categoryPrimary ?? "") ||
      chainHints.test(l.categories.join(" "))
    ) {
      return { contribution: -25, reason: "Likely chain/franchise" };
    }
    return { contribution: 0, reason: "Independent likely" };
  },
};

/**
 * Data freshness — rewards recently-discovered / recently-refreshed leads.
 * Stale data (>90 days untouched) is deprioritised because contact info may
 * be out-of-date and the business situation may have changed.
 */
const dataFreshness: ScoreRule = {
  id: "data_freshness",
  weight: 1,
  applies: (l) => Boolean(l.firstSeenAt ?? l.lastSeenAt),
  evaluate: (l) => {
    const ref = l.lastSeenAt ?? l.firstSeenAt;
    const ageMs = Date.now() - new Date(ref as string | Date).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays <= 7)
      return {
        contribution: 10,
        reason: `Very fresh data (${Math.round(ageDays)}d old)`,
      };
    if (ageDays <= 30)
      return {
        contribution: 5,
        reason: `Recent data (${Math.round(ageDays)}d old)`,
      };
    if (ageDays <= 90)
      return {
        contribution: 0,
        reason: `Moderate data age (${Math.round(ageDays)}d)`,
      };
    if (ageDays <= 180)
      return {
        contribution: -5,
        reason: `Data ageing (${Math.round(ageDays)}d) — consider re-enriching`,
      };
    return {
      contribution: -10,
      reason: `Stale data (${Math.round(ageDays)}d old) — outreach success rate may be lower`,
    };
  },
};

export const defaultRuleset: Ruleset = {
  version: "v1.2.0",
  rules: [
    missingWebsite,
    websiteHealthRule,
    businessStatusRule,
    reviewActivity,
    ratingRule,
    highValueCategory,
    contactReachability,
    chainLikelihood,
    dataFreshness,
  ],
  // Tiers per the UAE pitch model: 80–100 hot, 60–79 warm, 40–59 nurture.
  tiers: { high: 80, medium: 60 },
};
