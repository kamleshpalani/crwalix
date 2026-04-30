import { withOrg } from "@crawlix/db";
import { defaultRuleset, score, type ScorableLead } from "@crawlix/scoring";
import {
  WebsiteStatus,
  WebsiteHealth,
  BusinessStatus,
  type ScoreLeadJob,
} from "@crawlix/shared";
import { logger } from "../lib/logger";
import { publishDomainEvent } from "../lib/domain-events";

export async function runScoreLead(job: ScoreLeadJob): Promise<void> {
  const log = logger.child({ job: "score.lead", leadId: job.leadId });

  let scoredResult: { score: number; priorityTier: string } | null = null;

  await withOrg(job.organizationId, async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: job.leadId } });
    if (!lead) {
      log.warn("lead not found; skipping");
      return;
    }
    const scorable: ScorableLead = {
      id: lead.id,
      websiteStatus: lead.websiteStatus as WebsiteStatus,
      websiteHealth: (lead.websiteHealth as WebsiteHealth) ?? null,
      websiteHealthScore: lead.websiteHealthScore ?? null,
      businessStatus: lead.businessStatus as BusinessStatus,
      rating: lead.rating,
      reviewCount: lead.reviewCount,
      city: lead.city,
      state: lead.state,
      country: lead.country,
      categoryPrimary: lead.categoryPrimary,
      categories: lead.categories,
      phone: lead.phone,
      website: lead.website,
      // §10.2 — new fields for extended scoring rules
      email: (lead as { email?: string | null }).email ?? null,
      facebookUrl:
        (lead as { facebookUrl?: string | null }).facebookUrl ?? null,
      instagramUrl:
        (lead as { instagramUrl?: string | null }).instagramUrl ?? null,
      businessScale:
        (lead as { businessScale?: string | null }).businessScale ?? null,
      websiteClassification:
        (lead as { websiteClassification?: string | null })
          .websiteClassification ?? null,
      hasBookingForm:
        (lead as { hasBookingForm?: boolean | null }).hasBookingForm ?? null,
      hasLeadCaptureForm:
        (lead as { hasLeadCaptureForm?: boolean | null }).hasLeadCaptureForm ??
        null,
      hasSeoBasics:
        (lead as { hasSeoBasics?: boolean | null }).hasSeoBasics ?? null,
      hasSchemaMarkup:
        (lead as { hasSchemaMarkup?: boolean | null }).hasSchemaMarkup ?? null,
      hasAnalytics:
        (lead as { hasAnalytics?: boolean | null }).hasAnalytics ?? null,
    };
    const result = score(scorable, defaultRuleset);
    const digitalPresenceScore = computeDigitalPresenceScore({
      websiteStatus: lead.websiteStatus as WebsiteStatus,
      websiteHealth: (lead.websiteHealth as WebsiteHealth) ?? null,
      websiteHealthScore: lead.websiteHealthScore ?? null,
      rating: lead.rating,
      reviewCount: lead.reviewCount,
      facebookUrl:
        (lead as { facebookUrl?: string | null }).facebookUrl ?? null,
      instagramUrl:
        (lead as { instagramUrl?: string | null }).instagramUrl ?? null,
      googleProfileUrl:
        (lead as { googleProfileUrl?: string | null }).googleProfileUrl ?? null,
    });

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        score: result.score,
        priorityTier: result.priorityTier,
        scoreBreakdown: result.breakdown as object,
        digitalPresenceScore,
      },
    });

    await tx.leadScore.create({
      data: {
        leadId: lead.id,
        score: result.score,
        priorityTier: result.priorityTier,
        breakdown: result.breakdown as object,
        rulesetVersion: result.rulesetVersion,
      },
    });

    scoredResult = { score: result.score, priorityTier: result.priorityTier };
  });

  log.info("scored");

  // §6 domain event — LeadQualified (best-effort).
  if (scoredResult) {
    void publishDomainEvent({
      eventName: "LeadQualified",
      organizationId: job.organizationId,
      occurredAt: new Date().toISOString(),
      payload: {
        leadId: job.leadId,
        score: scoredResult.score,
        tier: scoredResult.priorityTier,
      },
    });
  }
}
/**
 * 0..100 multi-channel digital presence score. Weighted blend of:
 *   - Website signal (presence + health)         50
 *   - Reviews signal (rating + review_count)     25
 *   - Social/profile signal (FB/IG/Google)       25
 *
 * Section 7.3: persisted as `Lead.digitalPresenceScore`.
 */
function computeDigitalPresenceScore(input: {
  websiteStatus: WebsiteStatus;
  websiteHealth: WebsiteHealth | null;
  websiteHealthScore: number | null;
  rating: number | null;
  reviewCount: number | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  googleProfileUrl: string | null;
}): number {
  // Website (0..50)
  let web = 0;
  if (input.websiteStatus === WebsiteStatus.EXISTS) {
    if (typeof input.websiteHealthScore === "number") {
      web = Math.round((input.websiteHealthScore / 100) * 50);
    } else {
      switch (input.websiteHealth) {
        case WebsiteHealth.FRESH:
          web = 50;
          break;
        case WebsiteHealth.NEEDS_REVIEW:
          web = 35;
          break;
        case WebsiteHealth.OUTDATED:
          web = 20;
          break;
        case WebsiteHealth.UNREACHABLE:
          web = 10;
          break;
        default:
          web = 30;
      }
    }
  } else if (input.websiteStatus === WebsiteStatus.EXISTS_MISSING_IN_SOURCE) {
    web = 25;
  }

  // Reviews (0..25): rating up to 15, review count up to 10 (log-scaled to 200).
  const ratingPart =
    typeof input.rating === "number"
      ? Math.round(Math.max(0, Math.min(5, input.rating)) * 3)
      : 0;
  const reviewPart =
    typeof input.reviewCount === "number" && input.reviewCount > 0
      ? Math.min(
          10,
          Math.round(
            (Math.log10(input.reviewCount + 1) / Math.log10(201)) * 10,
          ),
        )
      : 0;
  const reviews = ratingPart + reviewPart;

  // Social (0..25): up to ~8 per linked profile.
  const socialCount =
    (input.facebookUrl ? 1 : 0) +
    (input.instagramUrl ? 1 : 0) +
    (input.googleProfileUrl ? 1 : 0);
  const social = Math.min(25, socialCount * 9);

  return Math.max(0, Math.min(100, web + reviews + social));
}
