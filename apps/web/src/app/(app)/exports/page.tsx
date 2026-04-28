import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import NoOrgBanner from '@/components/NoOrgBanner';
import { Badge, statusTone } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { exportsService } from '@/server/services/exports.service';
import { projectsService } from '@/server/services/projects.service';
import { searchesService } from '@/server/services/searches.service';
import NewExportForm from './NewExportForm';

export const dynamic = 'force-dynamic';

export default async function ExportsPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const [exportJobs, projects, searches] = await Promise.all([
    exportsService.list(ctx.orgId),
    projectsService.list(ctx.orgId),
    searchesService.list(ctx.orgId)
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Delivery"
        title="Exports"
        icon="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
        description="Download scored leads as CSV. Larger formats and async processing coming soon."
        chips={
          <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
            {exportJobs.length} export{exportJobs.length === 1 ? '' : 's'}
          </span>
        }
      />

      <section className="glass p-5">
        <h2 className="text-sm font-semibold text-ink-900">Create a new export</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          Export by project, search, list, or current filter.
        </p>
        <div className="mt-4">
          <NewExportForm
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            searches={searches.map((s) => ({ id: s.id, name: s.name }))}
          />
        </div>
      </section>

      {exportJobs.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
            title="No exports yet"
            description="Create one above to download leads as CSV."
          />
        </div>
      ) : (
        <ul className="glass divide-y divide-white/60 overflow-hidden">
          {exportJobs.map((j) => {
            const sourceLabel = j.searchId
              ? 'search'
              : j.projectId
              ? 'project'
              : j.listId
              ? 'list'
              : 'filter';
            return (
              <li key={j.id} className="flex items-center justify-between gap-3 p-5 transition hover:bg-white/70">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-100 to-fuchsia-100 text-brand-700">
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                      <path
                        d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-ink-100/70 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-ink-700">
                        {j.format}
                      </span>
                      <span className="text-sm font-medium text-ink-900">{sourceLabel}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink-500">
                      {j.id.slice(0, 8)} · {j.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                      {j.rowCount !== null && j.rowCount !== undefined && ` · ${j.rowCount} rows`}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={statusTone(j.status)}>{j.status}</Badge>
                  <a
                    href={`/api/v1/exports/${j.id}/download`}
                    className="btn-ghost"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                      <path
                        d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Download
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
