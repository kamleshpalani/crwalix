"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DealListItem, PipelineDto } from "@crawlix/shared";
import DealDrawer from "./DealDrawer";

interface Props {
  pipeline: PipelineDto;
  deals: DealListItem[];
}

/**
 * Kanban board with native HTML5 drag-and-drop. Optimistically moves cards
 * across columns and PATCHes /api/v1/crm/deals/{id} on drop; on failure it
 * reverts and shows an inline toast.
 *
 * Native DnD avoids pulling @dnd-kit (~40 kB gz) just for this surface; it's
 * good enough for desktop and Sales users rarely use kanban on mobile.
 */
export default function PipelineBoard({ pipeline, deals: initial }: Props) {
  const router = useRouter();
  const [deals, setDeals] = useState(initial);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDealId, setOpenDealId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Group deals by stage for quick lookup. Memo so reordering is O(n) only on
  // state change, not every render.
  const byStage = useMemo(() => {
    const map = new Map<string, DealListItem[]>();
    for (const s of pipeline.stages) map.set(s.id, []);
    for (const d of deals) {
      const arr = map.get(d.stageId);
      if (arr) arr.push(d);
    }
    return map;
  }, [deals, pipeline.stages]);

  async function moveDeal(dealId: string, toStageId: string) {
    const before = deals;
    const prev = before.find((d) => d.id === dealId);
    if (!prev || prev.stageId === toStageId) return;

    // Optimistic update.
    setDeals((curr) =>
      curr.map((d) => (d.id === dealId ? { ...d, stageId: toStageId } : d)),
    );
    setError(null);

    try {
      const res = await fetch(`/api/v1/crm/deals/${dealId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageId: toStageId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const { deal: updated } = (await res.json()) as { deal: DealListItem };
      // Reconcile with server response (status / closedAt may have changed
      // when dragged into a Won / Lost terminal stage).
      setDeals((curr) => curr.map((d) => (d.id === updated.id ? updated : d)));
      // Refresh the server component so the count chip stays accurate.
      startTransition(() => router.refresh());
    } catch (err) {
      setDeals(before);
      setError(err instanceof Error ? err.message : "Failed to move deal");
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="glass border-l-4 border-rose-400 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {pipeline.stages.map((stage) => {
          const stageDeals = byStage.get(stage.id) ?? [];
          const total = stageDeals.reduce((sum, d) => sum + d.amountCents, 0);
          const tone = stage.isWon
            ? "border-emerald-300/70"
            : stage.isLost
              ? "border-rose-300/70"
              : "border-white/60";
          const isHover = hoverStage === stage.id;
          return (
            <div
              key={stage.id}
              className={`flex w-72 shrink-0 flex-col rounded-2xl border ${tone} bg-white/55 backdrop-blur transition ${
                isHover ? "ring-2 ring-brand-400/60" : ""
              }`}
              onDragOver={(e) => {
                if (draggingId) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (hoverStage !== stage.id) setHoverStage(stage.id);
                }
              }}
              onDragLeave={() => {
                if (hoverStage === stage.id) setHoverStage(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id =
                  e.dataTransfer.getData("text/plain") || draggingId || "";
                setHoverStage(null);
                setDraggingId(null);
                if (id) void moveDeal(id, stage.id);
              }}
            >
              <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-sm font-semibold text-ink-800">
                    {stage.name}
                  </span>
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-600">
                    {stageDeals.length}
                  </span>
                </div>
                <span className="text-[11px] text-ink-500">
                  {formatCurrency(total)}
                </span>
              </header>

              <div className="flex flex-col gap-2 px-2 pb-3">
                {stageDeals.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-ink-200 px-3 py-6 text-center text-[11px] text-ink-400">
                    Drop here
                  </p>
                ) : (
                  stageDeals.map((d) => (
                    <DealCard
                      key={d.id}
                      deal={d}
                      isDragging={draggingId === d.id}
                      onOpen={() => setOpenDealId(d.id)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", d.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(d.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setHoverStage(null);
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isPending && <p className="text-[11px] text-ink-400">Refreshing…</p>}

      <DealDrawer
        pipeline={pipeline}
        dealId={openDealId}
        onClose={() => setOpenDealId(null)}
      />
    </div>
  );
}

function DealCard({
  deal,
  isDragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  deal: DealListItem;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      className={`cursor-grab rounded-xl border border-white/70 bg-white/85 p-3 shadow-sm transition active:cursor-grabbing ${
        isDragging ? "opacity-50" : "hover:shadow-md"
      }`}
    >
      <h3 className="line-clamp-2 text-sm font-medium text-ink-900">
        {deal.title}
      </h3>
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-500">
        <span>{formatCurrency(deal.amountCents, deal.currency)}</span>
        {deal.expectedCloseAt && (
          <span>{new Date(deal.expectedCloseAt).toLocaleDateString()}</span>
        )}
      </div>
    </article>
  );
}

function formatCurrency(cents: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency}`;
  }
}
