"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Contract {
  id: string;
  number: string | null;
  title: string;
  status: "DRAFT" | "SENT" | "SIGNED" | "DECLINED" | "CANCELED" | "EXPIRED";
  bodyMarkdown: string;
  counterpartyName: string | null;
  counterpartyEmail: string | null;
  shareToken: string | null;
  signedName: string | null;
  signedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const STATUS_TONES: Record<Contract["status"], string> = {
  DRAFT: "bg-ink-100 text-ink-700",
  SENT: "bg-amber-100 text-amber-800",
  SIGNED: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-rose-100 text-rose-800",
  CANCELED: "bg-ink-200 text-ink-600",
  EXPIRED: "bg-ink-200 text-ink-600",
};

export default function ContractsClient({
  initialContracts,
}: {
  initialContracts: Contract[];
}) {
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>(initialContracts);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");
  const [bodyMarkdown, setBody] = useState(
    "# Master Services Agreement\n\nThis Agreement is entered into between **{Provider}** and **{Counterparty}**...",
  );
  const [counterpartyName, setCpName] = useState("");
  const [counterpartyEmail, setCpEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function shareUrl(token: string | null) {
    if (!token || typeof window === "undefined") return null;
    return `${window.location.origin}/contracts/share/${token}`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          bodyMarkdown,
          counterpartyName: counterpartyName || null,
          counterpartyEmail: counterpartyEmail || null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.code ?? `HTTP ${res.status}`);
      }
      const { contract } = (await res.json()) as { contract: Contract };
      setContracts((cur) => [contract, ...cur]);
      setShowForm(false);
      setTitle("");
      setBody("# Master Services Agreement\n\n...");
      setCpName("");
      setCpEmail("");
      setExpiresAt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function send(id: string) {
    const res = await fetch(`/api/v1/contracts/${id}/send`, { method: "POST" });
    if (res.ok) {
      const { contract } = (await res.json()) as { contract: Contract };
      setContracts((cur) => cur.map((c) => (c.id === id ? contract : c)));
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this contract?")) return;
    const res = await fetch(`/api/v1/contracts/${id}`, { method: "DELETE" });
    if (res.ok) setContracts((cur) => cur.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          {showForm ? "Cancel" : "New contract"}
        </button>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="text-xs text-ink-500 hover:text-ink-800"
        >
          Refresh
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="space-y-3 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-glass backdrop-blur"
        >
          <input
            required
            maxLength={200}
            placeholder="Contract title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              maxLength={200}
              placeholder="Counterparty name"
              value={counterpartyName}
              onChange={(e) => setCpName(e.target.value)}
              className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              type="email"
              maxLength={200}
              placeholder="Counterparty email"
              value={counterpartyEmail}
              onChange={(e) => setCpEmail(e.target.value)}
              className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <label className="block text-xs text-ink-600">
            Expires at (optional)
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </label>
          <textarea
            required
            value={bodyMarkdown}
            onChange={(e) => setBody(e.target.value)}
            className="h-64 w-full resize-y rounded-lg border border-ink-200 bg-white px-3 py-2 font-mono text-xs focus:border-emerald-500 focus:outline-none"
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Create contract"}
          </button>
        </form>
      )}

      <ul className="divide-y divide-ink-100 rounded-2xl border border-white/60 bg-white/70 shadow-glass backdrop-blur">
        {contracts.map((c) => {
          const url = shareUrl(c.shareToken);
          return (
            <li
              key={c.id}
              className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-500">
                    {c.number ?? "—"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONES[c.status]}`}
                  >
                    {c.status}
                  </span>
                </div>
                <p className="truncate text-sm font-medium text-ink-900">
                  {c.title}
                </p>
                <p className="text-xs text-ink-500">
                  {c.counterpartyName ?? "—"}
                  {c.signedName && c.status === "SIGNED"
                    ? ` · signed by ${c.signedName}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {c.status === "DRAFT" && (
                  <button
                    type="button"
                    onClick={() => send(c.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700"
                  >
                    Send
                  </button>
                )}
                {url && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(url)}
                    className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-ink-700 hover:bg-ink-50"
                  >
                    Copy link
                  </button>
                )}
                {c.status === "DRAFT" && (
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    className="rounded-lg px-2 py-1 text-rose-600 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {contracts.length === 0 && (
          <li className="p-6 text-center text-sm text-ink-500">
            No contracts yet.
          </li>
        )}
      </ul>
    </div>
  );
}
