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

// ---------------------------------------------------------------------------
// §10.2 — New scoring rules for the 15 qualifying factors
// ---------------------------------------------------------------------------

/**
 * §10.2 — Contact details: email availability (augments phone rule).
 * Both phone + email = ideal dual-channel outreach.
 */
const emailContactRule: ScoreRule = {
  id: "email_contact",
  weight: 1,
  applies: (l) => Boolean(l.email),
  evaluate: (l) =>
    l.email && l.email.trim().length > 5
      ? {
          contribution: 5,
          reason: "Email address on file — dual-channel outreach possible",
        }
      : { contribution: 0, reason: "No email on file" },
};

/**
 * §10.2 — Business location quality.
 * Knowing the city and country increases outreach trustworthiness and allows
 * geo-targeted pitches.
 */
const locationQualityRule: ScoreRule = {
  id: "location_quality",
  weight: 1,
  applies: () => true,
  evaluate: (l) => {
    if (l.city && l.country) {
      return {
        contribution: 5,
        reason: `Known location: ${l.city}, ${l.country}`,
      };
    }
    if (l.city ?? l.country) {
      return { contribution: 2, reason: "Partial location data" };
    }
    return {
      contribution: -3,
      reason: "Location unknown — harder to personalise pitch",
    };
  },
};

/**
 * §10.2 — Business size (scale).
 * Micro and small independent businesses are the ideal target for web/SEO
 * packages. Enterprises are served by larger agencies; chains are penalised
 * by the chain_likelihood rule separately.
 */
const businessScaleRule: ScoreRule = {
  id: "business_scale",
  weight: 1,
  applies: (l) => Boolean(l.businessScale) && l.businessScale !== "UNKNOWN",
  evaluate: (l) => {
    switch (l.businessScale) {
      case "MICRO":
        return {
          contribution: 10,
          reason: "Micro business — ideal target for entry-level package",
        };
      case "SMALL":
        return {
          contribution: 8,
          reason: "Small business — prime target for website + SEO",
        };
      case "MEDIUM":
        return {
          contribution: 3,
          reason: "Medium business — potential upsell opportunity",
        };
      case "LARGE":
        return {
          contribution: -5,
          reason: "Large business — budget cycle likely longer",
        };
      case "ENTERPRISE":
        return {
          contribution: -15,
          reason: "Enterprise — not ideal for standard package sales",
        };
      default:
        return { contribution: 0, reason: "Business scale not determined" };
    }
  },
};

/**
 * §10.2 — Active social presence.
 * Businesses that have social media but no website are the perfect upsell
 * target (already digitally aware but under-served). Businesses with no
 * social at all are harder to reach.
 */
const socialPresenceRule: ScoreRule = {
  id: "social_presence",
  weight: 1,
  applies: () => true,
  evaluate: (l) => {
    const hasFacebook = Boolean(l.facebookUrl);
    const hasInstagram = Boolean(l.instagramUrl);
    if (hasFacebook && hasInstagram) {
      return {
        contribution: 8,
        reason: "Active on Facebook + Instagram — digitally aware",
      };
    }
    if (hasFacebook || hasInstagram) {
      return {
        contribution: 5,
        reason: "Active on social media — reachable via digital channels",
      };
    }
    return {
      contribution: -3,
      reason: "No social presence detected — harder to verify business",
    };
  },
};

/**
 * §10.2 — Weak SEO signals.
 * Missing SEO basics (title, meta description, h1, og tags) or schema markup
 * is a direct upsell opportunity for SEO services.
 */
const seoWeaknessRule: ScoreRule = {
  id: "seo_weakness",
  weight: 1,
  applies: (l) => l.hasSeoBasics !== null && l.hasSeoBasics !== undefined,
  evaluate: (l) => {
    if (l.hasSeoBasics === false && l.hasSchemaMarkup === false) {
      return {
        contribution: 18,
        reason:
          "Weak SEO: missing basics + no schema markup — strong SEO upsell",
      };
    }
    if (l.hasSeoBasics === false) {
      return {
        contribution: 15,
        reason: "Missing SEO basics (title/meta/h1) — direct SEO opportunity",
      };
    }
    if (l.hasSchemaMarkup === false) {
      return {
        contribution: 5,
        reason: "No schema markup — minor SEO improvement opportunity",
      };
    }
    return { contribution: -5, reason: "Good SEO fundamentals in place" };
  },
};

/** Service categories that rely on appointments (split for regex complexity). */
const BOOKING_CATS_A =
  /\b(salon|spa|dental|clinic|gym|fitness|yoga|pilates|restaurant|cafe|hotel|resort)\b/i;
const BOOKING_CATS_B =
  /\b(tutor|driving|repair|plumb|electrician|moving|cleaning|physio|consult|beauty)\b/i;
const BOOKING_CATS_C =
  /\b(aesthetic|barber|massage|nail|tattoo|photography|event)\b/i;

function isBookingCategory(haystack: string): boolean {
  return (
    BOOKING_CATS_A.test(haystack) ||
    BOOKING_CATS_B.test(haystack) ||
    BOOKING_CATS_C.test(haystack)
  );
}

/**
 * §10.2 — Missing online booking system.
 * Service businesses without an online booking form lose after-hours leads.
 * This is a strong argument for a booking integration.
 */
const missingBookingRule: ScoreRule = {
  id: "missing_booking",
  weight: 1,
  applies: (l) => {
    if (l.hasBookingForm === null || l.hasBookingForm === undefined)
      return false;
    const haystack = `${l.categoryPrimary ?? ""} ${l.categories.join(" ")}`;
    return isBookingCategory(haystack);
  },
  evaluate: (l) =>
    l.hasBookingForm === false
      ? {
          contribution: 12,
          reason:
            "No online booking system — high-value booking integration upsell",
        }
      : {
          contribution: -5,
          reason: "Already has online booking — reduces urgency",
        },
};

/**
 * §10.2 — Missing lead capture form.
 * No email capture form means the business is losing warm leads who visit
 * the site but aren't ready to call. Easy win for conversion optimisation.
 */
const missingLeadCaptureRule: ScoreRule = {
  id: "missing_lead_capture",
  weight: 1,
  applies: (l) =>
    l.hasLeadCaptureForm !== null && l.hasLeadCaptureForm !== undefined,
  evaluate: (l) =>
    l.hasLeadCaptureForm === false
      ? {
          contribution: 10,
          reason: "No lead capture form — losing warm website visitors",
        }
      : {
          contribution: -3,
          reason: "Has lead capture form — conversion basics covered",
        },
};

/**
 * §10.2 — Estimated ability to pay.
 * Combines high-value category + SME scale + strong review presence as a
 * proxy for business health and marketing budget availability.
 */
const abilityToPayRule: ScoreRule = {
  id: "ability_to_pay",
  weight: 1,
  applies: (l) => {
    const haystack = `${l.categoryPrimary ?? ""} ${l.categories.join(" ")}`;
    return HIGH_VALUE_CATEGORY.test(haystack);
  },
  evaluate: (l) => {
    const isSmallEnough =
      !l.businessScale ||
      ["MICRO", "SMALL", "MEDIUM", "UNKNOWN"].includes(l.businessScale);
    const hasRevenue = typeof l.reviewCount === "number" && l.reviewCount >= 10;
    if (isSmallEnough && hasRevenue) {
      return {
        contribution: 10,
        reason:
          "High-value category + established business — strong budget signal",
      };
    }
    if (isSmallEnough) {
      return {
        contribution: 5,
        reason: "High-value category with payment potential",
      };
    }
    return {
      contribution: 0,
      reason: "Category fit present but scale uncertain",
    };
  },
};

/** Retail/product categories suitable for e-commerce pitching (split for regex complexity). */
const ECOMMERCE_CATS_A =
  /\b(retail|shop|store|boutique|fashion|clothing|jeweler|bakery|florist)\b/i;
const ECOMMERCE_CATS_B =
  /\b(gift|toys|electronics|furniture|hardware|pharmacy|optical|uniform)\b/i;
const ECOMMERCE_CATS_C = /\b(tailor|laundry|printing|signage)\b/i;

function isEcommerceCategory(haystack: string): boolean {
  return (
    ECOMMERCE_CATS_A.test(haystack) ||
    ECOMMERCE_CATS_B.test(haystack) ||
    ECOMMERCE_CATS_C.test(haystack)
  );
}

/**
 * §10.2 — Missing e-commerce / online store.
 * Retail or product businesses with no apparent online store are candidates
 * for e-commerce development services.
 */
const missingEcommerceRule: ScoreRule = {
  id: "missing_ecommerce",
  weight: 1,
  applies: (l) => {
    const haystack = `${l.categoryPrimary ?? ""} ${l.categories.join(" ")}`;
    return isEcommerceCategory(haystack);
  },
  evaluate: (l) => {
    // Treat a missing or outdated website + retail category as e-commerce gap.
    if (
      l.websiteHealth === WebsiteHealth.UNREACHABLE ||
      l.websiteStatus === WebsiteStatus.HIGH_CONFIDENCE_NONE
    ) {
      return {
        contribution: 15,
        reason: "Retail business with no website — strong e-commerce upsell",
      };
    }
    if (
      l.websiteHealth === WebsiteHealth.OUTDATED ||
      l.websiteHealth === WebsiteHealth.NEEDS_REVIEW
    ) {
      return {
        contribution: 8,
        reason:
          "Retail business with outdated website — e-commerce upgrade opportunity",
      };
    }
    return {
      contribution: 3,
      reason: "Retail category — potential for e-commerce enhancement",
    };
  },
};

export const defaultRuleset: Ruleset = {
  version: "v2.0.0",
  rules: [
    // Existing rules
    missingWebsite,
    websiteHealthRule,
    businessStatusRule,
    reviewActivity,
    ratingRule,
    highValueCategory,
    contactReachability,
    chainLikelihood,
    dataFreshness,
    // §10.2 — New rules
    emailContactRule,
    locationQualityRule,
    businessScaleRule,
    socialPresenceRule,
    seoWeaknessRule,
    missingBookingRule,
    missingLeadCaptureRule,
    abilityToPayRule,
    missingEcommerceRule,
  ],
  // §10.1 — 5-tier thresholds
  tiers: { critical: 80, high: 60, medium: 40, low: 20 },
};
