import { withOrg } from "@crawlix/db";
import { auditWebsiteWithAi, type WebsiteAiReport } from "@crawlix/ai";
import { EnrichmentStatus, type EnrichmentJob } from "@crawlix/shared";
import { logger } from "../lib/logger";
import type { WebsiteAuditResult } from "./enrich-website";

/**
 * §9.3 — Enrichment pipeline: ENRICH_WEBSITE_REPORT
 *
 * Reads the persisted `websiteAudit` JSON blob on the lead, passes the
 * audit signals to the AI router (task: "website.audit"), and stores the
 * structured report in `lead.websiteAiReport`.
 */
export async function runWebsiteReportEnrichment(
  job: EnrichmentJob,
): Promise<void> {
  const startedAt = new Date();

  await withOrg(job.organizationId, (tx) =>
    tx.enrichment.update({
      where: { id: job.enrichmentId },
      data: {
        status: EnrichmentStatus.RUNNING,
        startedAt,
        attempts: { increment: 1 },
      },
    }),
  );

  const lead = await withOrg(job.organizationId, (tx) =>
    tx.lead.findFirst({
      where: { id: job.leadId, organizationId: job.organizationId },
      select: {
        name: true,
        categoryPrimary: true,
        city: true,
        country: true,
        website: true,
        rating: true,
        reviewCount: true,
        websiteAudit: true,
        websiteClassification: true,
      },
    }),
  );

  if (!lead) {
    await withOrg(job.organizationId, (tx) =>
      tx.enrichment.update({
        where: { id: job.enrichmentId },
        data: {
          status: EnrichmentStatus.FAILED,
          finishedAt: new Date(),
          error: "LEAD_NOT_FOUND",
        },
      }),
    );
    return;
  }

  if (!lead.websiteAudit) {
    logger.warn(
      { jobId: job.enrichmentId, leadId: job.leadId },
      "ENRICH_WEBSITE_REPORT: no websiteAudit JSON on lead — skipping",
    );
    await withOrg(job.organizationId, (tx) =>
      tx.enrichment.update({
        where: { id: job.enrichmentId },
        data: {
          status: EnrichmentStatus.SKIPPED,
          finishedAt: new Date(),
          error: "NO_WEBSITE_AUDIT",
        },
      }),
    );
    return;
  }

  const audit = lead.websiteAudit as unknown as WebsiteAuditResult;

  let report: WebsiteAiReport;
  let aiProvider: string;
  let aiModel: string;

  try {
    const aiResult = await auditWebsiteWithAi({
      organizationId: job.organizationId,
      lead: {
        name: lead.name,
        category: lead.categoryPrimary,
        city: lead.city,
        country: lead.country,
        website: lead.website,
        rating: lead.rating,
        reviewCount: lead.reviewCount,
      },
      auditIssues: audit.issues ?? [],
      auditCategories: audit.categories as Record<
        string,
        { status: "pass" | "warn" | "fail"; findings: string[] }
      >,
      healthScore: audit.healthScore ?? 0,
      websiteClassification: lead.websiteClassification ?? "WEBSITE_FOUND",
    });

    report = aiResult.report;
    aiProvider = aiResult.provider;
    aiModel = aiResult.model;
  } catch (err) {
    logger.error(
      { jobId: job.enrichmentId, leadId: job.leadId, err },
      "ENRICH_WEBSITE_REPORT: AI call failed",
    );
    await withOrg(job.organizationId, (tx) =>
      tx.enrichment.update({
        where: { id: job.enrichmentId },
        data: {
          status: EnrichmentStatus.FAILED,
          finishedAt: new Date(),
          error: err instanceof Error ? err.message : "AI_ERROR",
        },
      }),
    );
    return;
  }

  await withOrg(job.organizationId, (tx) =>
    tx.$transaction([
      tx.lead.update({
        where: { id: job.leadId },
        data: {
          // §9.3 — AI-generated website audit report (full JSON)
          websiteAiReport: report as unknown as object,
        },
      }),
      tx.enrichment.update({
        where: { id: job.enrichmentId },
        data: {
          status: EnrichmentStatus.SUCCEEDED,
          finishedAt: new Date(),
          normalized: {
            report,
            aiProvider,
            aiModel,
          } as unknown as object,
        },
      }),
    ]),
  );

  logger.info(
    {
      jobId: job.enrichmentId,
      leadId: job.leadId,
      overallScore: report.overallScore,
      suggestedPackage: report.suggestedPackage,
    },
    "ENRICH_WEBSITE_REPORT: completed",
  );
}
