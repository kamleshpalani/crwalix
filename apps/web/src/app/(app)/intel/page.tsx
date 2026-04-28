import Link from 'next/link';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { intelService } from '@/server/services/intel.service';
import NoOrgBanner from '@/components/NoOrgBanner';

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

export default async function IntelListPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;
  const reports = await intelService.list(ctx.orgId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Website Intelligence</h1>
          <p className="mt-1 text-sm text-ink-600">
            Audit a business and its competitors. Identify conversion gaps and pitch concrete improvements.
          </p>
        </div>
        <Link
          href="/intel/new"
          className="rounded-md bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800"
        >
          New report
        </Link>
      </div>

      <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Data sources:</strong> public HTML on the analysed sites and the public Google Places listing.
        Visitor counts (e.g. Google Analytics) and third-party traffic estimates (e.g. SimilarWeb) are not
        connected — values labelled <em>Estimated</em> or <em>Not connected</em> in the report indicate this.
      </div>

      <ul className="mt-6 glass overflow-hidden divide-y divide-white/60">
        {reports.length === 0 && (
          <li className="p-4 text-sm text-ink-500">No reports yet. Click <strong>New report</strong> to start one.</li>
        )}
        {reports.map((r) => (
          <li key={r.id} className="p-4 hover:bg-white/70">
            <Link href={`/intel/${r.id}`} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{r.title}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-0.5 text-xs text-ink-500 truncate">{r.primaryUrl}</div>
                <div className="mt-1 text-xs text-ink-500">
                  {[r.category, r.city, r.country].filter(Boolean).join(' · ') || 'No context'}
                </div>
                {r.errorMessage && (
                  <div className="mt-1 text-xs text-rose-700">{r.errorMessage}</div>
                )}
              </div>
              <div className="text-xs text-ink-500 whitespace-nowrap">
                {new Date(r.createdAt).toLocaleString()}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
