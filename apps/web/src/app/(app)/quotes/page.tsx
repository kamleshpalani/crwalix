import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { quoteService } from "@/server/services/quote.service";
import QuotesClient from "./QuotesClient";

/**
 * Module #10 — Quotes list + builder.
 */
export default async function QuotesPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const quotes = await quoteService.list(ctx.orgId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Quotes"
        icon="M9 12h6m-6 4h6M5 7h14M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z"
        description="Build line-item quotes with discounts and tax. Send a share link your customer can accept or decline."
        chips={
          <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
            {quotes.length} total
          </span>
        }
      />
      {quotes.length === 0 ? (
        <EmptyState
          title="No quotes yet"
          description="Create your first quote to send a customer a structured price proposal."
        />
      ) : null}
      <QuotesClient initialQuotes={quotes} />
    </div>
  );
}
