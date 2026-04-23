import { requireOrg, isResponse } from '@/lib/auth';
import { projectsService } from '@/server/services/projects.service';

export default async function DashboardPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;

  const projects = await projectsService.list(ctx.orgId);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-600">Organization: {ctx.clerkOrgId}</p>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Projects</h2>
          <span className="text-sm text-slate-500">{projects.length} total</span>
        </div>
        <ul className="mt-3 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
          {projects.length === 0 && (
            <li className="p-4 text-sm text-slate-500">
              No projects yet. Create one via <code>POST /api/v1/projects</code>.
            </li>
          )}
          {projects.map((p) => (
            <li key={p.id} className="p-4">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-slate-500">{p.id}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
