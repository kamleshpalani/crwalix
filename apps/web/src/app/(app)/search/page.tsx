import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import { nlSearchService } from "@/server/services/nl-search.service";
import SearchInput from "./SearchInput";

/**
 * Phase 4.6 — Natural-language search.
 *
 * Type a question or filter in plain English ("hot leads in Texas with no
 * website added this month") and we'll convert it into a structured query,
 * run it across leads/deals/projects, and surface the results inline.
 */
export default async function NlSearchPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";

  const result = q ? await nlSearchService.run(ctx.orgId, q) : null;
  const fmtMoney = (cents: number, currency = "USD") =>
    `${currency === "USD" ? "$" : currency + " "}${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const examples = [
    "hot leads in California with no website",
    "won deals over $5k this quarter",
    "active projects created this month",
    "high-priority leads added this week",
    "open deals closing in the next 30 days",
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI"
        title="Ask anything"
        icon="M21 21l-4.3-4.3M11 18a7 7 0 110-14 7 7 0 010 14z"
        description="Search leads, deals, and projects in plain English. The AI converts your query into filters and runs them across your CRM."
      />

      <SearchInput initial={q} />

      {!q && (
        <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink-700">
            Try one of these
          </h2>
          <ul className="mt-3 space-y-2">
            {examples.map((ex) => (
              <li key={ex}>
                <a
                  href={`/search?q=${encodeURIComponent(ex)}`}
                  className="text-sm text-emerald-700 hover:underline"
                >
                  &ldquo;{ex}&rdquo;
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && (
        <>
          <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="text-xs uppercase tracking-wide text-emerald-700">
              How I read it
            </div>
            <p className="mt-1 text-sm text-emerald-900">
              {result.spec.interpretation}
            </p>
            <p className="mt-2 text-xs text-emerald-700">
              Searching: {result.spec.entities.join(", ") || "—"}
            </p>
          </section>

          {result.spec.entities.includes("leads") && (
            <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-ink-700">Leads</h2>
                <span className="text-xs text-ink-500">
                  {result.totals.leads.toLocaleString()} match
                  {result.totals.leads === 1 ? "" : "es"}
                  {result.totals.leads > result.leads.length
                    ? ` · showing ${result.leads.length}`
                    : ""}
                </span>
              </div>
              {result.leads.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">No leads match.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
                      <tr>
                        <th className="pb-2">Name</th>
                        <th className="pb-2">Location</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Tier</th>
                        <th className="pb-2">Score</th>
                        <th className="pb-2">Website</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.leads.map((l) => (
                        <tr key={l.id} className="border-t border-ink-100">
                          <td className="py-2">
                            <a
                              href={`/leads/${l.id}`}
                              className="font-medium text-ink-800 hover:text-emerald-700"
                            >
                              {l.name}
                            </a>
                          </td>
                          <td className="py-2 text-ink-600">
                            {[l.city, l.state].filter(Boolean).join(", ") ||
                              "—"}
                          </td>
                          <td className="py-2 text-ink-600">{l.status}</td>
                          <td className="py-2 text-ink-600">
                            {l.priorityTier ?? "—"}
                          </td>
                          <td className="py-2 text-ink-600">
                            {l.score ?? "—"}
                          </td>
                          <td className="py-2 text-ink-500">
                            {l.website ? "Yes" : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {result.spec.entities.includes("deals") && (
            <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-ink-700">Deals</h2>
                <span className="text-xs text-ink-500">
                  {result.totals.deals.toLocaleString()} match
                  {result.totals.deals === 1 ? "" : "es"}
                </span>
              </div>
              {result.deals.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">No deals match.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
                      <tr>
                        <th className="pb-2">Title</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Amount</th>
                        <th className="pb-2">Expected close</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.deals.map((d) => (
                        <tr key={d.id} className="border-t border-ink-100">
                          <td className="py-2 font-medium text-ink-800">
                            {d.title}
                          </td>
                          <td className="py-2 text-ink-600">{d.status}</td>
                          <td className="py-2 text-ink-700">
                            {fmtMoney(d.amountCents, d.currency)}
                          </td>
                          <td className="py-2 text-ink-500">
                            {d.expectedCloseAt
                              ? new Date(d.expectedCloseAt)
                                  .toISOString()
                                  .slice(0, 10)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {result.spec.entities.includes("projects") && (
            <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-ink-700">Projects</h2>
                <span className="text-xs text-ink-500">
                  {result.totals.projects.toLocaleString()} match
                  {result.totals.projects === 1 ? "" : "es"}
                </span>
              </div>
              {result.projects.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">No projects match.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {result.projects.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between border-t border-ink-100 pt-2 text-sm"
                    >
                      <a
                        href={`/projects/${p.id}`}
                        className="font-medium text-ink-800 hover:text-emerald-700"
                      >
                        {p.name}
                      </a>
                      <span className="text-xs text-ink-500">{p.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <p className="text-xs text-ink-400">
            {result.usage.totalTokens.toLocaleString()} tokens · ~$
            {result.usage.costUsd.toFixed(4)}
          </p>
        </>
      )}
    </div>
  );
}
