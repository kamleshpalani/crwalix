import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { supportService } from "@/server/services/support.service";
import SupportClient from "./SupportClient";

/**
 * Phase 4.4 + 4.5 — Support inbox + RAG agent.
 *
 * Three columns:
 *   - Knowledge base manager (add/list articles)
 *   - Ticket inbox (open conversations)
 *   - Agent test bench (ask any question, see citations + confidence)
 */
export default async function SupportPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const [articles, tickets] = await Promise.all([
    supportService.listArticles(ctx.orgId),
    supportService.listTickets(ctx.orgId),
  ]);

  const totalArticles = articles.length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Support"
        title="Inbox & AI agent"
        icon="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
        description="Curate your knowledge base, manage open tickets, and let the AI agent draft answers grounded in your docs."
        chips={
          <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
            {totalArticles} article{totalArticles === 1 ? "" : "s"} ·{" "}
            {tickets.length} ticket
            {tickets.length === 1 ? "" : "s"}
          </span>
        }
      />

      {totalArticles === 0 && tickets.length === 0 ? (
        <EmptyState
          title="No knowledge yet"
          description="Add your first article so the agent has something to ground its answers in."
        />
      ) : null}

      <SupportClient initialArticles={articles} initialTickets={tickets} />
    </div>
  );
}
