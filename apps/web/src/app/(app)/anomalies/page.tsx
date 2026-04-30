import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { anomaliesService } from "@/server/services/anomalies.service";

/**
 * Phase 4.3 — anomaly inbox.
 *
 * Surfaces signals that need human attention before they hurt revenue:
 * stale deals, pipeline drought, reply-rate collapse, bounce spikes,
 * lead-quality drops, dead leads, and subscription churn risk.
 */
export default async function AnomaliesPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const anomalies = await anomaliesService.detectAll(ctx.orgId);

  const critical = anomalies.filter((a) => a.severity === "critical");
  const warning = anomalies.filter((a) => a.severity === "warning");
  const info = anomalies.filter((a) => a.severity === "info");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insights"
        title="Anomalies"
        icon="M12 9v2m0 4h.01M4.93 19h14.14a2 2 0 001.74-3l-7.07-12a2 2 0 00-3.48 0L3.19 16a2 2 0 001.74 3z"
        description="Issues we noticed across your pipeline, outreach, and account health. Tackle critical items first."
        chips={
          <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
            {anomalies.length} signal{anomalies.length === 1 ? "" : "s"}
          </span>
        }
      />

      {anomalies.length === 0 ? (
        <EmptyState
          title="Nothing unusual"
          description="Your pipeline, outreach, and account look healthy. We'll surface anything that needs attention here."
        />
      ) : (
        <div className="space-y-6">
          {critical.length > 0 && (
            <Section label="Critical" rows={critical} tone="critical" />
          )}
          {warning.length > 0 && (
            <Section label="Warnings" rows={warning} tone="warning" />
          )}
          {info.length > 0 && (
            <Section label="For your awareness" rows={info} tone="info" />
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  rows,
  tone,
}: {
  label: string;
  rows: Array<{
    id: string;
    title: string;
    description: string;
    href?: string;
  }>;
  tone: "critical" | "warning" | "info";
}) {
  const styles = {
    critical: {
      border: "border-rose-200",
      bg: "bg-rose-50",
      dot: "bg-rose-500",
      label: "text-rose-700",
    },
    warning: {
      border: "border-amber-200",
      bg: "bg-amber-50",
      dot: "bg-amber-500",
      label: "text-amber-800",
    },
    info: {
      border: "border-ink-200",
      bg: "bg-white",
      dot: "bg-ink-400",
      label: "text-ink-600",
    },
  }[tone];

  return (
    <section className="space-y-3">
      <h2
        className={`text-xs font-semibold uppercase tracking-wide ${styles.label}`}
      >
        {label}
      </h2>
      <div className="space-y-3">
        {rows.map((a) => (
          <div
            key={a.id}
            className={`flex items-start gap-3 rounded-2xl border ${styles.border} ${styles.bg} p-4 shadow-sm`}
          >
            <span
              className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot}`}
            />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-ink-900">{a.title}</h3>
              <p className="mt-1 text-sm text-ink-700">{a.description}</p>
            </div>
            {a.href && (
              <a
                href={a.href}
                className="shrink-0 rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50"
              >
                Investigate →
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
