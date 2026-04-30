import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { auditService } from "@/server/services/audit.service";
import AuditClient from "./AuditClient";

/**
 * Module #20 — Audit log viewer.
 */
export default async function AuditPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const entries = await auditService.list(ctx.orgId, { limit: 200 });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compliance"
        title="Audit log"
        icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        description="Every signed contract, sent invoice, payment, and settings change is recorded here."
        chips={
          <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
            {entries.length} entries
          </span>
        }
      />
      {entries.length === 0 ? (
        <EmptyState
          title="No audit events yet"
          description="Activity will appear here as your team uses Crawlix."
        />
      ) : (
        <AuditClient initialEntries={entries} />
      )}
    </div>
  );
}
