import Link from 'next/link';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { intelService } from '@/server/services/intel.service';
import NoOrgBanner from '@/components/NoOrgBanner';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';

export const dynamic = 'force-dynamic';

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'complete'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'running'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : status === 'failed'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export default async function IntelListPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;
  const reports = await intelService.list(ctx.orgId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Competitive analysis"
        title="Website Intelligence"
        icon="M3 12h3m12 0h3M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6l2.1-2.1M12 8a4 4 0 100 8 4 4 0 000-8z"
        description="Audit a business and its competitors. Identify conversion gaps and pitch concrete improvements."
        actions={
          <Link href="/intel/new" className="btn-primary">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            New report
          </Link>
        }
      />

      <div className="glass-soft flex items-start gap-3 p-4 text-xs text-amber-900">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path
              d="M12 9v4m0 4h.01M10.3 3.86l-7.5 13A2 2 0 004.5 20h15a2 2 0 001.7-3.14l-7.5-13a2 2 0 00-3.4 0z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div>
          <strong className="font-semibold">Data sources:</strong> public HTML on the analysed
          sites and the public Google Places listing. Visitor counts (e.g. Google Analytics)
          and third-party traffic estimates (e.g. SimilarWeb) are not connected — values labelled{' '}
          <em>Estimated</em> or <em>Not connected</em> in the report indicate this.
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon="M3 12h3m12 0h3M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6l2.1-2.1M12 8a4 4 0 100 8 4 4 0 000-8z"
            title="No reports yet"
            description="Click New report to analyse a website and its competitors."
            action={
              <Link href="/intel/new" className="btn-primary">
                New report →
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="glass divide-y divide-white/60 overflow-hidden">
          {reports.map((r) => (
            <li key={r.id} className="transition hover:bg-white/70">
              <Link
                href={`/intel/${r.id}`}
                className="flex items-start justify-between gap-4 p-5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-ink-900">{r.title}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-1 truncate text-xs text-brand-600">{r.primaryUrl}</div>
                  <div className="mt-1 text-xs text-ink-500">
                    {[r.category, r.city, r.country].filter(Boolean).join(' · ') || 'No context'}
                  </div>
                  {r.errorMessage && (
                    <div className="mt-1 text-xs text-rose-700">{r.errorMessage}</div>
                  )}
                </div>
                <div className="shrink-0 whitespace-nowrap text-xs text-ink-500">
                  {new Date(r.createdAt).toLocaleString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
