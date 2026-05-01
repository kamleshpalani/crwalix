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
  dueAt?: string | null;
  isDone?: boolean;
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

interface NbaResult {
  headline: string;
  rationale: string;
  action: string;
  urgency: "NOW" | "THIS_WEEK" | "NEXT_WEEK" | "LOW";
  messageTemplate: string;
}

interface Props {
  readonly pipeline: PipelineDto;
  readonly dealId: string | null;
  readonly onClose: () => void;
}

const URGENCY_STYLES: Record<NbaResult["urgency"], string> = {
  NOW: "bg-rose-50 border-rose-300 text-rose-800",
  THIS_WEEK: "bg-amber-50 border-amber-300 text-amber-800",
  NEXT_WEEK: "bg-sky-50 border-sky-300 text-sky-800",
  LOW: "bg-slate-50 border-slate-200 text-slate-700",
};

const URGENCY_LABELS: Record<NbaResult["urgency"], string> = {
  NOW: "ðŸ”´ Act now",
  THIS_WEEK: "ðŸŸ¡ This week",
  NEXT_WEEK: "ðŸ”µ Next week",
  LOW: "âšª Low priority",
};

/**
 * Right-hand side drawer for a single deal. Lazy-loads detail + activities
 * the first time it opens for a given dealId.
 *
 * Â§12 features:
 * - Follow-up reminder date picker
 * - TASK activities: due date + completion toggle
 * - AI next-best-action recommendation
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

  // Add-activity state
  const [noteText, setNoteText] = useState("");
  const [noteKind, setNoteKind] = useState<ActivityKindT>(ActivityKind.NOTE);
  const [noteDueAt, setNoteDueAt] = useState("");
  const [posting, setPosting] = useState(false);

  // Follow-up state
  const [followUpDate, setFollowUpDate] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  // AI NBA state
  const [nba, setNba] = useState<NbaResult | null>(null);
  const [nbaLoading, setNbaLoading] = useState(false);
  const [nbaCopied, setNbaCopied] = useState(false);

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
      // Sync follow-up date field with stored value
      setFollowUpDate(
        json.deal.followUpAt ? json.deal.followUpAt.slice(0, 10) : "",
      );
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
      setNba(null);
      setError(null);
      return;
    }
    void load(dealId);
  }, [dealId, load]);

  // Esc to close
  useEffect(() => {
    if (!dealId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [dealId, onClose]);

  async function postNote(e: React.FormEvent) {
    e.preventDefault();
    if (!dealId || !noteText.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        kind: noteKind,
        summary: noteText.trim(),
      };
      if (noteKind === ActivityKind.TASK && noteDueAt) {
        body.dueAt = noteDueAt;
      }
      const res = await fetch(`/api/v1/crm/deals/${dealId}/activities`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error?.message ?? `HTTP ${res.status}`);
      }
      const { activity } = (await res.json()) as { activity: Activity };
      setActivities((prev) => [activity, ...prev]);
      setNoteText("");
      setNoteDueAt("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add activity");
    } finally {
      setPosting(false);
    }
  }

  async function toggleTaskDone(activityId: string, isDone: boolean) {
    if (!dealId) return;
    try {
      const res = await fetch(
        `/api/v1/crm/deals/${dealId}/activities/${activityId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isDone }),
        },
      );
      if (!res.ok) return;
      setActivities((prev) =>
        prev.map((a) => (a.id === activityId ? { ...a, isDone } : a)),
      );
    } catch {
      // non-critical â€” UI will be stale but won't crash
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
      void load(dealId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update stage");
    }
  }

  async function saveFollowUp() {
    if (!dealId || !deal) return;
    setSavingFollowUp(true);
    try {
      const res = await fetch(`/api/v1/crm/deals/${dealId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          followUpAt: followUpDate || null,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error?.message ?? `HTTP ${res.status}`);
      }
      const { deal: updated } = (await res.json()) as { deal: DealListItem };
      setDeal(updated);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save follow-up date",
      );
    } finally {
      setSavingFollowUp(false);
    }
  }

  async function loadNba() {
    if (!dealId || nbaLoading) return;
    setNbaLoading(true);
    setNba(null);
    try {
      const res = await fetch(`/api/v1/crm/deals/${dealId}/next-action`);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as NbaResult;
      setNba(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI recommendation failed");
    } finally {
      setNbaLoading(false);
    }
  }

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

  const openTasks = activities.filter(
    (a) => a.kind === ActivityKind.TASK && !a.isDone,
  );

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
        {/* Header */}
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="label">Deal</span>
            <h2 className="mt-1 line-clamp-2 font-display text-xl font-semibold text-ink-900">
              {deal?.title ?? (loading ? "Loadingâ€¦" : "Deal")}
            </h2>
            {deal && (
              <p className="mt-1 text-xs text-ink-500">
                {formatCurrency(deal.amountCents, deal.currency)} Â·{" "}
                {deal.status}
              </p>
            )}
            {deal?.projectId && (
              <a
                href={`/projects/${deal.projectId}`}
                className="mt-1 inline-block text-xs font-medium text-emerald-700 hover:underline"
              >
                View project â†’
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

        {/* Stage selector */}
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
                  {s.isLost ? " (Lost / No-go)" : ""}
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

        {/* â”€â”€ Follow-up reminder â”€â”€ */}
        {deal && (
          <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <span className="label text-amber-700">Follow-up reminder</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="flex-1 rounded-lg border border-white/60 bg-white/80 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <button
                type="button"
                disabled={savingFollowUp}
                onClick={() => void saveFollowUp()}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60 transition"
              >
                {savingFollowUp ? "Savingâ€¦" : "Set"}
              </button>
              {followUpDate && (
                <button
                  type="button"
                  onClick={() => {
                    setFollowUpDate("");
                    void saveFollowUp();
                  }}
                  className="text-xs text-ink-400 hover:text-rose-600"
                  title="Clear reminder"
                >
                  âœ•
                </button>
              )}
            </div>
            {deal.followUpAt && (
              <p className="text-[11px] text-amber-700">
                Reminder:{" "}
                {new Date(deal.followUpAt).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            )}
          </section>
        )}

        {/* â”€â”€ AI Next-Best-Action â”€â”€ */}
        <section className="space-y-2 rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-fuchsia-50 p-3">
          <div className="flex items-center justify-between">
            <span className="label text-brand-700">
              âœ¦ AI Next Best Action
            </span>
            <button
              type="button"
              disabled={nbaLoading || !deal}
              onClick={() => void loadNba()}
              className="rounded-lg bg-gradient-to-r from-brand-500 to-fuchsia-500 px-3 py-1 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60 transition"
            >
              {nbaLoading ? "Analysingâ€¦" : nba ? "â†» Refresh" : "Get Advice"}
            </button>
          </div>

          {nba && (
            <div
              className={`mt-2 rounded-xl border p-3 ${URGENCY_STYLES[nba.urgency]}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide">
                  {URGENCY_LABELS[nba.urgency]}
                </span>
              </div>
              <p className="mt-1 font-semibold">{nba.headline}</p>
              <p className="mt-1 text-sm opacity-90">{nba.rationale}</p>
              <p className="mt-2 rounded-lg bg-white/60 px-3 py-1.5 text-sm font-medium">
                â†’ {nba.action}
              </p>
              {nba.messageTemplate && (
                <div className="mt-3 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                    Message template
                  </p>
                  <p className="rounded-lg bg-white/60 px-3 py-2 text-xs italic">
                    {nba.messageTemplate}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(nba.messageTemplate);
                      setNbaCopied(true);
                      setTimeout(() => setNbaCopied(false), 2000);
                    }}
                    className="text-[11px] font-medium hover:underline"
                  >
                    {nbaCopied ? "âœ“ Copied" : "Copy message"}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* â”€â”€ Open tasks summary â”€â”€ */}
        {openTasks.length > 0 && (
          <section className="space-y-2">
            <span className="label text-rose-700">
              Open tasks ({openTasks.length})
            </span>
            <ul className="space-y-1.5">
              {openTasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50/60 p-2.5 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => void toggleTaskDone(t.id, true)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border border-rose-300 hover:bg-rose-200 transition"
                    title="Mark done"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-ink-800">{t.summary}</p>
                    {t.dueAt && (
                      <p className="mt-0.5 text-[11px] text-rose-600">
                        Due {new Date(t.dueAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* â”€â”€ Proposals â”€â”€ */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="label">Proposals</span>
            <button
              type="button"
              className="btn-primary text-xs"
              onClick={() => void generateProposal()}
              disabled={generating || !deal}
            >
              {generating ? "Queuingâ€¦" : "Generate"}
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
                        {p.aiModel ?? p.aiProvider ?? "â€”"}
                        {typeof p.aiCostUsd === "number" && (
                          <> Â· ${p.aiCostUsd.toFixed(3)}</>
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

        {/* â”€â”€ Add activity â”€â”€ */}
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
            {noteKind === ActivityKind.TASK && (
              <div className="flex items-center gap-2 text-sm">
                <label
                  htmlFor="noteDueAt"
                  className="shrink-0 text-xs text-ink-600"
                >
                  Due date
                </label>
                <input
                  id="noteDueAt"
                  type="date"
                  value={noteDueAt}
                  onChange={(e) => setNoteDueAt(e.target.value)}
                  className="flex-1 rounded-lg border border-white/60 bg-white/80 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            )}
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={
                noteKind === ActivityKind.TASK
                  ? "What needs to be done?"
                  : "What happened?"
              }
              className="w-full text-sm"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="btn-primary"
                disabled={posting || !noteText.trim()}
              >
                {posting ? "Savingâ€¦" : "Add"}
              </button>
            </div>
          </form>
        </section>

        {/* â”€â”€ Timeline â”€â”€ */}
        <section className="space-y-2">
          <span className="label">Timeline</span>
          {loading && activities.length === 0 ? (
            <p className="text-xs text-ink-500">Loadingâ€¦</p>
          ) : activities.length === 0 ? (
            <p className="text-xs text-ink-400">No activity yet.</p>
          ) : (
            <ol className="space-y-2">
              {activities.map((a) => (
                <li
                  key={a.id}
                  className={`rounded-xl border p-3 text-sm ${
                    a.kind === ActivityKind.TASK
                      ? a.isDone
                        ? "border-emerald-100 bg-emerald-50/60 opacity-60"
                        : "border-rose-100 bg-rose-50/60"
                      : "border-white/60 bg-white/80"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {a.kind === ActivityKind.TASK && (
                        <button
                          type="button"
                          onClick={() => void toggleTaskDone(a.id, !a.isDone)}
                          className={`h-4 w-4 shrink-0 rounded border transition ${
                            a.isDone
                              ? "border-emerald-400 bg-emerald-400"
                              : "border-rose-300 hover:bg-rose-100"
                          }`}
                          title={a.isDone ? "Mark undone" : "Mark done"}
                        >
                          {a.isDone && (
                            <svg
                              viewBox="0 0 12 12"
                              fill="none"
                              className="h-full w-full p-0.5"
                            >
                              <path
                                d="M2 6l3 3 5-5"
                                stroke="white"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                          )}
                        </button>
                      )}
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                        {labelForKind(a.kind)}
                        {a.isDone ? " âœ“" : ""}
                      </span>
                    </div>
                    <time className="text-[11px] text-ink-400">
                      {new Date(a.occurredAt).toLocaleString()}
                    </time>
                  </div>
                  <p className="mt-1 text-ink-800">
                    {a.kind === ActivityKind.STAGE_CHANGE
                      ? renderStageChange(a, stageById)
                      : a.summary}
                  </p>
                  {a.kind === ActivityKind.TASK && a.dueAt && (
                    <p
                      className={`mt-0.5 text-[11px] ${
                        !a.isDone && new Date(a.dueAt) < new Date()
                          ? "font-semibold text-rose-600"
                          : "text-ink-400"
                      }`}
                    >
                      Due {new Date(a.dueAt).toLocaleDateString()}
                      {!a.isDone && new Date(a.dueAt) < new Date()
                        ? " â€” overdue"
                        : ""}
                    </p>
                  )}
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
  return `${from} â†’ ${to}`;
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
