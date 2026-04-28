import Link from 'next/link';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import NoOrgBanner from '@/components/NoOrgBanner';
import { intelService, type IntelSummaryPayload, type IntelSiteSummary } from '@/server/services/intel.service';
import RebuildIntelButton from './RebuildIntelButton';
import PrintButton from './PrintButton';

export const dynamic = 'force-dynamic';

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'complete' ? 'bg-emerald-100 text-emerald-800' :
    status === 'running' ? 'bg-blue-100 text-blue-800' :
    status === 'failed' ? 'bg-rose-100 text-rose-800' :
    'bg-amber-100 text-amber-800';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {status}
    </span>
  );
}

function ScorePill({ value }: { value: number }) {
  const tone =
    value >= 75 ? 'bg-emerald-100 text-emerald-900' :
    value >= 50 ? 'bg-amber-100 text-amber-900' :
    'bg-rose-100 text-rose-900';
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {value}
    </span>
  );
}

function SiteCard({ site, isPrimary }: { site: IntelSiteSummary; isPrimary: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${isPrimary ? 'border-ink-900 bg-white' : 'border-white/60 bg-white/70'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-ink-500">
            {isPrimary ? 'Your site' : 'Competitor'}
          </div>
          <div className="mt-0.5 truncate font-medium">{site.name}</div>
          <a href={site.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-blue-700 hover:underline">
            {site.url}
          </a>
        </div>
        <ScorePill value={site.scores.overall} />
      </div>
      {site.screenshotUrl && (
        <div className="mt-3 overflow-hidden rounded border border-ink-200 bg-ink-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={site.screenshotUrl}
            alt={`${site.name} screenshot`}
            loading="lazy"
            className="block h-32 w-full object-cover object-top"
          />
        </div>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-ink-500">Health</dt><dd className="text-right font-medium">{site.scores.health}</dd>
        <dt className="text-ink-500">Conversion</dt><dd className="text-right font-medium">{site.scores.conversion}</dd>
        <dt className="text-ink-500">SEO</dt><dd className="text-right font-medium">{site.scores.seo}</dd>
        <dt className="text-ink-500">Mobile</dt><dd className="text-right font-medium">{site.scores.mobile}</dd>
        <dt className="text-ink-500">Performance</dt><dd className="text-right font-medium">{site.scores.performance}</dd>
        <dt className="text-ink-500">Security</dt><dd className="text-right font-medium">{site.scores.security}</dd>
      </dl>
      {site.pageSpeed && (
        <div className="mt-3 rounded border border-ink-200 bg-ink-50/60 p-2">
          <div className="text-xs font-semibold text-ink-700">PageSpeed (mobile)</div>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            {site.pageSpeed.performance != null && (<><dt className="text-ink-500">Performance</dt><dd className="text-right font-medium">{site.pageSpeed.performance}</dd></>)}
            {site.pageSpeed.lcpSeconds != null && (<><dt className="text-ink-500">LCP</dt><dd className="text-right font-medium">{site.pageSpeed.lcpSeconds.toFixed(1)}s</dd></>)}
            {site.pageSpeed.cls != null && (<><dt className="text-ink-500">CLS</dt><dd className="text-right font-medium">{site.pageSpeed.cls.toFixed(2)}</dd></>)}
            {site.pageSpeed.inpMs != null && (<><dt className="text-ink-500">INP</dt><dd className="text-right font-medium">{Math.round(site.pageSpeed.inpMs)}ms</dd></>)}
          </dl>
        </div>
      )}
      {site.contacts && (site.contacts.primaryEmail || site.contacts.decisionMakerName) && (
        <div className="mt-3 rounded border border-emerald-200 bg-emerald-50/70 p-2 text-xs">
          <div className="font-semibold text-emerald-800">Decision-maker contact</div>
          {site.contacts.decisionMakerName && (
            <div className="mt-0.5 text-ink-800">{site.contacts.decisionMakerName}</div>
          )}
          {site.contacts.primaryEmail && (
            <a href={`mailto:${site.contacts.primaryEmail}`} className="break-all text-blue-700 hover:underline">
              {site.contacts.primaryEmail}
            </a>
          )}
          {site.contacts.emailStatus && (
            <span className={`ml-2 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              site.contacts.emailStatus === 'valid' ? 'bg-emerald-200 text-emerald-900'
              : site.contacts.emailStatus === 'risky' ? 'bg-amber-200 text-amber-900'
              : site.contacts.emailStatus === 'invalid' ? 'bg-rose-200 text-rose-900'
              : 'bg-ink-200 text-ink-700'
            }`}>{site.contacts.emailStatus}</span>
          )}
          {site.contacts.source && (
            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-500">via {site.contacts.source}</div>
          )}
        </div>
      )}
      {site.strengths.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-emerald-800">Strengths</div>
          <ul className="mt-1 list-disc pl-5 text-xs text-ink-700">
            {site.strengths.slice(0, 6).map((s, i) => (<li key={i}>{s}</li>))}
          </ul>
        </div>
      )}
      {site.weaknesses.length > 0 && (
        <div className="mt-2">
          <div className="text-xs font-semibold text-rose-800">Gaps</div>
          <ul className="mt-1 list-disc pl-5 text-xs text-ink-700">
            {site.weaknesses.slice(0, 6).map((s, i) => (<li key={i}>{s}</li>))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default async function IntelDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const data = await intelService.get(ctx.orgId, params.id);
  if (!data) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Report not found</h1>
        <Link href="/intel" className="mt-2 inline-block text-sm text-blue-700 hover:underline">Back to reports</Link>
      </div>
    );
  }
  const { report, competitors } = data;
  const summary = (report.summaryJson as unknown as IntelSummaryPayload | null) ?? null;
  const cohort = summary ? [summary.primary, ...summary.competitors] : [];

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold truncate">{report.title}</h1>
            <StatusBadge status={report.status} />
          </div>
          <a href={report.primaryUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-sm text-blue-700 hover:underline">
            {report.primaryUrl}
          </a>
          <div className="mt-1 text-xs text-ink-500">
            {[report.category, report.city, report.country].filter(Boolean).join(' · ') || 'No context'}
            {' · '}
            {summary ? `Generated ${new Date(summary.generatedAt).toLocaleString()}` : `Created ${new Date(report.createdAt).toLocaleString()}`}
          </div>
          {report.errorMessage && (
            <div className="mt-2 rounded-md bg-rose-50 p-2 text-sm text-rose-800">{report.errorMessage}</div>
          )}
        </div>
        <div className="no-print flex shrink-0 gap-2">
          <RebuildIntelButton id={report.id} />
          <PrintButton />
          <Link href="/intel" className="rounded-md border border-white/60 bg-white px-3 py-2 text-sm hover:bg-white/80">Back</Link>
        </div>
      </div>

      {!summary && report.status !== 'failed' && (
        <div className="glass p-4 text-sm text-ink-600">
          The report is being built. Refresh in a minute to see results.
        </div>
      )}

      {summary && (
        <>
          {/* Disclaimers */}
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>Important:</strong> all findings are inferred from publicly available data only.
            <ul className="mt-1 list-disc pl-5">
              {summary.disclaimers.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </div>

          {/* Site cards */}
          <section>
            <h2 className="text-lg font-semibold">Sites at a glance</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <SiteCard site={summary.primary} isPrimary />
              {summary.competitors.map((c) => (
                <SiteCard key={c.id} site={c} isPrimary={false} />
              ))}
            </div>
            {summary.competitors.length === 0 && (
              <p className="mt-2 text-xs text-ink-500">No competitors were analysed.</p>
            )}
          </section>

          {/* Comparison table */}
          <section>
            <h2 className="text-lg font-semibold">Side-by-side comparison</h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-white/60 bg-white/70">
              <table className="min-w-full text-sm">
                <thead className="bg-white/60 text-left">
                  <tr>
                    <th className="px-3 py-2">Metric</th>
                    {cohort.map((s) => (
                      <th key={s.id} className="px-3 py-2 text-center">{s.name}</th>
                    ))}
                    <th className="px-3 py-2">Leader</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/60">
                  {Object.entries(summary.comparison).map(([metric, row]) => (
                    <tr key={metric}>
                      <td className="px-3 py-2 font-medium">{metric}</td>
                      {cohort.map((s) => {
                        const v = row.values[s.name];
                        const isLeader = row.leader === s.name;
                        return (
                          <td key={s.id} className={`px-3 py-2 text-center ${isLeader ? 'font-semibold text-emerald-800' : ''}`}>
                            {typeof v === 'number' ? v : (v ?? '—')}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-emerald-800">{row.leader}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Gap analysis */}
          <section>
            <h2 className="text-lg font-semibold">Gap analysis</h2>
            {summary.gaps.length === 0 ? (
              <p className="mt-2 text-sm text-ink-600">No major feature gaps versus competitors detected.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {summary.gaps.map((g, i) => (
                  <li key={i} className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{g}</li>
                ))}
              </ul>
            )}
          </section>

          {/* Recommendations */}
          <section>
            <h2 className="text-lg font-semibold">Recommendations</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-emerald-800">Quick wins</h3>
                <ul className="mt-2 space-y-2">
                  {summary.recommendations.filter((r) => r.kind === 'quick_win').map((r, i) => (
                    <li key={i} className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
                      <div className="font-semibold">{r.title}</div>
                      <div className="mt-0.5 text-ink-700">{r.detail}</div>
                    </li>
                  ))}
                  {summary.recommendations.filter((r) => r.kind === 'quick_win').length === 0 && (
                    <li className="text-sm text-ink-500">None — quick wins look healthy.</li>
                  )}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-blue-800">Strategic</h3>
                <ul className="mt-2 space-y-2">
                  {summary.recommendations.filter((r) => r.kind === 'strategic').map((r, i) => (
                    <li key={i} className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
                      <div className="font-semibold">{r.title}</div>
                      <div className="mt-0.5 text-ink-700">{r.detail}</div>
                    </li>
                  ))}
                  {summary.recommendations.filter((r) => r.kind === 'strategic').length === 0 && (
                    <li className="text-sm text-ink-500">None — no major strategic gaps.</li>
                  )}
                </ul>
              </div>
            </div>
          </section>

          {/* Traffic placeholder */}
          <section>
            <h2 className="text-lg font-semibold">Traffic & visitor analytics</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-md border border-ink-200 bg-white/70 p-3 text-sm">
                <div className="text-xs uppercase text-ink-500">Actual visitor data</div>
                <div className="mt-1 font-medium">Not connected — connect Google Analytics</div>
                <p className="mt-1 text-ink-600">
                  Once a Google Analytics property is linked, real session counts, bounce rate, and goal conversions will appear here.
                </p>
              </div>
              <div className="rounded-md border border-ink-200 bg-white/70 p-3 text-sm">
                <div className="text-xs uppercase text-ink-500">Estimated traffic</div>
                <div className="mt-1 font-medium">Estimated traffic not configured</div>
                <p className="mt-1 text-ink-600">
                  Third-party traffic estimates (e.g. SimilarWeb) require an API key. Until configured, traffic is not estimated.
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Per-competitor row diagnostics for failed audits */}
      {competitors.some((c) => c.status === 'failed') && (
        <section>
          <h2 className="text-lg font-semibold">Audit issues</h2>
          <ul className="mt-3 space-y-2">
            {competitors.filter((c) => c.status === 'failed').map((c) => (
              <li key={c.id} className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                <div className="font-semibold">{c.name ?? c.url}</div>
                <div className="text-xs">{c.errorMessage ?? 'audit failed'}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
