import { withOrg } from "@crawlix/db";
import { EnrichmentStatus, type EnrichmentJob } from "@crawlix/shared";
import { logger } from "../lib/logger";

/**
 * Module #4 — generic enrichment runner.
 *
 * Used for kinds that don't yet have a real provider integration
 * (EMAIL/EMAIL_VERIFY/SOCIAL/COMPANY/CONTACT). Marks the enrichment row as
 * SKIPPED with `provider_not_configured` so the UI can surface the gap and
 * future provider plug-ins can replace this stub by switching on `kind`.
 */
export async function runStubEnrichment(job: EnrichmentJob): Promise<void> {
  const startedAt = new Date();
  await withOrg(job.organizationId, (tx) =>
    tx.enrichment.update({
      where: { id: job.enrichmentId },
      data: {
        status: EnrichmentStatus.SKIPPED,
        startedAt,
        finishedAt: new Date(),
        attempts: { increment: 1 },
        error: "provider_not_configured",
        normalized: {
          reason: "No provider implementation for this kind yet.",
        } as unknown as object,
      },
    }),
  );
  logger.info(
    { enrichmentId: job.enrichmentId, kind: job.kind, leadId: job.leadId },
    "stub enrichment skipped",
  );
}
