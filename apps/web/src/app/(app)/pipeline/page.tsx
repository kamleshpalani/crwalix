import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { crmService } from "@/server/services/crm.service";
import PipelineBoard from "./PipelineBoard";
import NewDealButton from "./NewDealButton";

/**
 * CRM Kanban page. Loads pipelines + their open deals server-side so the
 * board paints with no flash, then hands off to a client component for
 * drag-drop. RLS is enforced inside `crmService` via `withOrg`.
 */
export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const pipelines = await crmService.listPipelines(ctx.orgId);

  if (pipelines.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="CRM"
          title="Pipeline"
          icon="M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4"
          description="Drag deals between stages to update their status."
        />
        <EmptyState
          title="No pipeline yet"
          description="A default pipeline is created automatically the first time the CRM is used. Refresh to provision one."
        />
      </div>
    );
  }

  // Pick active pipeline from query (?pipelineId=…) or fall back to default.
  const requested =
    typeof searchParams.pipelineId === "string"
      ? searchParams.pipelineId
      : undefined;
  const active =
    pipelines.find((p) => p.id === requested) ??
    pipelines.find((p) => p.isDefault) ??
    pipelines[0]!;

  // Page-1, generous size: the kanban shows ALL open deals; pagination would
  // hide cards mid-column which is unhelpful for a sales board.
  const { items: deals } = await crmService.listDeals(ctx.orgId, {
    pipelineId: active.id,
    page: 1,
    pageSize: 200,
    sort: "-updatedAt",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM"
        title="Pipeline"
        icon="M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4"
        description="Drag deals between stages to update their status. Stage changes are logged in the deal's activity timeline."
        chips={
          <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
            {deals.length.toLocaleString()} open · {active.name}
          </span>
        }
        actions={<NewDealButton pipeline={active} />}
      />

      <PipelineBoard pipeline={active} deals={deals} />
    </div>
  );
}
