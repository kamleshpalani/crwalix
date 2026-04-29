import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { contractService } from "@/server/services/contract.service";
import ContractsClient from "./ContractsClient";

/**
 * Module #11 — Contracts & in-app e-sign.
 */
export default async function ContractsPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const contracts = await contractService.list(ctx.orgId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Contracts"
        icon="M9 12h6m-6 4h4M5 21h14a2 2 0 002-2V7l-5-5H5a2 2 0 00-2 2v14a2 2 0 002 2z"
        description="Draft, send, and collect signatures on contracts. Customer types their name on a public link to e-sign."
        chips={
          <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
            {contracts.length} total
          </span>
        }
      />
      {contracts.length === 0 ? (
        <EmptyState
          title="No contracts yet"
          description="Draft your first contract to send a counterparty a signable agreement."
        />
      ) : null}
      <ContractsClient initialContracts={contracts} />
    </div>
  );
}
