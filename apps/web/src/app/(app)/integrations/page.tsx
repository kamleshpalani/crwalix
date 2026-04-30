import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import {
  integrationService,
  PROVIDER_CATALOG,
} from "@/server/services/integration.service";
import IntegrationsClient from "./IntegrationsClient";

/**
 * Module #21 — Integrations hub.
 */
export default async function IntegrationsPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const integrations = await integrationService.list(ctx.orgId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Connect"
        title="Integrations"
        icon="M13 10V3L4 14h7v7l9-11h-7z"
        description="Connect Crawlix to the rest of your stack — CRMs, mailboxes, chat, and webhooks."
        chips={
          <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
            {integrations.filter((i) => i.status === "CONNECTED").length}{" "}
            connected
          </span>
        }
      />
      <IntegrationsClient
        initialIntegrations={integrations}
        catalog={PROVIDER_CATALOG}
      />
    </div>
  );
}
