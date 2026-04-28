import Link from 'next/link';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import NoOrgBanner from '@/components/NoOrgBanner';
import { Badge, priorityTone, statusTone, websiteTone } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { dashboardService } from '@/server/services/dashboard.service';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const stats = await dashboardService.stats(ctx.orgId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace overview"
        title="Welcome back."
        icon="M3 12l9-9 9 9M5 10v10h14V10"
        description="Find, score, and export high-priority local-business leads. Your recent activity and top scored leads are below."
        actions={
          <>
            <Link href="/searches" className="btn-primary">
              <span>New search</span>
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link href="/leads" className="btn-ghost">View leads</Link>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Projects" value={stats.projects} href="/projects" />
        <Stat label="Searches" value={stats.searches} href="/searches" />
        <Stat label="Leads" value={stats.leadsTotal} href="/leads" />
        <Stat
          label="High priority"
          value={stats.leadsHigh}
          href="/leads?priorityTier=HIGH"
        />
        <Stat
          label="New (7d)"
          value={stats.leadsNew}
          href="/leads?discoveredWithin=7d"
        />
      </section>

      <section>
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-sm font-semibold text-ink-900">Pitch opportunities</h2>
          <span className="text-xs text-ink-500">click any tile to see matching leads</span>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat
            label="No website"
            value={stats.leadsNoWebsite}
            href="/leads?websiteStatus=LIKELY_NONE&websiteStatus=HIGH_CONFIDENCE_NONE"
          />
          <Stat
            label="Social-only"
            value={stats.leadsSocialOnly}
            href="/leads?socialOnly=true"
          />
          <Stat
            label="Broken / unreachable"
            value={stats.leadsBroken}
            href="/leads?websiteHealth=UNREACHABLE"
          />
          <Stat
            label="Outdated site"
            value={stats.leadsOutdated}
            href="/leads?websiteHealth=OUTDATED"
          />
          <Stat
            label="No booking / contact form"
            value={stats.leadsNoForm}
            href="/leads?missingForm=any"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900">Recent search runs</h2>
            <Link href="/searches" className="text-xs text-ink-500 hover:text-ink-900">
              All →
            </Link>
          </div>
          {stats.recentRuns.length === 0 ? (
            <EmptyState
              icon="M21 21l-4.3-4.3M11 18a7 7 0 110-14 7 7 0 010 14z"
              title="No runs yet"
              description="Launch a search to start collecting leads."
            />
          ) : (
            <ul className="mt-3 divide-y divide-white/60 text-sm">
              {stats.recentRuns.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5">
                  <Link
                    href={`/searches/${r.search.id}`}
                    className="min-w-0 hover:underline"
                  >
                    <div className="truncate font-medium text-ink-900">{r.search.name}</div>
                    <div className="text-xs text-ink-500">
                      {r.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                      {' · '}
                      {r.totalInserted} new / {r.totalFetched} fetched
                    </div>
                  </Link>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900">Top scored leads</h2>
            <Link href="/leads?sort=-score" className="text-xs text-ink-500 hover:text-ink-900">
              All →
            </Link>
          </div>
          {stats.topLeads.length === 0 ? (
            <EmptyState
              icon="M11 17l-5-5 5-5M6 12h12"
              title="No scored leads yet"
              description="Run a search and the highest-scoring leads will appear here."
            />
          ) : (
            <ul className="mt-3 divide-y divide-white/60 text-sm">
              {stats.topLeads.map((l) => (
                <li key={l.id} className="flex items-center justify-between py-2.5">
                  <Link href={`/leads/${l.id}`} className="min-w-0 hover:underline">
                    <div className="truncate font-medium text-ink-900">{l.name}</div>
                    <div className="text-xs text-ink-500">
                      {[l.city, l.country].filter(Boolean).join(', ') || '—'}
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Badge tone={websiteTone(l.websiteStatus)}>
                      {l.websiteStatus.replaceAll('_', ' ').toLowerCase()}
                    </Badge>
                    <Badge tone={priorityTone(l.priorityTier)}>{l.score}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="glass p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">
              Newly discovered businesses
              <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                last 7 days
              </span>
            </h2>
            <p className="text-xs text-ink-500">
              Surfaced by your scheduled searches across providers.
            </p>
          </div>
          <Link href="/leads?discoveredWithin=7d" className="text-xs text-ink-500 hover:text-ink-900">
            All →
          </Link>
        </div>
        {stats.newlyDiscovered.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">
            Nothing new in the last 7 days. Schedule a recurring search from the
            New Search form to start tracking.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-white/60 text-sm">
            {stats.newlyDiscovered.map((l) => {
              const ageHours = Math.round(
                (Date.now() - new Date(l.createdAt).getTime()) / 3_600_000
              );
              const ageLabel = ageHours < 24 ? `${ageHours}h ago` : `${Math.round(ageHours / 24)}d ago`;
              return (
                <li key={l.id} className="flex items-center justify-between py-2.5">
                  <Link href={`/leads/${l.id}`} className="min-w-0 flex-1 hover:underline">
                    <div className="truncate font-medium text-ink-900">{l.name}</div>
                    <div className="text-xs text-ink-500">
                      {[l.city, l.country].filter(Boolean).join(', ') || '—'}
                      {' · '}
                      {l.provider}
                      {' · '}
                      {ageLabel}
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    {l.priorityTier && (
                      <Badge tone={priorityTone(l.priorityTier)}>{l.priorityTier}</Badge>
                    )}
                    <Badge tone={websiteTone(l.websiteStatus)}>
                      {l.websiteStatus.replaceAll('_', ' ').toLowerCase()}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  href
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="glass group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-glass-lg"
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br from-brand-300/30 to-fuchsia-300/30 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />
      <div className="relative">
        <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">{label}</div>
        <div className="mt-1 bg-gradient-to-br from-brand-600 via-ink-900 to-fuchsia-600 bg-clip-text text-3xl font-bold tabular-nums text-transparent">
          {value}
        </div>
      </div>
    </Link>
  );
}
