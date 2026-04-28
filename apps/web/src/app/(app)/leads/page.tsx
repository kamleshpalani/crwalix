import Link from 'next/link';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import NoOrgBanner from '@/components/NoOrgBanner';
import { Badge, priorityTone, websiteTone } from '@/components/Badge';
import { Pagination } from '@/components/Pagination';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { leadsService } from '@/server/services/leads.service';
import { parseLeadFilter, buildBaseHref } from '@/lib/filters';
import { getPriorityRecommendation, SERVICE_PITCH_LABELS, BUSINESS_SCALE_LABELS, type ServicePitch, type BusinessScale } from '@crawlix/shared';
import LeadFilters from './LeadFilters';
import LeadsBulkActions from './LeadsBulkActions';

export default async function LeadsPage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const filter = parseLeadFilter(searchParams);
  const { items, total, page, pageSize } = await leadsService.list(ctx.orgId, filter);

  const baseHref = buildBaseHref('/leads', filter);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pipeline"
        title="Leads"
        icon="M16 11a4 4 0 10-8 0 4 4 0 008 0zM3 21a9 9 0 0118 0"
        description="Enriched and scored local-business leads. Filter, prioritize, and ship the best to your CRM."
        chips={
          <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
            {total.toLocaleString()} total
          </span>
        }
        actions={
          <Link href="/exports" className="btn-ghost">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Export
          </Link>
        }
      />

      <div className="glass p-4">
        <LeadFilters />
      </div>

      {items.length > 0 && (
        <div>
          <LeadsBulkActions ids={items.map((l) => l.id)} />
        </div>
      )}

      {items.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon="M16 11a4 4 0 10-8 0 4 4 0 008 0zM3 21a9 9 0 0118 0"
            title="No leads match the current filter"
            description="Adjust your filters or run a new search to populate this list."
            action={
              <Link href="/searches" className="btn-primary">
                New search →
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="glass divide-y divide-white/60 overflow-hidden">
        {items.map((l) => {
          const score = l.score ?? l.scores[0]?.score ?? null;
          const rec = getPriorityRecommendation(l.priorityTier);
          return (
            <li key={l.id} className="p-5 transition hover:bg-white/70">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  data-lead-id={l.id}
                  className="mt-1 h-4 w-4 shrink-0"
                  aria-label={`Select ${l.name}`}
                />
                <Link href={`/leads/${l.id}`} className="block flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium text-ink-900 truncate">{l.name}</div>
                      <div className="mt-0.5 text-xs text-ink-500 truncate">
                        {[l.categoryPrimary, l.city, l.state, l.country]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {(() => {
                          const ageMs = Date.now() - new Date(l.createdAt).getTime();
                          if (ageMs < 7 * 24 * 60 * 60 * 1000) {
                            return <Badge tone="emerald">NEW</Badge>;
                          }
                          return null;
                        })()}
                        {l.priorityTier && (
                          <Badge tone={priorityTone(l.priorityTier)}>{rec.label}</Badge>
                        )}
                        <Badge tone={websiteTone(l.websiteStatus)}>
                          {l.websiteStatus.replaceAll('_', ' ').toLowerCase()}
                        </Badge>
                        {(() => {
                          const scale = (l as unknown as { businessScale?: string })
                            .businessScale;
                          if (!scale || scale === 'UNKNOWN') return null;
                          const tone =
                            scale === 'LARGE'
                              ? 'violet'
                              : scale === 'MID_MARKET'
                                ? 'amber'
                                : 'emerald';
                          return (
                            <Badge tone={tone}>
                              {BUSINESS_SCALE_LABELS[scale as BusinessScale] ?? scale}
                            </Badge>
                          );
                        })()}
                        {l.phone && (
                          <span className="text-xs text-ink-500">{l.phone}</span>
                        )}
                        {l.rating !== null && (
                          <span className="text-xs text-ink-500">
                            ★ {l.rating.toFixed(1)}
                            {l.reviewCount ? ` (${l.reviewCount})` : ''}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs italic text-ink-600">
                        Recommended action: {rec.action}
                      </div>
                      {Array.isArray((l as unknown as { servicePitch?: string[] }).servicePitch) && (l as unknown as { servicePitch: string[] }).servicePitch.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(l as unknown as { servicePitch: string[] }).servicePitch.map((p) => (
                            <span
                              key={p}
                              className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand"
                            >
                              {SERVICE_PITCH_LABELS[p as ServicePitch] ?? p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {score !== null && (
                      <Badge
                        tone={priorityTone(l.priorityTier)}
                        className="shrink-0 text-sm"
                      >
                        {score}
                      </Badge>
                    )}
                  </div>
                </Link>
              </div>
            </li>
          );
        })}
        </ul>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} baseHref={baseHref} />
    </div>
  );
}
