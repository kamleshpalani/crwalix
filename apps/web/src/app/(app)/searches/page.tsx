import Link from 'next/link';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import NoOrgBanner from '@/components/NoOrgBanner';
import { Badge, statusTone } from '@/components/Badge';
import { projectsService } from '@/server/services/projects.service';
import { searchesService } from '@/server/services/searches.service';
import NewSearchForm from './NewSearchForm';

export default async function SearchesPage({
  searchParams
}: {
  searchParams: { projectId?: string };
}) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const projectId = searchParams.projectId;
  const [projects, searches] = await Promise.all([
    projectsService.list(ctx.orgId),
    searchesService.list(ctx.orgId, projectId)
  ]);
  const activeProject = projectId
    ? projects.find((p) => p.id === projectId) ?? null
    : null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Searches</h1>
        <span className="text-sm text-ink-500">{searches.length} total</span>
      </div>
      <p className="mt-1 text-sm text-ink-600">
        Launch a new search to ingest compliant provider data into leads.
      </p>

      {activeProject && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="rounded bg-slate-100 px-2 py-1 text-ink-700">
            Filtered by project: <strong>{activeProject.name}</strong>
          </span>
          <Link href="/searches" className="text-ink-500 hover:text-ink-900">
            Clear
          </Link>
        </div>
      )}

      <div className="mt-6">
        <NewSearchForm
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          defaultProjectId={projectId}
        />
      </div>

      <ul className="mt-8 glass overflow-hidden divide-y divide-white/60">
        {searches.length === 0 && (
          <li className="p-4 text-sm text-ink-500">No searches yet.</li>
        )}
        {searches.map((s) => {
          const latest = s.runs[0];
          return (
            <li key={s.id} className="p-4 hover:bg-white/70">
              <Link href={`/searches/${s.id}`} className="block">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-ink-500">
                      {s.provider} · {s.keyword ?? s.niche ?? '—'} · {s.city ?? ''} {s.country ?? ''}
                    </div>
                  </div>
                  {latest && <Badge tone={statusTone(latest.status)}>{latest.status}</Badge>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
