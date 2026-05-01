import { prisma, withOrg } from "@crawlix/db";
import { vibeProspectLead } from "@crawlix/ai";
import type { VibeProspectJob, VibeProspectBulkJob } from "@crawlix/shared";
import { logger } from "../lib/logger";

/**
 * vibe.prospect
 *
 * Runs Claude's full vibe prospecting analysis on a single lead and persists
 * the result to `lead.vibeAnalysis` (Json column).  The API route can read
 * that column directly — no separate table needed for MVP.
 */
export async function runVibeProspect(job: VibeProspectJob): Promise<void> {
  const log = logger.child({
    job: "vibe.prospect",
    leadId: job.leadId,
    orgId: job.organizationId,
  });

  const lead = await withOrg(job.organizationId, (tx) =>
    tx.lead.findFirst({
      where: { id: job.leadId, organizationId: job.organizationId },
      select: {
        id: true,
        name: true,
        categoryPrimary: true,
        city: true,
        country: true,
        website: true,
        phone: true,
        rating: true,
        reviewCount: true,
        websiteStatus: true,
        websiteHealthScore: true,
        websiteClassification: true,
        businessScale: true,
        digitalPresenceScore: true,
        facebookUrl: true,
        instagramUrl: true,
        isMobileReady: true,
        hasSeoBasics: true,
        hasAnalytics: true,
        hasBookingForm: true,
        hasLeadCaptureForm: true,
        hasContactForm: true,
        hasSchemaMarkup: true,
        techStack: true,
        provider: true,
      },
    }),
  );

  if (!lead) {
    log.warn("lead not found; skipping");
    return;
  }

  // Cast for fields added in later migrations that may not be on the Prisma
  // type yet.
  const l = lead as typeof lead & {
    email?: string | null;
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
    websiteClassification?: string | null;
    digitalPresenceScore?: number | null;
    servicePitch?: string[] | null;
  };

  // Get org name for personalised outreach messages.
  const org = await prisma.organization.findUnique({
    where: { id: job.organizationId },
    select: { name: true },
  });

  log.info("running vibe analysis");

  const result = await vibeProspectLead({
    organizationId: job.organizationId,
    agencyName: job.agencyName ?? org?.name ?? null,
    lead: {
      name: lead.name,
      category: lead.categoryPrimary,
      city: lead.city,
      country: lead.country,
      website: lead.website,
      phone: lead.phone,
      email: l.email ?? null,
      rating: lead.rating,
      reviewCount: lead.reviewCount,
      websiteStatus: lead.websiteStatus,
      websiteHealthScore: lead.websiteHealthScore,
      websiteClassification: l.websiteClassification ?? null,
      hasBookingForm: l.hasBookingForm ?? null,
      hasLeadCaptureForm: l.hasLeadCaptureForm ?? null,
      hasContactForm: l.hasContactForm ?? null,
      hasSeoBasics: l.hasSeoBasics ?? null,
      hasSchemaMarkup: l.hasSchemaMarkup ?? null,
      hasAnalytics: l.hasAnalytics ?? null,
      isMobileReady: l.isMobileReady ?? null,
      facebookUrl: l.facebookUrl ?? null,
      instagramUrl: l.instagramUrl ?? null,
      techStack: l.techStack ?? null,
      digitalPresenceScore: l.digitalPresenceScore ?? null,
      businessScale: lead.businessScale,
      source: lead.provider,
    },
  });

  // Persist analysis result to the lead row.
  await withOrg(job.organizationId, (tx) =>
    tx.lead.update({
      where: { id: lead.id },
      data: {
        vibeAnalysis: {
          leadScore: result.leadScore,
          shouldContact: result.shouldContact,
          vibe: result.vibe,
          painPoints: result.painPoints,
          recommendedService: result.recommendedService,
          recommendedPackage: result.recommendedPackage,
          outreachAngle: result.outreachAngle,
          estimatedDealSize: result.estimatedDealSize,
          conversionProbability: result.conversionProbability,
          nextAction: result.nextAction,
          coldEmail: result.coldEmail,
          whatsappMessage: result.whatsappMessage,
          callScript: result.callScript,
          followUpMessage: result.followUpMessage,
          analyzedAt: new Date().toISOString(),
          aiProvider: result.provider,
          aiModel: result.model,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          costUsd: result.usage.costUsd,
        } as never,
      },
    }),
  );

  log.info(
    {
      leadScore: result.leadScore,
      provider: result.provider,
      model: result.model,
      tokens: result.usage.totalTokens,
      costUsd: result.usage.costUsd,
    },
    "vibe analysis complete",
  );
}

/**
 * vibe.prospectBulk
 *
 * Fans out a VibeProspectJob per lead sequentially to avoid hammering the
 * Anthropic API rate limit.  Workers can also parallelise this by increasing
 * the vibe queue concurrency.
 */
export async function runVibeProspectBulk(
  job: VibeProspectBulkJob,
): Promise<void> {
  const log = logger.child({
    job: "vibe.prospectBulk",
    orgId: job.organizationId,
    count: job.leadIds.length,
  });

  log.info("starting bulk vibe analysis");

  for (const leadId of job.leadIds) {
    try {
      await runVibeProspect({
        organizationId: job.organizationId,
        leadId,
        agencyName: job.agencyName,
        triggeredByUserId: job.triggeredByUserId,
      });
    } catch (err) {
      log.error(
        { leadId, err: (err as Error).message },
        "vibe prospect failed for lead",
      );
      // Continue with remaining leads — don't abort the whole batch.
    }
  }

  log.info("bulk vibe analysis complete");
}
