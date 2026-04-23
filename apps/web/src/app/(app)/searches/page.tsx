import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import NoOrgBanner from '@/components/NoOrgBanner';
import { projectsService } from '@/server/services/projects.service';
import { searchesService } from '@/server/services/searches.service';
import NewSearchForm from './NewSearchForm';

export default async function SearchesPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const [projects, searches] = await Promise.all([
    projectsService.list(ctx.orgId),
    searchesService.list(ctx.orgId)
  ]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Searches</h1>
        <span className="text-sm text-slate-500">{searches.length} total</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Launch a new search to ingest compliant provider data into leads.
      </p>

      <div className="mt-6">
        <NewSearchForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
      </div>

      <ul className="mt-8 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
        {searches.length === 0 && (
          <li className="p-4 text-sm text-slate-500">No searches yet.</li>
        )}
        {searches.map((s) => {
          const latest = s.runs[0];
          return (
            <li key={s.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-slate-500">
                    {s.provider} · {s.keyword ?? s.niche ?? '—'} · {s.city ?? ''} {s.country ?? ''}
                  </div>
                </div>
                {latest && (
                  <span
                    className={
                      'rounded px-2 py-1 text-xs font-medium ' +
                      (latest.status === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : latest.status === 'FAILED'
                        ? 'bg-rose-100 text-rose-800'
                        : latest.status === 'RUNNING'
                        ? 'bg-sky-100 text-sky-800'
                        : 'bg-slate-100 text-slate-700')
                    }
                  >
                    {latest.status}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
