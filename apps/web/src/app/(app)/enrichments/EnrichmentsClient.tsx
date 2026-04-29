"use client";

import { useState } from "react";

interface Enrichment {
  id: string;
  leadId: string;
  leadName: string | null;
  kind: string;
  provider: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  attempts: number;
  cost: number;
  error: string | null;
  normalized: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

const STATUS_TONES: Record<Enrichment["status"], string> = {
  QUEUED: "bg-ink-100 text-ink-700",
  RUNNING: "bg-amber-100 text-amber-800",
  SUCCEEDED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-rose-100 text-rose-800",
  SKIPPED: "bg-ink-200 text-ink-600",
};

const KINDS = [
  "WEBSITE_VALIDATION",
  "EMAIL",
  "EMAIL_VERIFY",
  "SOCIAL",
  "COMPANY",
  "CONTACT",
] as const;

export default function EnrichmentsClient({
  initialEnrichments,
  initialCounts,
}: {
  initialEnrichments: Enrichment[];
  initialCounts: { status: string; count: number }[];
}) {
  const [enrichments, setEnrichments] =
    useState<Enrichment[]>(initialEnrichments);
  const [counts] = useState(initialCounts);
  const [leadIdsRaw, setLeadIdsRaw] = useState("");
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(
    new Set(["WEBSITE_VALIDATION", "EMAIL_VERIFY"]),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function toggleKind(k: string) {
    setSelectedKinds((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function bulkQueue() {
    const leadIds = leadIdsRaw
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (leadIds.length === 0) {
      setError("Paste at least one lead UUID.");
      return;
    }
    if (selectedKinds.size === 0) {
      setError("Pick at least one enrichment kind.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/v1/enrichments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadIds,
          kinds: Array.from(selectedKinds),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.code ?? `HTTP ${res.status}`);
      }
      const { summary } = (await res.json()) as {
        summary: { queued: number; skipped: number; errors: unknown[] };
      };
      setResult(
        `Queued ${summary.queued}, skipped ${summary.skipped}, errors ${summary.errors.length}.`,
      );
      const list = await fetch("/api/v1/enrichments?limit=200").then((r) =>
        r.json(),
      );
      setEnrichments(list.enrichments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-5">
        {counts.map((c) => (
          <div
            key={c.status}
            className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-glass backdrop-blur"
          >
            <p className="text-xs uppercase tracking-wide text-ink-500">
              {c.status}
            </p>
            <p className="mt-1 text-2xl font-semibold text-ink-900">
              {c.count}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-glass backdrop-blur">
        <h2 className="text-sm font-semibold text-ink-900">Bulk queue</h2>
        <p className="mt-1 text-xs text-ink-600">
          Paste lead UUIDs (one per line, or comma-separated) and pick one or
          more enrichment kinds.
        </p>
        <textarea
          value={leadIdsRaw}
          onChange={(e) => setLeadIdsRaw(e.target.value)}
          placeholder="lead UUID per line"
          className="mt-3 h-24 w-full resize-y rounded-lg border border-ink-200 bg-white px-3 py-2 font-mono text-xs focus:border-emerald-500 focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {KINDS.map((k) => {
            const active = selectedKinds.has(k);
            return (
              <button
                type="button"
                key={k}
                onClick={() => toggleKind(k)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  active
                    ? "bg-emerald-600 text-white"
                    : "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                }`}
              >
                {k}
              </button>
            );
          })}
        </div>
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        {result && <p className="mt-2 text-xs text-emerald-700">{result}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={bulkQueue}
          className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Queueing…" : "Queue"}
        </button>
      </div>

      <ul className="divide-y divide-ink-100 rounded-2xl border border-white/60 bg-white/70 shadow-glass backdrop-blur">
        {enrichments.map((e) => (
          <li
            key={e.id}
            className="flex flex-col gap-1 p-4 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONES[e.status]}`}
                >
                  {e.status}
                </span>
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-700">
                  {e.kind}
                </span>
                <span className="text-xs text-ink-500">{e.provider}</span>
              </div>
              <p className="truncate text-sm font-medium text-ink-900">
                {e.leadName ?? e.leadId}
              </p>
              {e.error && (
                <p className="text-xs text-rose-600">Error: {e.error}</p>
              )}
            </div>
            <span className="whitespace-nowrap text-xs text-ink-400">
              {new Date(e.createdAt).toLocaleString()}
            </span>
          </li>
        ))}
        {enrichments.length === 0 && (
          <li className="p-6 text-center text-sm text-ink-500">
            No enrichments yet.
          </li>
        )}
      </ul>
    </div>
  );
}
