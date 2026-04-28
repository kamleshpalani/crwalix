import Link from 'next/link';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { projectsService } from '@/server/services/projects.service';
import NewProjectForm from './NewProjectForm';
import NoOrgBanner from '@/components/NoOrgBanner';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';

export default async function ProjectsPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;
  const projects = await projectsService.list(ctx.orgId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspaces"
        title="Projects"
        icon="M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4"
        description="Group searches, leads, and exports into focused workspaces. Each project keeps your team aligned around a single market or campaign."
        chips={
          <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
            {projects.length} project{projects.length === 1 ? '' : 's'}
          </span>
        }
      />

      <section className="glass p-5">
        <h2 className="text-sm font-semibold text-ink-900">Create a new project</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          Give it a clear name — searches and exports will be scoped under it.
        </p>
        <div className="mt-4">
          <NewProjectForm />
        </div>
      </section>

      {projects.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon="M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4"
            title="No projects yet"
            description="Create your first project to organize searches and leads."
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="glass group relative block h-full overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-glass-lg"
              >
                <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-brand-300/30 to-fuchsia-300/30 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />
                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-brand text-white shadow-glow">
                      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                        <path
                          d="M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-ink-700">
                      →
                    </span>
                  </div>
                  <div className="mt-4 truncate text-base font-semibold text-ink-900">
                    {p.name}
                  </div>
                  {p.description && (
                    <div className="mt-1 line-clamp-2 text-sm text-ink-600">
                      {p.description}
                    </div>
                  )}
                  <div className="mt-4 truncate font-mono text-[11px] text-ink-400">
                    {p.id}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
