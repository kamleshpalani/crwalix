import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import { reportingService } from "@/server/services/reporting.service";
import RangePicker from "../RangePicker";

export default async function LeadsReportPage({
  searchParams,
}: Readonly<{
  searchParams: { range?: string };
}>) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const range = (["7d", "30d", "90d", "365d"] as const).includes(
    searchParams.range as never,
  )
    ? (searchParams.range as "7d" | "30d" | "90d" | "365d")
    : "30d";
  const report = await reportingService.leads(ctx.orgId, range);

  const maxBar = Math.max(1, ...report.trend.map((t) => t.count));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Leads"
        icon="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"
        description={`Lead intake and quality over the last ${range}.`}
        actions={<RangePicker base="/reports/leads" current={range} />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total leads" value={report.total.toLocaleString()} />
        <Stat
          label="Top source"
          value={report.bySource[0]?.source ?? "\u2014"}
        />
        <Stat
          label="Most common status"
          value={
            report.byStatus.sort((a, b) => b.count - a.count)[0]?.status ??
            "\u2014"
          }
        />
      </div>

      <div className="glass rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-ink-700">
          Daily intake trend
        </h2>
        <div className="mt-4 flex h-32 items-end gap-1">
          {report.trend.length === 0 ? (
            <p className="text-sm text-ink-400">No leads in this window.</p>
          ) : (
            report.trend.map((b) => (
              <div
                key={b.day}
                className="flex-1 rounded-t bg-brand-500/70"
                style={{ height: `${(b.count / maxBar) * 100}%` }}
                title={`${b.day}: ${b.count}`}
              />
            ))
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown
          title="By status"
          rows={report.byStatus.map((r) => ({
            label: r.status,
            count: r.count,
          }))}
        />
        <Breakdown
          title="By source"
          rows={report.bySource.map((r) => ({
            label: r.source,
            count: r.count,
          }))}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: Readonly<{ title: string; rows: Array<{ label: string; count: number }> }>) {
  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  return (
    <div className="glass rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-ink-700">{title}</h2>
      <ul className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <li className="text-sm text-ink-400">No data.</li>
        ) : (
          rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2 text-sm">
              <span className="w-32 truncate text-ink-700">{r.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded bg-ink-100">
                <div
                  className="h-full bg-brand-500"
                  style={{ width: `${(r.count / total) * 100}%` }}
                />
              </div>
              <span className="w-12 text-right font-mono text-xs text-ink-500">
                {r.count}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
