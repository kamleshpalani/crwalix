import Link from 'next/link';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import NoOrgBanner from '@/components/NoOrgBanner';
import { Badge, statusTone } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Discovery"
        title="Searches"
        icon="M21 21l-4.3-4.3M11 18a7 7 0 110-14 7 7 0 010 14z"
        description="Launch a new search to ingest compliant provider data into leads. Schedule recurring runs to keep your pipeline fresh."
        chips={
          <>
            <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
              {searches.length} search{searches.length === 1 ? '' : 'es'}
            </span>
            {activeProject && (
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-200/70 bg-brand-50/80 px-3 py-1 text-xs font-medium text-brand-700 backdrop-blur">
                Project: <strong>{activeProject.name}</strong>
                <Link href="/searches" className="text-brand-600 hover:text-brand-800">
                  ✕
                </Link>
              </span>
            )}
          </>
        }
      />

      <section className="glass p-5">
        <h2 className="text-sm font-semibold text-ink-900">Run a new search</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          Pick a provider and refine by keyword, niche, and location.
        </p>
        <div className="mt-4">
          <NewSearchForm
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            defaultProjectId={projectId}
          />
        </div>
      </section>

      {searches.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon="M21 21l-4.3-4.3M11 18a7 7 0 110-14 7 7 0 010 14z"
            title="No searches yet"
            description="Run your first search to start populating leads."
          />
        </div>
      ) : (
        <ul className="glass divide-y divide-white/60 overflow-hidden">
          {searches.map((s) => {
            const latest = s.runs[0];
            const focus = (s as { leadFocus?: string }).leadFocus ?? 'ALL';
            const focusLabel =
              focus === 'NO_WEBSITE'
                ? 'No-website only'
                : focus === 'HIGH_OR_MED'
                ? 'High + medium'
                : null;
            return (
              <li key={s.id} className="transition hover:bg-white/70">
                <Link href={`/searches/${s.id}`} className="block p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-ink-900">{s.name}</span>
                        {focusLabel && (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                            {focusLabel}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                        <span className="rounded-md bg-ink-100/70 px-2 py-0.5 font-mono uppercase tracking-wide text-ink-700">
                          {s.provider}
                        </span>
                        <span>{s.keyword ?? s.niche ?? '—'}</span>
                        {(s.city || s.country) && (
                          <span>
                            {[s.city, s.country].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {latest && <Badge tone={statusTone(latest.status)}>{latest.status}</Badge>}
                      <span className="text-ink-400">→</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
