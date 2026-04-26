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
      where: { sources: { some: { searchRun: { search: { projectId: project.id } } } } }
    })
  );

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
    </div>
  );
}
