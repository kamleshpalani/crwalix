import { withOrg } from "@crawlix/db";
import { aiComplete } from "@crawlix/ai";
import { EnrichmentStatus, type EnrichmentJob } from "@crawlix/shared";
import { logger } from "../lib/logger";

/**
 * §8.1 — Enrichment pipeline: REVIEW_SUMMARY
 *
 * Generates an AI review summary that synthesises what the business's public
 * rating and review count implies about customer satisfaction. Writes the
 * result to `lead.reviewSummary`.
 *
 * When there are no reviews available the row is marked SKIPPED rather than
 * failing, because lack of reviews is a valid data state (not an error).
 */
export async function runReviewSummaryEnrichment(
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
        rating: true,
        reviewCount: true,
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

  // Nothing to summarise without at least a rating.
  if (!lead.rating && !lead.reviewCount) {
    await withOrg(job.organizationId, (tx) =>
      tx.enrichment.update({
        where: { id: job.enrichmentId },
        data: {
          status: EnrichmentStatus.SKIPPED,
          finishedAt: new Date(),
          error: "no_review_data",
          normalized: {
            reason: "Lead has no rating or review count.",
          } as unknown as object,
        },
      }),
    );
    logger.info(
      { enrichmentId: job.enrichmentId, leadId: job.leadId },
      "review summary skipped: no review data",
    );
    return;
  }

  const ratingLine = lead.rating
    ? `Rating: ${lead.rating.toFixed(1)} / 5`
    : "No numeric rating available";
  const reviewLine = lead.reviewCount
    ? `Number of reviews: ${lead.reviewCount}`
    : "Review count not available";
  const category = lead.categoryPrimary ?? "local business";
  const locationParts = [lead.city, lead.country].filter(Boolean);
  const location = locationParts.join(", ") || "unknown location";

  const prompt = [
    `Summarise the customer satisfaction of the following local business in 1–2 sentences.`,
    `Base your answer ONLY on the data provided (rating + review count).`,
    `Do not speculate. Return only the summary text — no labels, no markdown.`,
    ``,
    `Business: ${lead.name} (${category}, ${location})`,
    ratingLine,
    reviewLine,
  ].join("\n");

  let summary: string;
  try {
    const result = await aiComplete({
      taskKind: "lead.score",
      organizationId: job.organizationId,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 150,
    });
    summary = result.content.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { enrichmentId: job.enrichmentId, leadId: job.leadId, err: msg },
      "review summary AI call failed",
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
        reviewSummary: summary,
        lastEnrichedAt: new Date(),
      },
    });
    await tx.enrichment.update({
      where: { id: job.enrichmentId },
      data: {
        status: EnrichmentStatus.SUCCEEDED,
        finishedAt: new Date(),
        normalized: { reviewSummary: summary } as unknown as object,
      },
    });
  });

  logger.info(
    { enrichmentId: job.enrichmentId, leadId: job.leadId },
    "review summary enrichment complete",
  );
}
