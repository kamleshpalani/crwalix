"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { DealListItem, PipelineDto } from "@crawlix/shared";

interface Props {
  pipeline: PipelineDto;
  deals: DealListItem[];
}

/**
 * Tabular CRM view with row checkboxes and a bulk "Move to stage" action.
 * Complements the kanban PipelineBoard for users who prefer dense data.
 */
export default function TableView({ pipeline, deals: initial }: Props) {
  const router = useRouter();
  const [deals, setDeals] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState<string>(
    pipeline.stages[0]?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const stageById = useMemo(
    () => new Map(pipeline.stages.map((s) => [s.id, s])),
    [pipeline.stages],
  );

  const allSelected =
    deals.length > 0 && deals.every((d) => selected.has(d.id));

  function toggle(id: string) {
    setSelected((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(deals.map((d) => d.id)));
  }

  async function applyBulk() {
    if (selected.size === 0 || !bulkStage) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/crm/deals/bulk-stage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dealIds: Array.from(selected),
          stageId: bulkStage,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        updated: number;
        failed: Array<{ id: string; error: string }>;
      };
      // Optimistic local update for the rows we successfully moved.
      const failedIds = new Set(json.failed.map((f) => f.id));
      setDeals((curr) =>
        curr.map((d) =>
          selected.has(d.id) && !failedIds.has(d.id)
            ? { ...d, stageId: bulkStage }
            : d,
        ),
      );
      setSelected(new Set());
      if (json.failed.length > 0) {
        setError(`${json.updated} updated, ${json.failed.length} failed.`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBusy(false);
    }
  }

  function fmtMoney(cents: number, currency: string) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100);
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="glass flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
          <span className="font-medium text-ink-700">
            {selected.size} selected
          </span>
          <span className="text-ink-400">\u2192</span>
          <select
            value={bulkStage}
            onChange={(e) => setBulkStage(e.target.value)}
            className="rounded-md border border-ink-200 bg-white px-2 py-1 text-sm"
          >
            {pipeline.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={applyBulk}
            disabled={busy || !bulkStage}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {busy ? "Moving\u2026" : "Move to stage"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-ink-500 hover:text-ink-700"
          >
            Clear
          </button>
        </div>
      )}

      {error && (
        <div className="glass border-l-4 border-rose-400 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="glass overflow-hidden rounded-2xl">
        <table className="w-full text-sm">
          <thead className="bg-white/60 text-left text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-ink-400">
                  No deals in this pipeline.
                </td>
              </tr>
            ) : (
              deals.map((d) => {
                const stage = stageById.get(d.stageId);
                const isSel = selected.has(d.id);
                return (
                  <tr
                    key={d.id}
                    className={`border-t border-white/40 transition hover:bg-white/40 ${
                      isSel ? "bg-brand-50/60" : ""
                    }`}
                  >
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="checkbox"
                        aria-label={`Select ${d.title}`}
                        checked={isSel}
                        onChange={() => toggle(d.id)}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-ink-800">
                      <a
                        href={`/pipeline?dealId=${d.id}`}
                        className="hover:underline"
                      >
                        {d.title}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-ink-600">
                      {stage?.name ?? "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-ink-600">{d.status}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-700">
                      {fmtMoney(d.amountCents, d.currency)}
                    </td>
                    <td className="px-3 py-2 text-ink-500">
                      {d.ownerUserId ?? "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-ink-500">
                      {new Date(d.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
