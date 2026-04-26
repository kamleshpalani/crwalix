import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import NoOrgBanner from '@/components/NoOrgBanner';
import {
  Badge,
  priorityTone,
  statusTone,
  websiteTone,
  websiteHealthTone
} from '@/components/Badge';
import { leadsService } from '@/server/services/leads.service';
import { getPriorityRecommendation } from '@crawlix/shared';
import LeadStatusControl from './LeadStatusControl';
import LeadNotes from './LeadNotes';
import LeadTags from './LeadTags';
import AuditWebsiteButton from './AuditWebsiteButton';

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const lead = await leadsService.get(ctx.orgId, params.id);
  if (!lead) notFound();

  const score = lead.score ?? lead.scores[0]?.score ?? null;
  const breakdown =
    (lead.scoreBreakdown as Record<string, number> | null) ??
    (lead.scores[0]?.breakdown as Record<string, number> | null) ??
    null;

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
              {[lead.categoryPrimary, lead.address, lead.city, lead.state, lead.country]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {lead.priorityTier && (
                <Badge tone={priorityTone(lead.priorityTier)}>
                  {getPriorityRecommendation(lead.priorityTier).label}
                </Badge>
              )}
              <Badge tone={websiteTone(lead.websiteStatus)}>
                {lead.websiteStatus.replaceAll('_', ' ').toLowerCase()}
              </Badge>
              <Badge tone={statusTone(lead.status)}>{lead.status}</Badge>
              <Badge tone="slate">via {lead.provider}</Badge>
            </div>
            {lead.priorityTier && (
              <p className="mt-2 text-sm text-ink-700">
                <span className="font-medium">Recommended action:</span>{' '}
                {getPriorityRecommendation(lead.priorityTier).action}
              </p>
            )}
            <div className="mt-3">
              <LeadStatusControl leadId={lead.id} current={lead.status} />
            </div>
          </div>
          {score !== null && (
            <div className="glass p-4 text-center">
              <div className="text-3xl font-semibold">{score}</div>
              <div className="text-xs uppercase tracking-wide text-ink-500">Score</div>
            </div>
          )}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Contact">
          <Field label="Phone" value={lead.phone} />
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
          <Field label="Address" value={lead.address} />
          <Field label="Postal code" value={lead.postalCode} />
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
          <Field label="First seen" value={lead.firstSeenAt.toISOString().slice(0, 10)} />
          <Field label="Last seen" value={lead.lastSeenAt.toISOString().slice(0, 10)} />
          <Field
            label="Last enriched"
            value={lead.lastEnrichedAt ? lead.lastEnrichedAt.toISOString().slice(0, 16).replace('T', ' ') : null}
          />
        </Card>
      </section>

      {breakdown && (
        <Card title="Score breakdown">
          <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {Object.entries(breakdown).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between rounded bg-white/40 px-3 py-1.5">
                <span className="text-ink-600">{k}</span>
                <span className="font-mono">{typeof v === 'number' ? v : JSON.stringify(v)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Tags">
        <LeadTags leadId={lead.id} initial={lead.tags ?? []} />
      </Card>

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
              <li key={e.id} className="flex items-center justify-between py-2 text-sm">
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
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
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
                <Badge tone={statusTone(s.searchRun.status)}>{s.searchRun.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {lead.provider === 'google_places' && (
        <p className="text-xs text-ink-500">
          Business data powered by Google. Cached fields are refreshed or
          cleared after 30 days in line with the Google Maps Platform terms of
          service.
        </p>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass p-4">
      <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-ink-500">{label}</span>
      <span className="text-right text-ink-900 break-words">{value ?? <span className="text-ink-400">—</span>}</span>
    </div>
  );
}

type WebsiteAuditPayload = {
  signals?: Record<string, unknown>;
  issues?: string[];
};

function WebsiteAuditCard({
  lead
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
  const health = lead.websiteHealth ?? 'NOT_AUDITED';
  const audit = (lead.websiteAudit ?? null) as WebsiteAuditPayload | null;
  const issues = Array.isArray(audit?.issues) ? (audit!.issues as string[]) : [];
  const auditedAt = lead.websiteAuditedAt
    ? new Date(lead.websiteAuditedAt).toISOString().slice(0, 16).replace('T', ' ')
    : null;

  return (
    <div className="glass p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">Website audit</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={websiteHealthTone(health)}>
              {health.replaceAll('_', ' ').toLowerCase()}
            </Badge>
            {typeof lead.websiteHealthScore === 'number' && (
              <span className="text-xs text-ink-600">
                health score <span className="font-mono">{lead.websiteHealthScore}/100</span>
              </span>
            )}
            {auditedAt && (
              <span className="text-xs text-ink-500">audited {auditedAt}</span>
            )}
          </div>
        </div>
        <AuditWebsiteButton leadId={lead.id} hasWebsite={Boolean(lead.website)} />
      </div>

      {issues.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-700">
          {issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}
      {issues.length === 0 && health !== 'NOT_AUDITED' && (
        <p className="mt-3 text-sm text-ink-500">No issues detected.</p>
      )}
      {health === 'NOT_AUDITED' && (
        <p className="mt-3 text-sm text-ink-500">
          {lead.website
            ? 'Run an audit to detect outdated tech stacks, missing mobile viewports, dead pages, and more.'
            : 'No website on file — nothing to audit.'}
        </p>
      )}
    </div>
  );
}
