import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import {
  Badge,
  priorityTone,
  statusTone,
  websiteTone,
  websiteHealthTone,
} from "@/components/Badge";
import { leadsService } from "@/server/services/leads.service";
import {
  getPriorityRecommendation,
  SERVICE_PITCH_LABELS,
  BUSINESS_SCALE_LABELS,
  type ServicePitch,
  type BusinessScale,
} from "@crawlix/shared";
import LeadStatusControl from "./LeadStatusControl";
import LeadNotes from "./LeadNotes";
import LeadTags from "./LeadTags";
import AuditWebsiteButton from "./AuditWebsiteButton";
import LeadContactEdit from "./LeadContactEdit";
import ConvertToDealButton from "./ConvertToDealButton";

export default async function LeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const lead = await leadsService.get(ctx.orgId, params.id);
  if (!lead) notFound();

  // Cast to expose schema fields added in migration 0005. Once the Prisma
  // client is regenerated against the new schema these casts become no-ops.
  const l = lead as typeof lead & {
    ownerName: string | null;
    email: string | null;
    facebookUrl: string | null;
    instagramUrl: string | null;
    googleProfileUrl: string | null;
    servicePitch: string[];
    businessScale: BusinessScale | string | null;
    businessScaleConfidence: number | null;
    businessScaleSignals: unknown;
  };

  const score = lead.score ?? lead.scores[0]?.score ?? null;
  const rawBreakdown =
    (lead.scoreBreakdown as unknown) ??
    (lead.scores[0]?.breakdown as unknown) ??
    null;
  const breakdownRows: Array<{
    ruleId: string;
    reason: string;
    contribution: number;
  }> = Array.isArray(rawBreakdown)
    ? (rawBreakdown as Array<Record<string, unknown>>).map((r) => ({
        ruleId: String(r.ruleId ?? r.rule ?? ""),
        reason: String(r.reason ?? ""),
        contribution: Number(r.contribution ?? r.value ?? 0),
      }))
    : rawBreakdown && typeof rawBreakdown === "object"
      ? Object.entries(rawBreakdown as Record<string, unknown>).map(
          ([k, v]) => ({
            ruleId: k,
            reason: "",
            contribution: typeof v === "number" ? v : Number(v) || 0,
          }),
        )
      : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/leads" className="text-sm text-ink-500 hover:text-ink-900">
          ← Leads
        </Link>
        <div className="mt-2 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{lead.name}</h1>
            <p className="mt-1 text-sm text-ink-600">
              {[
                lead.categoryPrimary,
                lead.address,
                lead.city,
                lead.state,
                lead.country,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {lead.priorityTier && (
                <Badge tone={priorityTone(lead.priorityTier)}>
                  {getPriorityRecommendation(lead.priorityTier).label}
                </Badge>
              )}
              <Badge tone={websiteTone(lead.websiteStatus)}>
                {lead.websiteStatus.replaceAll("_", " ").toLowerCase()}
              </Badge>
              <Badge tone={statusTone(lead.status)}>{lead.status}</Badge>
              <Badge tone="slate">via {lead.provider}</Badge>
              {l.businessScale && l.businessScale !== "UNKNOWN" && (
                <Badge
                  tone={
                    l.businessScale === "LARGE"
                      ? "violet"
                      : l.businessScale === "MID_MARKET"
                        ? "amber"
                        : "emerald"
                  }
                >
                  {BUSINESS_SCALE_LABELS[l.businessScale as BusinessScale] ??
                    l.businessScale}
                </Badge>
              )}
            </div>
            {lead.priorityTier && (
              <p className="mt-2 text-sm text-ink-700">
                <span className="font-medium">Recommended action:</span>{" "}
                {getPriorityRecommendation(lead.priorityTier).action}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <LeadStatusControl leadId={lead.id} current={lead.status} />
              <ConvertToDealButton leadId={lead.id} leadName={lead.name} />
            </div>
          </div>
          {score !== null && (
            <div className="glass p-4 text-center">
              <div className="text-3xl font-semibold">{score}</div>
              <div className="text-xs uppercase tracking-wide text-ink-500">
                Score
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Contact">
          <Field label="Owner" value={l.ownerName} />
          <Field label="Phone" value={lead.phone} />
          <Field
            label="Email"
            value={
              l.email ? (
                <a href={`mailto:${l.email}`} className="text-brand underline">
                  {l.email}
                </a>
              ) : null
            }
          />
          <Field
            label="Website"
            value={
              lead.website ? (
                <a
                  href={lead.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline"
                >
                  {lead.website}
                </a>
              ) : null
            }
          />
          <Field
            label="Facebook"
            value={
              l.facebookUrl ? (
                <a
                  href={l.facebookUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline"
                >
                  {l.facebookUrl}
                </a>
              ) : null
            }
          />
          <Field
            label="Instagram"
            value={
              l.instagramUrl ? (
                <a
                  href={l.instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline"
                >
                  {l.instagramUrl}
                </a>
              ) : null
            }
          />
          <Field
            label="Google profile"
            value={
              l.googleProfileUrl ? (
                <a
                  href={l.googleProfileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline"
                >
                  Open in Google Maps
                </a>
              ) : null
            }
          />
          <Field label="Address" value={lead.address} />
          <Field label="Postal code" value={lead.postalCode} />
          <div className="pt-2">
            <LeadContactEdit
              lead={{
                id: lead.id,
                ownerName: l.ownerName,
                phone: lead.phone,
                email: l.email,
                website: lead.website,
                facebookUrl: l.facebookUrl,
                instagramUrl: l.instagramUrl,
                googleProfileUrl: l.googleProfileUrl,
                address: lead.address,
                postalCode: lead.postalCode,
              }}
            />
          </div>
        </Card>
        <Card title="Signals">
          <Field
            label="Rating"
            value={
              lead.rating !== null
                ? `${lead.rating.toFixed(1)} ★ (${lead.reviewCount ?? 0} reviews)`
                : null
            }
          />
          <Field label="Business status" value={lead.businessStatus} />
          <Field label="Data source" value={formatProvider(lead.provider)} />
          <Field
            label="First seen"
            value={lead.firstSeenAt.toISOString().slice(0, 10)}
          />
          <Field
            label="Last seen"
            value={lead.lastSeenAt.toISOString().slice(0, 10)}
          />
          <Field
            label="Last enriched"
            value={
              lead.lastEnrichedAt
                ? lead.lastEnrichedAt
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")
                : null
            }
          />
        </Card>
      </section>

      {breakdownRows.length > 0 && (
        <Card title="Score breakdown">
          <ul className="divide-y divide-white/60 text-sm">
            {breakdownRows.map((row, i) => (
              <li
                key={`${row.ruleId}-${i}`}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-ink-900">
                    {row.reason || row.ruleId.replaceAll("_", " ")}
                  </div>
                  {row.reason && row.ruleId && (
                    <div className="text-[11px] text-ink-500">{row.ruleId}</div>
                  )}
                </div>
                <span
                  className={
                    "font-mono text-sm shrink-0 " +
                    (row.contribution > 0
                      ? "text-emerald-700"
                      : row.contribution < 0
                        ? "text-rose-700"
                        : "text-ink-500")
                  }
                >
                  {row.contribution > 0 ? "+" : ""}
                  {row.contribution}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Tags">
        <LeadTags leadId={lead.id} initial={lead.tags ?? []} />
      </Card>

      {Array.isArray(l.servicePitch) && l.servicePitch.length > 0 && (
        <Card title="Recommended pitches">
          <div className="flex flex-wrap gap-2">
            {l.servicePitch.map((p: string) => (
              <Badge key={p} tone="violet">
                {SERVICE_PITCH_LABELS[p as ServicePitch] ?? p}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <BusinessScaleCard
        scale={l.businessScale ?? null}
        confidence={l.businessScaleConfidence ?? null}
        signals={l.businessScaleSignals}
      />

      <WebsiteAuditCard lead={lead} />

      <Card title="Notes">
        <LeadNotes leadId={lead.id} initial={lead.notes ?? null} />
      </Card>

      <Card title={`Enrichments (${lead.enrichments.length})`}>
        {lead.enrichments.length === 0 ? (
          <p className="text-sm text-ink-500">No enrichments yet.</p>
        ) : (
          <ul className="divide-y divide-white/60">
            {lead.enrichments.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{e.kind}</div>
                  <div className="text-xs text-ink-500">{e.provider}</div>
                </div>
                <Badge tone={statusTone(e.status)}>{e.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Source runs (${lead.sources.length})`}>
        {lead.sources.length === 0 ? (
          <p className="text-sm text-ink-500">No source runs.</p>
        ) : (
          <ul className="divide-y divide-white/60">
            {lead.sources.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div>
                  <Link
                    href={`/searches/${s.searchRun.searchId}`}
                    className="font-medium hover:underline"
                  >
                    {s.searchRun.search.name}
                  </Link>
                  <div className="text-xs text-ink-500">
                    {s.provider} · {s.createdAt.toISOString().slice(0, 10)}
                  </div>
                </div>
                <Badge tone={statusTone(s.searchRun.status)}>
                  {s.searchRun.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title={`Merge history (${(lead.mergeHistoryAsCanonical ?? []).length})`}
      >
        {(lead.mergeHistoryAsCanonical ?? []).length === 0 ? (
          <p className="text-sm text-ink-500">
            No duplicates merged into this lead yet.
          </p>
        ) : (
          <ul className="divide-y divide-white/60">
            {(lead.mergeHistoryAsCanonical ?? []).map((m) => {
              const conf = Math.round((m.confidence ?? 0) * 100);
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium">
                      {m.reason.replaceAll("_", " ")}
                      <span className="ml-2 text-xs text-ink-500 font-mono">
                        {conf}%
                      </span>
                    </div>
                    <div className="text-xs text-ink-500">
                      {[m.fromProvider, m.fromExternalId]
                        .filter(Boolean)
                        .join(" · ") || "manual"}
                      {" · "}
                      {m.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </div>
                  </div>
                  <Badge tone={mergeTone(conf)}>{m.reason}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {lead.provider === "google_places" && (
        <p className="text-xs text-ink-500">
          Business data powered by Google. Cached fields are refreshed or
          cleared after 30 days in line with the Google Maps Platform terms of
          service.
        </p>
      )}
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass p-4">
      <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function mergeTone(conf: number): "emerald" | "amber" | "slate" {
  if (conf >= 90) return "emerald";
  if (conf >= 70) return "amber";
  return "slate";
}

type BusinessScaleSignalsPayload = {
  reasoning?: string;
  signals?: Array<{ signal?: string; weight?: number; scale?: string }>;
};

function BusinessScaleCard({
  scale,
  confidence,
  signals,
}: {
  scale: BusinessScale | string | null;
  confidence: number | null;
  signals: unknown;
}) {
  const payload = (signals ?? null) as BusinessScaleSignalsPayload | null;
  const list = Array.isArray(payload?.signals) ? payload!.signals! : [];
  const tone =
    scale === "LARGE" ? "violet" : scale === "MID_MARKET" ? "amber" : "emerald";
  return (
    <div className="glass p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">Business scale</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={scale && scale !== "UNKNOWN" ? tone : "slate"}>
              {BUSINESS_SCALE_LABELS[(scale as BusinessScale) ?? "UNKNOWN"] ??
                "Unclassified"}
            </Badge>
            {typeof confidence === "number" && confidence > 0 && (
              <span className="text-xs text-ink-600">
                confidence <span className="font-mono">{confidence}/100</span>
              </span>
            )}
          </div>
          {payload?.reasoning && (
            <p className="mt-2 text-sm text-ink-700">{payload.reasoning}</p>
          )}
        </div>
      </div>
      {list.length > 0 && (
        <ul className="mt-3 divide-y divide-white/60 text-xs">
          {list.slice(0, 8).map((s, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 py-1.5"
            >
              <span className="text-ink-700">{s.signal}</span>
              <span className="text-ink-500 font-mono">
                {s.scale} +{s.weight}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  google_places: "Google Places",
  yelp_fusion: "Yelp Fusion",
  osm: "OpenStreetMap",
  foursquare: "Foursquare",
  bing: "Bing Maps",
  here: "HERE Maps",
  tomtom: "TomTom",
  geoapify: "Geoapify",
  manual: "Manual entry",
  csv_import: "CSV import",
};
function formatProvider(p: string | null): string | null {
  if (!p) return null;
  return PROVIDER_LABELS[p] ?? p.replaceAll("_", " ");
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-ink-500">{label}</span>
      <span className="text-right text-ink-900 break-words">
        {value ?? <span className="text-ink-400">—</span>}
      </span>
    </div>
  );
}

type WebsiteAuditCategoryPayload = {
  status?: "pass" | "warn" | "fail" | "skipped";
  label?: string;
  findings?: string[];
};

type WebsiteAuditPayload = {
  signals?: Record<string, unknown>;
  issues?: string[];
  categories?: Record<string, WebsiteAuditCategoryPayload>;
  outreachFit?: {
    suitable?: boolean;
    reason?: string;
    opportunityScore?: number;
  };
};

function WebsiteAuditCard({
  lead,
}: {
  lead: {
    id: string;
    website: string | null;
    websiteHealth?: string | null;
    websiteHealthScore?: number | null;
    websiteAudit?: unknown;
    websiteAuditedAt?: Date | null;
  };
}) {
  const health = lead.websiteHealth ?? "NOT_AUDITED";
  const audit = (lead.websiteAudit ?? null) as WebsiteAuditPayload | null;
  const issues = Array.isArray(audit?.issues)
    ? (audit!.issues as string[])
    : [];
  const categories = audit?.categories ?? null;
  const fit = audit?.outreachFit ?? null;
  const auditedAt = lead.websiteAuditedAt
    ? new Date(lead.websiteAuditedAt)
        .toISOString()
        .slice(0, 16)
        .replace("T", " ")
    : null;

  const categoryOrder: Array<keyof NonNullable<typeof categories>> = [
    "design",
    "mobile",
    "performance",
    "seo",
    "contact",
    "security",
    "business",
  ];

  return (
    <div className="glass p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">Website audit</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={websiteHealthTone(health)}>
              {health.replaceAll("_", " ").toLowerCase()}
            </Badge>
            {typeof lead.websiteHealthScore === "number" && (
              <span className="text-xs text-ink-600">
                health score{" "}
                <span className="font-mono">{lead.websiteHealthScore}/100</span>
              </span>
            )}
            {auditedAt && (
              <span className="text-xs text-ink-500">audited {auditedAt}</span>
            )}
          </div>
        </div>
        <AuditWebsiteButton
          leadId={lead.id}
          hasWebsite={Boolean(lead.website)}
        />
      </div>

      {fit && (
        <div
          className={
            "mt-3 rounded-md border px-3 py-2 text-sm " +
            (fit.suitable
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-slate-200 bg-slate-50 text-ink-700")
          }
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">
              {fit.suitable
                ? "Suitable to contact"
                : "Not a strong fit for outreach"}
            </span>
            {typeof fit.opportunityScore === "number" && (
              <span className="text-xs text-ink-600">
                opportunity{" "}
                <span className="font-mono">{fit.opportunityScore}/100</span>
              </span>
            )}
          </div>
          {fit.reason && <div className="mt-1 text-xs">{fit.reason}</div>}
        </div>
      )}

      {categories && (
        <ul className="mt-3 divide-y divide-white/60">
          {categoryOrder.map((key) => {
            const c = categories[key];
            if (!c) return null;
            const tone =
              c.status === "pass"
                ? "emerald"
                : c.status === "warn"
                  ? "amber"
                  : c.status === "skipped"
                    ? "slate"
                    : "rose";
            return (
              <li key={key} className="py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink-900">
                    {c.label ?? key}
                  </span>
                  <span
                    className={
                      "text-[11px] uppercase tracking-wide font-mono " +
                      (tone === "emerald"
                        ? "text-emerald-700"
                        : tone === "amber"
                          ? "text-amber-700"
                          : tone === "slate"
                            ? "text-ink-500"
                            : "text-rose-700")
                    }
                  >
                    {c.status === "skipped"
                      ? "not measured"
                      : (c.status ?? "unknown")}
                  </span>
                </div>
                {Array.isArray(c.findings) && c.findings.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-600">
                    {c.findings.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!categories && issues.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-700">
          {issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}
      {!categories && issues.length === 0 && health !== "NOT_AUDITED" && (
        <p className="mt-3 text-sm text-ink-500">No issues detected.</p>
      )}
      {health === "NOT_AUDITED" && (
        <p className="mt-3 text-sm text-ink-500">
          {lead.website
            ? "Run an audit to detect outdated tech stacks, missing mobile viewports, dead pages, and more."
            : "No website on file — nothing to audit."}
        </p>
      )}
    </div>
  );
}
