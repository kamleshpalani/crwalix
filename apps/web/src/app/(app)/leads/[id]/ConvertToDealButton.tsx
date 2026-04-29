"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PipelineDto } from "@crawlix/shared";

interface ExistingDeal {
  id: string;
  title: string;
  status: string;
  stageId: string;
  amountCents: number;
  currency: string;
}

interface Props {
  readonly leadId: string;
  readonly leadName: string;
}

/**
 * "Convert to deal" button + modal for the lead detail page. Closes the
 * Lead → Deal loop: pre-fills the deal title from the lead, posts to
 * `/api/v1/crm/deals`, then navigates to the pipeline.
 *
 * If deals already exist for this lead, lists them inline so users don't
 * accidentally create duplicates.
 */
export default function ConvertToDealButton({ leadId, leadName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineDto | null>(null);
  const [existing, setExisting] = useState<ExistingDeal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state.
  const [title, setTitle] = useState(`${leadName} — services`);
  const [amount, setAmount] = useState("");
  const [stageId, setStageId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Lazy-load pipelines + existing deals only once when the modal opens.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [pipeRes, dealsRes] = await Promise.all([
          fetch("/api/v1/crm/pipelines"),
          fetch(
            `/api/v1/crm/deals?leadId=${encodeURIComponent(leadId)}&pageSize=20`,
          ),
        ]);
        if (!pipeRes.ok) throw new Error(`Pipelines HTTP ${pipeRes.status}`);
        if (!dealsRes.ok) throw new Error(`Deals HTTP ${dealsRes.status}`);
        const { pipelines } = (await pipeRes.json()) as {
          pipelines: PipelineDto[];
        };
        const { deals } = (await dealsRes.json()) as { deals: ExistingDeal[] };
        if (cancelled) return;
        const def = pipelines.find((p) => p.isDefault) ?? pipelines[0];
        setPipeline(def ?? null);
        setStageId(def?.stages[0]?.id ?? "");
        setExisting(deals);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, loaded, leadId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pipeline || !stageId) return;
    setSubmitting(true);
    setError(null);
    try {
      const dollars = Number(amount);
      const cents =
        amount.trim() === "" || Number.isNaN(dollars)
          ? 0
          : Math.round(dollars * 100);
      const res = await fetch("/api/v1/crm/deals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pipelineId: pipeline.id,
          stageId,
          title: title.trim(),
          amountCents: cents,
          leadId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      setOpen(false);
      router.push("/pipeline");
      router.refresh();
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
        className="btn-primary"
        onClick={() => setOpen(true)}
      >
        Convert to deal
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          role="presentation"
        >
          <div className="glass-lg w-full max-w-md space-y-4 p-5">
            <header className="flex items-start justify-between gap-3">
              <div>
                <span className="label">New deal</span>
                <h2 className="mt-1 font-display text-lg font-semibold text-ink-900">
                  Convert {leadName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-ghost"
                aria-label="Close"
              >
                ✕
              </button>
            </header>

            {loading && <p className="text-xs text-ink-500">Loading…</p>}

            {error && (
              <p className="rounded-lg border-l-4 border-rose-400 bg-rose-50/70 px-3 py-2 text-xs text-rose-700">
                {error}
              </p>
            )}

            {existing.length > 0 && (
              <section className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-3 text-xs">
                <p className="font-medium text-amber-900">
                  This lead already has {existing.length} deal
                  {existing.length === 1 ? "" : "s"}:
                </p>
                <ul className="mt-1 space-y-0.5 text-amber-800">
                  {existing.slice(0, 3).map((d) => (
                    <li key={d.id} className="truncate">
                      • {d.title}{" "}
                      <span className="text-amber-600">({d.status})</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {pipeline && (
              <form onSubmit={submit} className="space-y-3">
                <label className="block">
                  <span className="label">Title</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    maxLength={200}
                    className="mt-1 w-full text-sm"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="label">Amount (USD)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
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
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submitting || !title.trim()}
                  >
                    {submitting ? "Creating…" : "Create deal"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
