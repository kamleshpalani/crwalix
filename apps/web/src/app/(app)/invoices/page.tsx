import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { invoiceService } from "@/server/services/invoice.service";
import InvoicesClient from "./InvoicesClient";

/**
 * Module #14 — Self-hosted customer invoicing.
 */
export default async function InvoicesPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const invoices = await invoiceService.list(ctx.orgId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Billing"
        title="Invoices"
        icon="M9 14h6m-6 4h6M5 21h14a2 2 0 002-2V7l-5-5H5a2 2 0 00-2 2v14a2 2 0 002 2z"
        description="Issue invoices for project work. Send a share link, track open balance, and mark paid manually or via Stripe Checkout."
        chips={
          <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
            {invoices.length} total
          </span>
        }
      />
      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Issue your first invoice to a customer."
        />
      ) : null}
      <InvoicesClient initialInvoices={invoices} />
    </div>
  );
}
