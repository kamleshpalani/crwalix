import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import { reportingService } from "@/server/services/reporting.service";
import RangePicker from "../RangePicker";

function fmtMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function SalesReportPage({
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
  const r = await reportingService.sales(ctx.orgId, range);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Sales"
        icon="M3 17l6-6 4 4 8-8"
        description={`Pipeline conversion and won revenue over the last ${range}.`}
        actions={<RangePicker base="/reports/sales" current={range} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="New deals" value={r.dealsCreated.toLocaleString()} />
        <Stat label="Won" value={r.dealsWon.toLocaleString()} />
        <Stat label="Win rate" value={`${r.winRatePct}%`} />
        <Stat label="Revenue won" value={fmtMoney(r.revenueWonCents)} />
      </div>

      <div className="glass rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-ink-700">
          Open pipeline by stage
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Total open value: {fmtMoney(r.pipelineOpenCents)} across{" "}
          {r.byStage.reduce((s, x) => s + x.count, 0)} deals.
        </p>
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2 text-right">Deals</th>
              <th className="px-3 py-2 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {r.byStage.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-ink-400">
                  No open deals.
                </td>
              </tr>
            ) : (
              r.byStage.map((s) => (
                <tr key={s.stageId} className="border-t border-white/40">
                  <td className="px-3 py-2 text-ink-700">{s.stageName}</td>
                  <td className="px-3 py-2 text-right">{s.count}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmtMoney(s.valueCents)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
