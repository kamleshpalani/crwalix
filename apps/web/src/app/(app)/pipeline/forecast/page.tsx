import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import { forecastService } from "@/server/services/forecast.service";
import { crmService } from "@/server/services/crm.service";
import ForecastChart from "./ForecastChart";

/**
 * Phase 4.2 — pipeline forecast page.
 *
 * Renders P10/P50/P90 revenue forecasts (Monte-Carlo) for the next 30/60/90
 * days, plus per-stage diagnostics so users see why the model is calibrating
 * the way it is. The simulation runs server-side every request — it's cheap
 * enough that caching isn't worth the staleness.
 */
export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const horizonDays =
    typeof searchParams.horizon === "string"
      ? Math.max(7, Math.min(365, Number(searchParams.horizon) || 90))
      : 90;
  const pipelineId =
    typeof searchParams.pipelineId === "string"
      ? searchParams.pipelineId
      : undefined;

  const [pipelines, forecast] = await Promise.all([
    crmService.listPipelines(ctx.orgId),
    forecastService.run(ctx.orgId, { horizonDays, pipelineId }),
  ]);

  const fmt = (cents: number) =>
    `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM"
        title="Forecast"
        icon="M3 13l4-4 4 4 7-7M21 6v6h-6"
        description="Monte-Carlo revenue projection for open deals, blending stage probability with your historical close rates."
        chips={
          <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
            {forecast.totals.openDeals} deals · {horizonDays}-day horizon
          </span>
        }
      />

      {/* Horizon picker */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-500">Horizon:</span>
        {[30, 60, 90, 180].map((h) => (
          <a
            key={h}
            href={`?horizon=${h}${pipelineId ? `&pipelineId=${pipelineId}` : ""}`}
            className={`rounded-full px-3 py-1 ${
              horizonDays === h
                ? "bg-ink-900 text-white"
                : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
            }`}
          >
            {h}d
          </a>
        ))}
        {pipelines.length > 1 && (
          <>
            <span className="ml-4 text-ink-500">Pipeline:</span>
            <a
              href={`?horizon=${horizonDays}`}
              className={`rounded-full px-3 py-1 ${
                !pipelineId
                  ? "bg-ink-900 text-white"
                  : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
              }`}
            >
              All
            </a>
            {pipelines.map((p) => (
              <a
                key={p.id}
                href={`?horizon=${horizonDays}&pipelineId=${p.id}`}
                className={`rounded-full px-3 py-1 ${
                  pipelineId === p.id
                    ? "bg-ink-900 text-white"
                    : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
                }`}
              >
                {p.name}
              </a>
            ))}
          </>
        )}
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Weighted pipeline"
          value={fmt(forecast.totals.weightedPipelineCents)}
        />
        <Stat label="P10 (pessimistic)" value={fmt(forecast.totals.p10Cents)} />
        <Stat
          label="P50 (likely)"
          value={fmt(forecast.totals.p50Cents)}
          highlight
        />
        <Stat label="P90 (optimistic)" value={fmt(forecast.totals.p90Cents)} />
      </div>

      {/* Bucket chart */}
      {forecast.buckets.length > 0 && (
        <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink-700">
            Projected revenue by 30-day bucket
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            Shaded band: P10 → P90. Solid line: P50. {forecast.buckets.length}{" "}
            buckets across {horizonDays} days.
          </p>
          <div className="mt-4">
            <ForecastChart buckets={forecast.buckets} />
          </div>
        </section>
      )}

      {/* Top contributing deals */}
      <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-700">
          Top contributing open deals
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Sorted by expected value (amount × probability).
        </p>
        {forecast.topDeals.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">No open deals in scope.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="pb-2">Deal</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Probability</th>
                  <th className="pb-2">Expected value</th>
                  <th className="pb-2">Close date</th>
                </tr>
              </thead>
              <tbody>
                {forecast.topDeals.map((d) => (
                  <tr key={d.id} className="border-t border-ink-100">
                    <td className="py-2 font-medium text-ink-800">{d.title}</td>
                    <td className="py-2 text-ink-700">{fmt(d.amountCents)}</td>
                    <td className="py-2 text-ink-700">
                      {Math.round(d.probability * 100)}%
                    </td>
                    <td className="py-2 font-semibold text-ink-800">
                      {fmt(d.contributionCents)}
                    </td>
                    <td className="py-2 text-ink-500">
                      {d.expectedCloseAt
                        ? new Date(d.expectedCloseAt).toISOString().slice(0, 10)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Stage diagnostics */}
      <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-700">
          Stage calibration
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Each stage's blended close probability uses your configured value,
          refined by historical wins/losses over the last 180 days.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="pb-2">Stage</th>
                <th className="pb-2">Configured</th>
                <th className="pb-2">Historical</th>
                <th className="pb-2">Sample</th>
                <th className="pb-2">Blended</th>
                <th className="pb-2">Open</th>
                <th className="pb-2">Open value</th>
              </tr>
            </thead>
            <tbody>
              {forecast.stages.map((s) => (
                <tr key={s.stageId} className="border-t border-ink-100">
                  <td className="py-2 font-medium text-ink-800">
                    {s.stageName}
                  </td>
                  <td className="py-2 text-ink-700">
                    {Math.round(s.configuredProbability * 100)}%
                  </td>
                  <td className="py-2 text-ink-700">
                    {s.historicalWinRate === null
                      ? "—"
                      : `${Math.round(s.historicalWinRate * 100)}%`}
                  </td>
                  <td className="py-2 text-ink-500">{s.closedSampleSize}</td>
                  <td className="py-2 font-semibold text-ink-800">
                    {Math.round(s.blendedProbability * 100)}%
                  </td>
                  <td className="py-2 text-ink-700">{s.openDeals}</td>
                  <td className="py-2 text-ink-700">{fmt(s.openValueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-ink-400">
        Generated {new Date(forecast.generatedAt).toLocaleString()} · 4,000
        simulations
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        highlight
          ? "border-emerald-200 bg-emerald-50"
          : "border-ink-100 bg-white"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-ink-500">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          highlight ? "text-emerald-700" : "text-ink-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
