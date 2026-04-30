import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { enrichmentService } from "@/server/services/enrichment.service";
import EnrichmentsClient from "./EnrichmentsClient";

/**
 * Module #4 — Lead enrichment pipeline.
 */
export default async function EnrichmentsPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const [enrichments, counts] = await Promise.all([
    enrichmentService.list(ctx.orgId, { limit: 200 }),
    enrichmentService.summary(ctx.orgId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data"
        title="Enrichment"
        icon="M19 11a7 7 0 11-14 0 7 7 0 0114 0zM12 4v3m0 8v3m4-7h3m-14 0h3"
        description="Queue website audits, email verification, social discovery, and company data enrichment for your leads."
        chips={
          <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
            {enrichments.length} recent
          </span>
        }
      />
      {enrichments.length === 0 ? (
        <EmptyState
          title="No enrichments yet"
          description="Queue your first enrichment from a lead row or in bulk."
        />
      ) : null}
      <EnrichmentsClient
        initialEnrichments={enrichments}
        initialCounts={counts}
      />
    </div>
  );
}
