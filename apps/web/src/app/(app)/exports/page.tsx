import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import NoOrgBanner from '@/components/NoOrgBanner';
import { Badge, statusTone } from '@/components/Badge';
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
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Exports</h1>
        <span className="text-sm text-ink-500">{exportJobs.length} total</span>
      </div>
      <p className="mt-1 text-sm text-ink-600">
        Download scored leads as CSV. Larger formats and async processing coming soon.
      </p>

      <div className="mt-6">
        <NewExportForm
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          searches={searches.map((s) => ({ id: s.id, name: s.name }))}
        />
      </div>

      <ul className="mt-6 glass overflow-hidden divide-y divide-white/60">
        {exportJobs.length === 0 && (
          <li className="p-4 text-sm text-ink-500">
            No exports yet. Create one to download leads as CSV.
          </li>
        )}
        {exportJobs.map((j) => {
          const sourceLabel = j.searchId
            ? 'search'
            : j.projectId
            ? 'project'
            : j.listId
            ? 'list'
            : 'filter';
          return (
            <li key={j.id} className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <div className="font-medium">
                  {j.format} · {sourceLabel}
                </div>
                <div className="text-xs text-ink-500">
                  {j.id.slice(0, 8)} · {j.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                  {j.rowCount !== null && j.rowCount !== undefined && ` · ${j.rowCount} rows`}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={statusTone(j.status)}>{j.status}</Badge>
                <a
                  href={`/api/v1/exports/${j.id}/download`}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-white/70"
                >
                  Download
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
