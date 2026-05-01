"use client";

import { useEffect, useState } from "react";
import { ProposalStatus } from "@crawlix/shared";

interface Proposal {
  id: string;
  version: number;
  status: string;
  bodyHtml: string | null;
  shareToken?: string | null;
  sentAt?: string | null;
  viewedAt?: string | null;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  createdAt: string;
}

interface Props {
  readonly proposalId: string | null;
  readonly onClose: () => void;
  readonly onUpdated: () => void;
}

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["READY"],
  READY: ["SENT"],
  SENT: ["ACCEPTED", "DECLINED"],
  VIEWED: ["ACCEPTED", "DECLINED"],
  ACCEPTED: [],
  DECLINED: [],
};

/**
 * Full-screen modal that renders a proposal's HTML body and exposes the
 * status transition controls + share link. Body is editable while the
 * proposal is DRAFT or READY; after SENT it becomes read-only.
 */
export default function ProposalViewer({
  proposalId,
  onClose,
  onUpdated,
}: Props) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Send-to-client modal state
  const [showSendForm, setShowSendForm] = useState(false);
  const [sendEmail, setSendEmail] = useState("");
  const [sendClientName, setSendClientName] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    ok: boolean;
    error?: string | null;
  } | null>(null);

  // Convert-to-project state
  const [converting, setConverting] = useState(false);
  const [convertedProjectId, setConvertedProjectId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!proposalId) {
      setProposal(null);
      setEditingBody(null);
      setError(null);
      setShowSendForm(false);
      setSendResult(null);
      setConvertedProjectId(null);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/crm/proposals/${proposalId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { proposal: Proposal };
        if (!cancelled) setProposal(json.proposal);
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
  }, [proposalId]);

  useEffect(() => {
    if (!proposalId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showSendForm) {
          setShowSendForm(false);
          return;
        }
        onClose();
      }
    }
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [proposalId, onClose, showSendForm]);

  async function patch(body: Record<string, unknown>) {
    if (!proposalId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/crm/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }
      const { proposal: updated } = (await res.json()) as {
        proposal: Proposal;
      };
      setProposal(updated);
      setEditingBody(null);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function copyShareLink() {
    if (!proposal?.shareToken) return;
    const url = `${globalThis.location.origin}/p/${proposal.shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  async function submitSend(e: React.FormEvent) {
    e.preventDefault();
    if (!proposalId || !sendEmail) return;
    setSending(true);
    setSendResult(null);
    setError(null);
    try {
      const res = await fetch(`/api/v1/crm/proposals/${proposalId}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toEmail: sendEmail,
          clientName: sendClientName || undefined,
          message: sendMessage || undefined,
        }),
      });
      const json = (await res.json()) as {
        proposal?: Proposal;
        email?: { ok: boolean; error?: string | null };
        error?: { message?: string };
      };
      if (!res.ok)
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      if (json.proposal) setProposal(json.proposal);
      setSendResult(json.email ?? { ok: true });
      onUpdated();
      // Keep form visible to show success; user can close.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  async function convertToProject() {
    if (!proposalId) return;
    setConverting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/crm/proposals/${proposalId}/convert-to-project`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      const json = (await res.json()) as {
        project?: { id: string; name: string };
        error?: { message?: string };
      };
      if (!res.ok)
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      if (json.project) setConvertedProjectId(json.project.id);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setConverting(false);
    }
  }

  if (!proposalId) return null;

  const editable =
    proposal?.status === ProposalStatus.DRAFT ||
    proposal?.status === ProposalStatus.READY;
  const canSend =
    proposal?.status === ProposalStatus.DRAFT ||
    proposal?.status === ProposalStatus.READY ||
    proposal?.status === ProposalStatus.SENT ||
    proposal?.status === ProposalStatus.VIEWED;
  const canConvertToProject =
    proposal?.status === ProposalStatus.ACCEPTED && !convertedProjectId;
  const nextStatuses = proposal ? (TRANSITIONS[proposal.status] ?? []) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (showSendForm) {
            setShowSendForm(false);
            return;
          }
          onClose();
        }
      }}
      role="presentation"
    >
      <div className="glass-lg flex h-[90vh] w-full max-w-4xl flex-col gap-4 p-5">
        <header className="flex items-start justify-between gap-3 border-b border-white/40 pb-3">
          <div>
            <span className="label">Proposal</span>
            <h2 className="font-display text-xl font-semibold text-ink-900">
              {proposal ? `Version ${proposal.version}` : "Loading…"}
            </h2>
            {proposal && (
              <p className="mt-1 text-xs text-ink-500">
                Status: <strong>{proposal.status}</strong>
                {proposal.sentAt && (
                  <> · Sent {new Date(proposal.sentAt).toLocaleDateString()}</>
                )}
                {proposal.viewedAt && (
                  <>
                    {" "}
                    · Viewed {new Date(proposal.viewedAt).toLocaleDateString()}
                  </>
                )}
                {proposal.acceptedAt && (
                  <>
                    {" "}
                    · Accepted{" "}
                    {new Date(proposal.acceptedAt).toLocaleDateString()}
                  </>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {error && (
          <p className="rounded-lg border-l-4 border-rose-400 bg-rose-50/70 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        {/* Send-to-client inline form */}
        {showSendForm && (
          <form
            onSubmit={(e) => void submitSend(e)}
            className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4"
          >
            <p className="text-sm font-medium text-indigo-900">
              Send proposal to client
            </p>
            <div className="flex flex-wrap gap-3">
              <input
                type="email"
                required
                placeholder="client@example.com"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                className="input flex-1 min-w-[200px] text-sm"
                aria-label="Client email"
              />
              <input
                type="text"
                placeholder="Client name (optional)"
                value={sendClientName}
                onChange={(e) => setSendClientName(e.target.value)}
                className="input flex-1 min-w-[160px] text-sm"
              />
            </div>
            <textarea
              placeholder="Personal message to include in the email (optional)"
              value={sendMessage}
              onChange={(e) => setSendMessage(e.target.value)}
              rows={2}
              className="input w-full resize-none text-sm"
            />
            {sendResult && (
              <p
                className={`text-xs ${sendResult.ok ? "text-emerald-700" : "text-rose-700"}`}
              >
                {sendResult.ok
                  ? "Proposal sent successfully!"
                  : `Email delivery warning: ${sendResult.error ?? "unknown error"}`}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                className="btn-primary text-xs"
                disabled={sending}
              >
                {sending ? "Sending…" : "Send email"}
              </button>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => {
                  setShowSendForm(false);
                  setSendResult(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Convert-to-project success banner */}
        {convertedProjectId && (
          <p className="rounded-lg border-l-4 border-emerald-400 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800">
            Project created.{" "}
            <a
              href={`/projects/${convertedProjectId}`}
              className="underline font-medium"
            >
              Open project →
            </a>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-b border-white/40 pb-3">
          {nextStatuses.map((s) => (
            <button
              key={s}
              type="button"
              className="btn-primary text-xs"
              disabled={saving}
              onClick={() => void patch({ status: s })}
            >
              Mark as {s}
            </button>
          ))}

          {/* Send to client */}
          {canSend && !showSendForm && (
            <button
              type="button"
              className="btn-primary text-xs"
              onClick={() => setShowSendForm(true)}
            >
              Send to client
            </button>
          )}

          {/* Convert to project */}
          {canConvertToProject && (
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={converting}
              onClick={() => void convertToProject()}
            >
              {converting ? "Creating project…" : "Convert to project"}
            </button>
          )}

          {proposal?.shareToken && (
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => void copyShareLink()}
            >
              {copied ? "Copied!" : "Copy share link"}
            </button>
          )}
          {proposal && (
            <a
              href={`/api/v1/crm/proposals/${proposal.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost text-xs"
            >
              Download PDF
            </a>
          )}
          {editable && proposal && editingBody === null && (
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => setEditingBody(proposal.bodyHtml ?? "")}
            >
              Edit body
            </button>
          )}
          {editingBody !== null && (
            <>
              <button
                type="button"
                className="btn-primary text-xs"
                disabled={saving}
                onClick={() => void patch({ bodyHtml: editingBody })}
              >
                Save
              </button>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => setEditingBody(null)}
              >
                Cancel
              </button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto rounded-xl border border-white/60 bg-white/90 p-6">
          {loading && <p className="text-sm text-ink-500">Loading…</p>}
          {!loading && editingBody !== null && (
            <textarea
              value={editingBody}
              onChange={(e) => setEditingBody(e.target.value)}
              className="h-full min-h-[400px] w-full font-mono text-xs"
            />
          )}
          {!loading && editingBody === null && proposal?.bodyHtml && (
            <article
              className="prose prose-ink max-w-none"
              // eslint-disable-next-line react/no-danger -- internal preview only
              dangerouslySetInnerHTML={{ __html: proposal.bodyHtml }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
