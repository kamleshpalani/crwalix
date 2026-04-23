import { withOrg } from '@crawlix/db';
import { defaultRuleset, score, type ScorableLead } from '@crawlix/scoring';
import { WebsiteStatus, BusinessStatus, type ScoreLeadJob } from '@crawlix/shared';
import { logger } from '../lib/logger';

export async function runScoreLead(job: ScoreLeadJob): Promise<void> {
  const log = logger.child({ job: 'score.lead', leadId: job.leadId });

  await withOrg(job.organizationId, async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: job.leadId } });
    if (!lead) {
      log.warn('lead not found; skipping');
      return;
    }
    const scorable: ScorableLead = {
      id: lead.id,
      websiteStatus: lead.websiteStatus as WebsiteStatus,
      businessStatus: lead.businessStatus as BusinessStatus,
      rating: lead.rating,
      reviewCount: lead.reviewCount,
      city: lead.city,
      state: lead.state,
      country: lead.country,
      categoryPrimary: lead.categoryPrimary,
      categories: lead.categories,
      phone: lead.phone,
      website: lead.website
    };
    const result = score(scorable, defaultRuleset);

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        score: result.score,
        priorityTier: result.priorityTier,
        scoreBreakdown: result.breakdown as object
      }
    });

    await tx.leadScore.create({
      data: {
        leadId: lead.id,
        score: result.score,
        priorityTier: result.priorityTier,
        breakdown: result.breakdown as object,
        rulesetVersion: result.rulesetVersion
      }
    });
  });

  log.info('scored');
}
