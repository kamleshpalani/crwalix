"use client";

import { useEffect, useState } from "react";

type Milestone = {
  id: string;
  title: string;
  description: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
  position: number;
  amountCents: number;
  currency: string;
  autoInvoice: boolean;
  dueAt: string | null;
  completedAt: string | null;
  invoiceId: string | null;
};

const STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELED"] as const;

export default function ProjectMilestonesPanel({
  projectId,
}: {
  projectId: string;
}) {
  const [items, setItems] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [autoInvoice, setAutoInvoice] = useState(true);

  const base = `/api/v1/projects/${projectId}/milestones`;

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

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      const cents = Math.round(parseFloat(amount || "0") * 100);
      await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          amountCents: isNaN(cents) ? 0 : cents,
          autoInvoice: autoInvoice && cents > 0,
        }),
      });
      setTitle("");
      setAmount("");
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  async function update(id: string, patch: Partial<Milestone>) {
    await fetch(`${base}/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    await refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this milestone?")) return;
    await fetch(`${base}/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <section className="glass p-4">
      <h2 className="text-sm font-semibold text-ink-900">Milestones</h2>

      <form
        onSubmit={create}
        className="mt-3 flex flex-wrap items-end gap-2 text-sm"
      >
        <label className="flex flex-1 min-w-[200px] flex-col">
          <span className="text-xs text-ink-600">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5"
            placeholder="e.g. Phase 1 deliverable"
          />
        </label>
        <label className="flex w-32 flex-col">
          <span className="text-xs text-ink-600">Amount (USD)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5"
            placeholder="0.00"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-700">
          <input
            type="checkbox"
            checked={autoInvoice}
            onChange={(e) => setAutoInvoice(e.target.checked)}
          />
          Auto-invoice
        </label>
        <button
          type="submit"
          disabled={creating || !title.trim()}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <ul className="mt-4 divide-y divide-white/60">
        {loading && <li className="py-3 text-sm text-ink-500">Loading…</li>}
        {!loading && items.length === 0 && (
          <li className="py-3 text-sm text-ink-500">No milestones yet.</li>
        )}
        {items.map((m) => (
          <li key={m.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink-900">
                  {m.title}
                </div>
                <div className="mt-0.5 text-xs text-ink-500">
                  {m.amountCents > 0
                    ? (m.amountCents / 100).toLocaleString(undefined, {
                        style: "currency",
                        currency: m.currency || "USD",
                      })
                    : "Not billable"}
                  {m.autoInvoice && m.amountCents > 0 ? " · auto-invoice" : ""}
                  {m.invoiceId ? " · invoiced ✓" : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={m.status}
                  onChange={(e) =>
                    update(m.id, {
                      status: e.target.value as Milestone["status"],
                    })
                  }
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  className="text-xs text-rose-700 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
