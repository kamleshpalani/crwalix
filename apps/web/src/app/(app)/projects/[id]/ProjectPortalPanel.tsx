"use client";

import { useEffect, useState } from "react";

type Access = {
  id: string;
  email: string;
  name: string | null;
  status: "PENDING" | "ACTIVE" | "REVOKED";
  invitedAt: string;
  lastLoginAt: string | null;
};

export default function ProjectPortalPanel({
  projectId,
}: {
  projectId: string;
}) {
  const [items, setItems] = useState<Access[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [portalConfigured, setPortalConfigured] = useState<boolean | null>(
    null,
  );

  const base = `/api/v1/projects/${projectId}/portal-invites`;

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch(base);
      const j = await r.json();
      setItems(j.items ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setPending(true);
    try {
      const r = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (typeof j?.portalConfigured === "boolean") {
        setPortalConfigured(j.portalConfigured);
      }
      setEmail("");
      setName("");
      await refresh();
    } finally {
      setPending(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke portal access for this client?")) return;
    await fetch(`${base}/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <section className="glass p-4">
      <h2 className="text-sm font-semibold text-ink-900">
        Client portal access
      </h2>
      <p className="mt-1 text-xs text-ink-500">
        Invite clients by email. They&apos;ll get a magic-link sign-in to view
        milestones and files — no password needed.
      </p>

      {portalConfigured === false && (
        <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Heads up: the client portal isn&apos;t fully configured yet (missing
          <code className="mx-1 rounded bg-amber-100 px-1">
            PORTAL_SESSION_SECRET
          </code>
          env var). Invites are saved, but sign-in emails won&apos;t send until
          an admin sets it.
        </div>
      )}

      <form
        onSubmit={invite}
        className="mt-3 flex flex-wrap items-end gap-2 text-sm"
      >
        <label className="flex flex-1 min-w-[180px] flex-col">
          <span className="text-xs text-ink-600">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5"
            placeholder="client@example.com"
          />
        </label>
        <label className="flex w-40 flex-col">
          <span className="text-xs text-ink-600">Name (optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !email}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Invite
        </button>
      </form>

      <ul className="mt-4 divide-y divide-white/60">
        {loading && <li className="py-3 text-sm text-ink-500">Loading…</li>}
        {!loading && items.length === 0 && (
          <li className="py-3 text-sm text-ink-500">No clients invited yet.</li>
        )}
        {items.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between gap-2 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate font-medium text-ink-900">
                {a.name ?? a.email}
              </div>
              <div className="text-xs text-ink-500">
                {a.email} ·{" "}
                <span
                  className={
                    a.status === "ACTIVE"
                      ? "text-emerald-700"
                      : a.status === "REVOKED"
                        ? "text-rose-700"
                        : "text-amber-700"
                  }
                >
                  {a.status}
                </span>
                {a.lastLoginAt
                  ? ` · last seen ${new Date(a.lastLoginAt).toLocaleDateString()}`
                  : ""}
              </div>
            </div>
            {a.status !== "REVOKED" && (
              <button
                type="button"
                onClick={() => revoke(a.id)}
                className="text-xs text-rose-700 hover:underline"
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
