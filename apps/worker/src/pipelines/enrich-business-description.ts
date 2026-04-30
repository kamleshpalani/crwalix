import { withOrg } from "@crawlix/db";
import { aiComplete } from "@crawlix/ai";
import { EnrichmentStatus, type EnrichmentJob } from "@crawlix/shared";
import { logger } from "../lib/logger";

/**
 * §8.1 — Enrichment pipeline: BUSINESS_DESCRIPTION
 *
 * Uses the AI router to generate a 2–3 sentence business description from
 * the lead's publicly available signals (name, category, city, website health,
 * tech stack, rating). Writes the result to `lead.businessDescription`.
 */
export async function runBusinessDescriptionEnrichment(
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
        categories: true,
        city: true,
        state: true,
        country: true,
        rating: true,
        reviewCount: true,
        websiteHealth: true,
        techStack: true,
        businessScale: true,
        openingHours: true,
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

  const locationParts = [lead.city, lead.state, lead.country].filter(Boolean);
  const location = locationParts.join(", ") || "unknown location";
  const category = lead.categoryPrimary ?? lead.categories[0] ?? "business";
  let ratingStr: string | null = null;
  if (lead.rating && lead.reviewCount) {
    ratingStr = `rated ${lead.rating.toFixed(1)}/5 from ${lead.reviewCount} reviews`;
  } else if (lead.rating) {
    ratingStr = `rated ${lead.rating.toFixed(1)}/5`;
  }
  const techStr = lead.techStack?.length
    ? `Technology stack: ${lead.techStack.slice(0, 5).join(", ")}.`
    : "";
  const websiteStr =
    lead.websiteHealth && lead.websiteHealth !== "NOT_AUDITED"
      ? `Website health: ${lead.websiteHealth.toLowerCase().replaceAll("_", " ")}.`
      : "";
  const scaleStr =
    lead.businessScale && lead.businessScale !== "UNKNOWN"
      ? `Business scale: ${lead.businessScale.toLowerCase().replaceAll("_", " ")}.`
      : "";

  const prompt = [
    `Write a concise 2–3 sentence business description for the following local business.`,
    `Return only the description text — no introduction, no labels, no markdown.`,
    ``,
    `Business name: ${lead.name}`,
    `Category: ${category}`,
    `Location: ${location}`,
    ratingStr ? `Public rating: ${ratingStr}` : null,
    techStr,
    websiteStr,
    scaleStr,
  ]
    .filter(Boolean)
    .join("\n");

  let description: string;
  try {
    const result = await aiComplete({
      taskKind: "lead.score",
      organizationId: job.organizationId,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 200,
    });
    description = result.content.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { enrichmentId: job.enrichmentId, leadId: job.leadId, err: msg },
      "business description AI call failed",
    );
    await withOrg(job.organizationId, (tx) =>
      tx.enrichment.update({
        where: { id: job.enrichmentId },
        data: {
          status: EnrichmentStatus.FAILED,
          finishedAt: new Date(),
          error: msg,
        },
      }),
    );
    return;
  }

  await withOrg(job.organizationId, async (tx) => {
    await tx.lead.update({
      where: { id: job.leadId },
      data: {
        businessDescription: description,
        lastEnrichedAt: new Date(),
      },
    });
    await tx.enrichment.update({
      where: { id: job.enrichmentId },
      data: {
        status: EnrichmentStatus.SUCCEEDED,
        finishedAt: new Date(),
        normalized: { businessDescription: description } as unknown as object,
      },
    });
  });

  logger.info(
    { enrichmentId: job.enrichmentId, leadId: job.leadId },
    "business description enrichment complete",
  );
}
