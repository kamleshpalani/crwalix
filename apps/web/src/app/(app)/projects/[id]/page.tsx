import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import NoOrgBanner from '@/components/NoOrgBanner';
import { Badge, statusTone } from '@/components/Badge';
import { projectsService } from '@/server/services/projects.service';
import { withOrg } from '@crawlix/db';
import ProjectEditForm from './ProjectEditForm';

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const project = await projectsService.get(ctx.orgId, params.id);
  if (!project) notFound();

  const leadCount = await withOrg(ctx.orgId, (tx) =>
    tx.lead.count({
      where: {
        organizationId: ctx.orgId,
        sources: { some: { searchRun: { search: { projectId: project.id } } } }
      }
    })
  );

  const edits = await projectsService.listEdits(ctx.orgId, project.id, 20);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-ink-500 hover:text-ink-900">
          ← Projects
        </Link>
        <div className="mt-2 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            {project.description && (
              <p className="mt-1 text-sm text-ink-600">{project.description}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone="slate">{project.searches.length} searches</Badge>
              <Badge tone="emerald">{leadCount} leads</Badge>
            </div>
            <div className="mt-3">
              <ProjectEditForm
                id={project.id}
                name={project.name}
                description={project.description}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/leads?projectId=${project.id}`}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-white/70"
            >
              View leads
            </Link>
            <Link
              href={`/searches?projectId=${project.id}`}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              + New search
            </Link>
          </div>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-medium">Recent searches</h2>
        <ul className="mt-3 glass overflow-hidden divide-y divide-white/60">
          {project.searches.length === 0 && (
            <li className="p-4 text-sm text-ink-500">No searches yet.</li>
          )}
          {project.searches.map((s) => (
            <li key={s.id} className="p-4 hover:bg-white/70">
              <Link href={`/searches/${s.id}`} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-ink-500">
                    {s.provider} · {s.keyword ?? s.niche ?? '—'}
                  </div>
                </div>
                <Badge tone={statusTone('QUEUED')}>{s.provider}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass p-4">
        <h2 className="text-sm font-semibold text-ink-900">Edit history ({edits.length})</h2>
        {edits.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">No edits yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/60 text-sm">
            {edits.map((e) => {
              const diff = (e.diff ?? {}) as Record<string, { from: unknown; to: unknown }>;
              const fields = Object.keys(diff);
              return (
                <li key={e.id} className="py-2.5">
                  <div className="text-xs text-ink-500">
                    {e.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                    {e.editedByName && (
                      <span className="ml-2">· by <span className="text-ink-700">{e.editedByName}</span></span>
                    )}
                    {fields.length > 0 && (
                      <span className="ml-2">· {fields.length} field{fields.length === 1 ? '' : 's'} changed</span>
                    )}
                  </div>
                  <ul className="mt-1 grid grid-cols-1 gap-0.5 text-xs md:grid-cols-2">
                    {fields.map((f) => {
                      const v = diff[f];
                      const fmt = (x: unknown) => {
                        if (x === null || x === undefined || x === '') return '∅';
                        const s = String(x);
                        return s.length > 40 ? s.slice(0, 40) + '…' : s;
                      };
                      return (
                        <li key={f} className="font-mono text-ink-600">
                          <span className="font-semibold text-ink-900">{f}:</span>{' '}
                          <span className="text-rose-700">{fmt(v?.from)}</span>{' '}
                          <span className="text-ink-400">→</span>{' '}
                          <span className="text-emerald-700">{fmt(v?.to)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
