import Link from 'next/link';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import NoOrgBanner from '@/components/NoOrgBanner';
import { Badge, priorityTone, statusTone, websiteTone } from '@/components/Badge';
import { dashboardService } from '@/server/services/dashboard.service';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const stats = await dashboardService.stats(ctx.orgId);

  return (
    <div className="space-y-8">
      <div className="glass-lg relative overflow-hidden p-8">
        <div className="orb -right-10 -top-10 h-40 w-40 bg-brand-300/60" />
        <div className="orb -bottom-12 right-32 h-32 w-32 bg-fuchsia-300/50" />
        <div className="relative">
          <span className="label">Workspace overview</span>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink-900">
            Welcome back.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-600">
            Find, score, and export high-priority local-business leads. Your
            recent activity and top scored leads are below.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/searches" className="btn-primary">
              <span>New search</span>
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link href="/leads" className="btn-ghost">View leads</Link>
          </div>
        </div>
      </div>

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
          label="No website"
          value={stats.leadsNoWebsite}
          href="/leads?websiteStatus=HIGH_CONFIDENCE_NONE"
        />
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
            <p className="mt-3 text-sm text-ink-500">No runs yet.</p>
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
            <p className="mt-3 text-sm text-ink-500">No scored leads yet.</p>
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
      className="glass group p-4 transition hover:-translate-y-0.5 hover:shadow-glass-lg"
    >
      <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">{label}</div>
      <div className="mt-1 bg-gradient-to-br from-ink-900 to-ink-700 bg-clip-text text-3xl font-semibold tabular-nums text-transparent">
        {value}
      </div>
    </Link>
  );
}
