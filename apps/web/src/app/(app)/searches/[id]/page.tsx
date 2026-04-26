import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import NoOrgBanner from '@/components/NoOrgBanner';
import { Badge, statusTone } from '@/components/Badge';
import { searchesService } from '@/server/services/searches.service';
import { withOrg } from '@crawlix/db';
import SearchDetailControls from './SearchDetailControls';

export const dynamic = 'force-dynamic';

export default async function SearchDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const search = await searchesService.get(ctx.orgId, params.id);
  if (!search) notFound();

  const leadCount = await withOrg(ctx.orgId, (tx) =>
    tx.lead.count({
      where: { sources: { some: { searchRun: { searchId: search.id } } } }
    })
  );

  const latest = search.runs[0];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/searches" className="text-sm text-ink-500 hover:text-ink-900">
          ← Searches
        </Link>
        <div className="mt-2 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{search.name}</h1>
            <p className="mt-1 text-sm text-ink-600">
              Project:{' '}
              <Link href={`/projects/${search.projectId}`} className="hover:underline">
                {search.project.name}
              </Link>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone="slate">{search.provider}</Badge>
              {latest && <Badge tone={statusTone(latest.status)}>{latest.status}</Badge>}
              <Badge tone="slate">limit {search.resultLimit}</Badge>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <Link
              href={`/leads?searchId=${search.id}`}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-white/70"
            >
              View leads ({leadCount})
            </Link>
            <SearchDetailControls
              searchId={search.id}
              latestStatus={latest?.status ?? null}
              latestRunId={latest?.id ?? null}
            />
          </div>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Query">
          <Field label="Keyword" value={search.keyword} />
          <Field label="Niche" value={search.niche} />
          <Field
            label="Location"
            value={[search.city, search.state, search.country, search.postalCode].filter(Boolean).join(', ')}
          />
          <Field label="Radius" value={search.radiusMeters ? `${search.radiusMeters}m` : null} />
        </Card>
        <Card title="Latest run">
          {!latest ? (
            <p className="text-sm text-ink-500">No runs yet.</p>
          ) : (
            <>
              <Field label="Status" value={<Badge tone={statusTone(latest.status)}>{latest.status}</Badge>} />
              <Field label="Fetched" value={latest.totalFetched} />
              <Field label="Inserted" value={latest.totalInserted} />
              <Field label="Duplicates" value={latest.totalDuplicate} />
              <Field
                label="Started"
                value={latest.startedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? null}
              />
              <Field
                label="Finished"
                value={latest.finishedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? null}
              />
              {latest.error && (
                <div className="rounded bg-rose-50 p-2 text-xs text-rose-800">{latest.error}</div>
              )}
            </>
          )}
        </Card>
      </section>

      <Card title={`Run history (${search.runs.length})`}>
        {search.runs.length === 0 ? (
          <p className="text-sm text-ink-500">No runs yet.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-ink-500">
                <th className="py-2">Started</th>
                <th>Status</th>
                <th className="text-right">Fetched</th>
                <th className="text-right">Inserted</th>
                <th className="text-right">Dupes</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/60">
              {search.runs.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 text-ink-600">
                    {r.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                  </td>
                  <td>
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </td>
                  <td className="text-right font-mono">{r.totalFetched}</td>
                  <td className="text-right font-mono">{r.totalInserted}</td>
                  <td className="text-right font-mono">{r.totalDuplicate}</td>
                  <td className="text-right font-mono">{r.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
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
      <span className="text-right text-ink-900 break-words">
        {value === null || value === undefined || value === '' ? (
          <span className="text-ink-400">—</span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}
