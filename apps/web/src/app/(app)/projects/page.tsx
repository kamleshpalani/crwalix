import Link from 'next/link';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { projectsService } from '@/server/services/projects.service';
import NewProjectForm from './NewProjectForm';
import NoOrgBanner from '@/components/NoOrgBanner';

export default async function ProjectsPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;
  const projects = await projectsService.list(ctx.orgId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <span className="text-sm text-ink-500">{projects.length} total</span>
      </div>
      <p className="mt-1 text-sm text-ink-600">
        Projects group searches, leads, and exports.
      </p>

      <div className="mt-6">
        <NewProjectForm />
      </div>

      <ul className="mt-6 glass overflow-hidden divide-y divide-white/60">
        {projects.length === 0 && (
          <li className="p-4 text-sm text-ink-500">No projects yet.</li>
        )}
        {projects.map((p) => (
          <li key={p.id} className="p-4 hover:bg-white/70">
            <Link href={`/projects/${p.id}`} className="block">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-ink-500">{p.id}</div>
              {p.description && (
                <div className="mt-1 text-sm text-ink-600">{p.description}</div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
