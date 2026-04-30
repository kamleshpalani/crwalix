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

export default async function BillingReportPage({
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
  const r = await reportingService.billing(ctx.orgId, range);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Billing"
        icon="M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z"
        description={`Invoicing, collections, and recurring revenue over the last ${range}.`}
        actions={<RangePicker base="/reports/billing" current={range} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Invoices" value={r.invoiceCount.toLocaleString()} />
        <Stat label="Invoiced" value={fmtMoney(r.invoicedCents)} />
        <Stat label="Collected" value={fmtMoney(r.collectedCents)} />
        <Stat
          label="Outstanding"
          value={fmtMoney(r.outstandingCents)}
          accent={r.overdueCents > 0 ? "rose" : undefined}
          sub={
            r.overdueCents > 0
              ? `${fmtMoney(r.overdueCents)} overdue`
              : undefined
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink-700">
            Recurring revenue
          </h2>
          <p className="mt-2 text-3xl font-semibold text-ink-900">
            {fmtMoney(r.mrrCents)}
            <span className="ml-1 text-sm font-normal text-ink-500">/ mo</span>
          </p>
          <p className="mt-1 text-xs text-ink-500">
            {r.activeSubscriptions} active subscription
            {r.activeSubscriptions === 1 ? "" : "s"}.
          </p>
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2 text-right">Subs</th>
                <th className="px-3 py-2 text-right">MRR</th>
              </tr>
            </thead>
            <tbody>
              {r.byPlan.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-6 text-center text-ink-400"
                  >
                    No active subscriptions.
                  </td>
                </tr>
              ) : (
                r.byPlan.map((p) => (
                  <tr key={p.plan} className="border-t border-white/40">
                    <td className="px-3 py-2 text-ink-700">{p.plan}</td>
                    <td className="px-3 py-2 text-right">{p.count}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmtMoney(p.mrrCents)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="glass rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink-700">Payments</h2>
          <p className="mt-2 text-3xl font-semibold text-ink-900">
            {r.paymentsCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            successful captures in the window.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  sub,
}: Readonly<{
  label: string;
  value: string;
  accent?: "rose";
  sub?: string;
}>) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          accent === "rose" ? "text-rose-600" : "text-ink-900"
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-rose-600">{sub}</p> : null}
    </div>
  );
}
