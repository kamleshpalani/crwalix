"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PipelineDto } from "@crawlix/shared";

interface Props {
  pipeline: PipelineDto;
}

/**
 * "New deal" affordance for the kanban page. Lightweight inline modal — no
 * extra dialog dep — that POSTs to /api/v1/crm/deals and refreshes the
 * server component on success so the new card shows up in the right column.
 */
export default function NewDealButton({ pipeline }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState(""); // dollars input, sent as cents
  const [stageId, setStageId] = useState<string>(pipeline.stages[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function reset() {
    setTitle("");
    setAmount("");
    setStageId(pipeline.stages[0]?.id ?? "");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSubmitting(true);
    setError(null);

    // Allow "1,234.56" or "1234.56" — strip thousand separators, parse to cents.
    const dollars = Number(amount.replaceAll(",", "").trim() || "0");
    if (!Number.isFinite(dollars) || dollars < 0) {
      setError("Amount must be a non-negative number");
      setSubmitting(false);
      return;
    }
    const amountCents = Math.round(dollars * 100);

    try {
      const res = await fetch("/api/v1/crm/deals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pipelineId: pipeline.id,
          stageId: stageId || undefined,
          title: title.trim(),
          amountCents,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      setOpen(false);
      reset();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary inline-flex items-center gap-2"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        New deal
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink-900/30 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <form
            onSubmit={submit}
            className="glass-lg w-full max-w-md space-y-4 p-6"
          >
            <div>
              <h2 className="font-display text-xl font-semibold text-ink-900">
                New deal
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                Pipeline: <span className="font-medium">{pipeline.name}</span>
              </p>
            </div>

            <label className="block">
              <span className="label">Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Acme Corp – website redesign"
                autoFocus
                className="mt-1 w-full text-sm"
                required
                maxLength={200}
              />
            </label>

            <label className="block">
              <span className="label">Amount (USD)</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="5000"
                className="mt-1 w-full text-sm"
              />
            </label>

            <label className="block">
              <span className="label">Stage</span>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="mt-1 w-full text-sm"
              >
                {pipeline.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            {error && (
              <p className="rounded-lg border-l-4 border-rose-400 bg-rose-50/70 px-3 py-2 text-xs text-rose-700">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
              >
                {submitting ? "Creating…" : "Create deal"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
