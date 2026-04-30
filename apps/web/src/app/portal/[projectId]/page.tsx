import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@crawlix/db";
import {
  decodePortalSession,
  PORTAL_COOKIE_NAME,
} from "@/server/services/portal.service";
import PortalChat from "./PortalChat";

export const dynamic = "force-dynamic";

export default async function PortalProjectPage({
  params,
}: {
  params: { projectId: string };
}) {
  const cookieStore = cookies();
  const session = decodePortalSession(
    cookieStore.get(PORTAL_COOKIE_NAME)?.value,
  );

  // No session, or session belongs to a different project — bounce to login.
  if (!session || session.projectId !== params.projectId) {
    redirect("/portal/login");
  }

  // Bypass RLS: portal users are NOT in `current_org()` — fetch directly with
  // explicit org+project filter. Caller has been authenticated above.
  const project = await prisma.project.findFirst({
    where: { id: session.projectId, organizationId: session.orgId },
    select: { id: true, name: true, status: true, kickoffAt: true },
  });

  if (!project) {
    redirect("/portal/login?e=invalid");
  }

  const [milestones, files] = await Promise.all([
    prisma.milestone.findMany({
      where: { projectId: project.id, organizationId: session.orgId },
      orderBy: { position: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        amountCents: true,
        currency: true,
        dueAt: true,
        completedAt: true,
      },
    }),
    prisma.projectFile.findMany({
      where: { projectId: project.id, organizationId: session.orgId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Welcome, {session.email}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {project.name}
          </h1>
          <div className="mt-1 text-sm text-slate-600">
            Status: {project.status}
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Milestones
        </h2>
        {milestones.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Your project team hasn&apos;t set milestones yet.
          </p>
        ) : (
          <ol className="mt-4 space-y-3">
            {milestones.map((m) => (
              <li
                key={m.id}
                className="flex items-start justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    {m.title}
                  </div>
                  {m.description ? (
                    <div className="mt-1 text-xs text-slate-600">
                      {m.description}
                    </div>
                  ) : null}
                  {m.dueAt ? (
                    <div className="mt-1 text-xs text-slate-500">
                      Due: {new Date(m.dueAt).toLocaleDateString()}
                    </div>
                  ) : null}
                </div>
                <div className="text-right">
                  <div
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      m.status === "COMPLETED"
                        ? "bg-emerald-100 text-emerald-800"
                        : m.status === "IN_PROGRESS"
                          ? "bg-sky-100 text-sky-800"
                          : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {m.status}
                  </div>
                  {m.amountCents > 0 ? (
                    <div className="mt-1 text-xs text-slate-600">
                      {(m.amountCents / 100).toLocaleString(undefined, {
                        style: "currency",
                        currency: m.currency || "USD",
                      })}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Files
        </h2>
        {files.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No files shared yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div>
                  <div className="font-medium text-slate-900">{f.filename}</div>
                  <div className="text-xs text-slate-500">
                    {(f.sizeBytes / 1024).toFixed(1)} KB ·{" "}
                    {new Date(f.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <a
                  href={`/api/v1/portal/files/${f.id}`}
                  className="text-sm font-medium text-slate-700 underline-offset-4 hover:underline"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <PortalChat />
    </div>
  );
}
