"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProposalViewer from "./ProposalViewer";
import {
  ActivityKind,
  type ActivityKind as ActivityKindT,
  type DealListItem,
  type PipelineDto,
  type PipelineStageDto,
} from "@crawlix/shared";

interface Activity {
  id: string;
  kind: ActivityKindT;
  summary: string;
  metadata?: Record<string, unknown> | null;
  occurredAt: string;
  userId?: string | null;
}

interface Proposal {
  id: string;
  version: number;
  status: string;
  bodyHtml: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  aiCostUsd: number | null;
  createdAt: string;
}

interface Props {
  pipeline: PipelineDto;
  dealId: string | null;
  onClose: () => void;
}

/**
 * Right-hand side drawer for a single deal. Lazy-loads detail + activities
 * the first time it opens for a given dealId. Posting a note refreshes
 * the timeline locally and re-renders the kanban via router.refresh().
 */
export default function DealDrawer({ pipeline, dealId, onClose }: Props) {
  const router = useRouter();
  const [deal, setDeal] = useState<DealListItem | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [openProposalId, setOpenProposalId] = useState<string | null>(null);

  // Add-note state.
  const [noteText, setNoteText] = useState("");
  const [noteKind, setNoteKind] = useState<ActivityKindT>(ActivityKind.NOTE);
  const [posting, setPosting] = useState(false);

  const stageById = new Map<string, PipelineStageDto>(
    pipeline.stages.map((s) => [s.id, s]),
  );

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/crm/deals/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        deal: DealListItem;
        activities: Activity[];
        proposals: Proposal[];
      };
      setDeal(json.deal);
      setActivities(json.activities ?? []);
      setProposals(json.proposals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deal");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!dealId) {
      setDeal(null);
      setActivities([]);
      setProposals([]);
      setError(null);
      return;
    }
    void load(dealId);
  }, [dealId, load]);

  // Esc to close.
  useEffect(() => {
    if (!dealId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dealId, onClose]);

  async function postNote(e: React.FormEvent) {
    e.preventDefault();
    if (!dealId || !noteText.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/crm/deals/${dealId}/activities`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: noteKind,
          summary: noteText.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const { activity } = (await res.json()) as { activity: Activity };
      setActivities((prev) => [activity, ...prev]);
      setNoteText("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add activity");
    } finally {
      setPosting(false);
    }
  }

  async function changeStage(toStageId: string) {
    if (!dealId || !deal || deal.stageId === toStageId) return;
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
      setDeal(updated);
      // Re-fetch activities so the auto-emitted STAGE_CHANGE shows up.
      void load(dealId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update stage");
    }
  }

  /**
   * Triggers the `crm.generateProposal` worker job. We don't wait for the
   * worker to finish; we just refresh the deal a few seconds later so the
   * new Proposal row shows up. The SYSTEM activity logged by the service
   * makes the queued status visible immediately.
   */
  async function generateProposal() {
    if (!dealId || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/crm/deals/${dealId}/proposals`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok && res.status !== 202) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      // Reload immediately to pick up the SYSTEM activity, then again after
      // ~6s to catch the finished Proposal row.
      void load(dealId);
      setTimeout(() => {
        if (dealId) void load(dealId);
      }, 6000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start generation",
      );
    } finally {
      setGenerating(false);
    }
  }

  if (!dealId) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-ink-900/30 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto bg-white/90 p-5 shadow-2xl backdrop-blur-md"
        role="dialog"
        aria-label="Deal detail"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="label">Deal</span>
            <h2 className="mt-1 line-clamp-2 font-display text-xl font-semibold text-ink-900">
              {deal?.title ?? (loading ? "Loading…" : "Deal")}
            </h2>
            {deal && (
              <p className="mt-1 text-xs text-ink-500">
                {formatCurrency(deal.amountCents, deal.currency)} ·{" "}
                {deal.status}
              </p>
            )}
            {deal?.projectId && (
              <a
                href={`/projects/${deal.projectId}`}
                className="mt-1 inline-block text-xs font-medium text-emerald-700 hover:underline"
              >
                View project →
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M6 6l12 12M6 18L18 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        {error && (
          <p className="rounded-lg border-l-4 border-rose-400 bg-rose-50/70 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        {deal && (
          <section className="space-y-2">
            <span className="label">Stage</span>
            <select
              value={deal.stageId}
              onChange={(e) => void changeStage(e.target.value)}
              className="w-full text-sm"
            >
              {pipeline.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isWon ? " (Won)" : ""}
                  {s.isLost ? " (Lost)" : ""}
                </option>
              ))}
            </select>
            {deal.expectedCloseAt && (
              <p className="text-[11px] text-ink-500">
                Expected close:{" "}
                {new Date(deal.expectedCloseAt).toLocaleDateString()}
              </p>
            )}
          </section>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="label">Proposals</span>
            <button
              type="button"
              className="btn-primary text-xs"
              onClick={() => void generateProposal()}
              disabled={generating || !deal}
            >
              {generating ? "Queuing…" : "Generate"}
            </button>
          </div>
          {proposals.length === 0 ? (
            <p className="text-xs text-ink-400">
              No proposals yet. Click Generate to draft one with AI.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {proposals.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setOpenProposalId(p.id)}
                    className="w-full rounded-xl border border-white/60 bg-white/80 p-3 text-left text-sm transition hover:border-brand-400/60 hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink-900">
                        v{p.version}
                      </span>
                      <span className="text-[11px] uppercase tracking-wide text-ink-500">
                        {p.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-ink-500">
                      <span>
                        {p.aiModel ?? p.aiProvider ?? "—"}
                        {typeof p.aiCostUsd === "number" && (
                          <> · ${p.aiCostUsd.toFixed(3)}</>
                        )}
                      </span>
                      <time>{new Date(p.createdAt).toLocaleDateString()}</time>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <span className="label">Add activity</span>
          <form onSubmit={postNote} className="space-y-2">
            <select
              value={noteKind}
              onChange={(e) => setNoteKind(e.target.value as ActivityKindT)}
              className="w-full text-sm"
            >
              <option value={ActivityKind.NOTE}>Note</option>
              <option value={ActivityKind.CALL}>Call</option>
              <option value={ActivityKind.EMAIL_OUT}>Email sent</option>
              <option value={ActivityKind.EMAIL_IN}>Email received</option>
              <option value={ActivityKind.TASK}>Task</option>
            </select>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="What happened?"
              className="w-full text-sm"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="btn-primary"
                disabled={posting || !noteText.trim()}
              >
                {posting ? "Saving…" : "Add"}
              </button>
            </div>
          </form>
        </section>

        <section className="space-y-2">
          <span className="label">Timeline</span>
          {loading && activities.length === 0 ? (
            <p className="text-xs text-ink-500">Loading…</p>
          ) : activities.length === 0 ? (
            <p className="text-xs text-ink-400">No activity yet.</p>
          ) : (
            <ol className="space-y-2">
              {activities.map((a) => (
                <li
                  key={a.id}
                  className="rounded-xl border border-white/60 bg-white/80 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                      {labelForKind(a.kind)}
                    </span>
                    <time className="text-[11px] text-ink-400">
                      {new Date(a.occurredAt).toLocaleString()}
                    </time>
                  </div>
                  <p className="mt-1 text-ink-800">
                    {a.kind === ActivityKind.STAGE_CHANGE
                      ? renderStageChange(a, stageById)
                      : a.summary}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
      <ProposalViewer
        proposalId={openProposalId}
        onClose={() => setOpenProposalId(null)}
        onUpdated={() => {
          if (dealId) void load(dealId);
          router.refresh();
        }}
      />
    </div>
  );
}

function labelForKind(kind: ActivityKindT): string {
  switch (kind) {
    case ActivityKind.NOTE:
      return "Note";
    case ActivityKind.CALL:
      return "Call";
    case ActivityKind.EMAIL_OUT:
      return "Email sent";
    case ActivityKind.EMAIL_IN:
      return "Email received";
    case ActivityKind.TASK:
      return "Task";
    case ActivityKind.STAGE_CHANGE:
      return "Stage change";
    case ActivityKind.SYSTEM:
      return "System";
    default:
      return kind;
  }
}

function renderStageChange(
  a: Activity,
  stageById: Map<string, PipelineStageDto>,
): string {
  const meta = a.metadata ?? {};
  const fromId = (meta as { fromStageId?: string }).fromStageId;
  const toId = (meta as { toStageId?: string }).toStageId;
  const from = fromId ? (stageById.get(fromId)?.name ?? "?") : "?";
  const to = toId ? (stageById.get(toId)?.name ?? "?") : "?";
  return `${from} → ${to}`;
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
