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
        <span className="text-sm text-slate-500">{projects.length} total</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Projects group searches, leads, and exports.
      </p>

      <div className="mt-6">
        <NewProjectForm />
      </div>

      <ul className="mt-6 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
        {projects.length === 0 && (
          <li className="p-4 text-sm text-slate-500">No projects yet.</li>
        )}
        {projects.map((p) => (
          <li key={p.id} className="p-4">
            <div className="font-medium">{p.name}</div>
            <div className="text-xs text-slate-500">{p.id}</div>
            {p.description && (
              <div className="mt-1 text-sm text-slate-600">{p.description}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
