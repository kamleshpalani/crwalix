"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Article {
  id: string;
  title: string;
  content: string;
  sourceUrl: string | null;
  tags: string[];
  hasEmbedding: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Ticket {
  id: string;
  subject: string;
  status: string;
  channel: string;
  leadId: string | null;
  assignedUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AgentResult {
  answer: string;
  confidence: number;
  needsHandoff: boolean;
  citedArticles: { id: string; title: string }[];
}

export default function SupportClient({
  initialArticles,
  initialTickets,
}: {
  initialArticles: Article[];
  initialTickets: Ticket[];
}) {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [tickets] = useState<Ticket[]>(initialTickets);

  // KB form
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [kbBusy, setKbBusy] = useState(false);
  const [kbError, setKbError] = useState<string | null>(null);

  // Agent form
  const [question, setQuestion] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);

  async function submitArticle(e: React.FormEvent) {
    e.preventDefault();
    setKbBusy(true);
    setKbError(null);
    try {
      const res = await fetch("/api/v1/support/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          sourceUrl: sourceUrl.trim() === "" ? null : sourceUrl.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.code ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { article: Article };
      setArticles((cur) => [data.article, ...cur]);
      setTitle("");
      setContent("");
      setSourceUrl("");
    } catch (err) {
      setKbError(err instanceof Error ? err.message : "Failed");
    } finally {
      setKbBusy(false);
    }
  }

  async function deleteArticle(id: string) {
    const res = await fetch(`/api/v1/support/knowledge/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setArticles((cur) => cur.filter((a) => a.id !== id));
    }
  }

  async function askAgent(e: React.FormEvent) {
    e.preventDefault();
    setAgentBusy(true);
    setAgentError(null);
    setAgentResult(null);
    try {
      const res = await fetch("/api/v1/support/agent/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.code ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as AgentResult;
      setAgentResult(data);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : "Failed");
    } finally {
      setAgentBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Knowledge base */}
      <section className="space-y-4 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-glass backdrop-blur lg:col-span-5">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-900">Knowledge base</h2>
          <span className="text-xs text-ink-500">
            {articles.length} article{articles.length === 1 ? "" : "s"}
          </span>
        </header>

        <form onSubmit={submitArticle} className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Article title"
            className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            required
            maxLength={200}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Article content (FAQ, policy, how-to…)"
            className="h-28 w-full resize-y rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            required
            maxLength={32000}
          />
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="Source URL (optional)"
            className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          {kbError && <p className="text-xs text-rose-600">{kbError}</p>}
          <button
            type="submit"
            disabled={kbBusy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {kbBusy ? "Embedding…" : "Add article"}
          </button>
        </form>

        <ul className="divide-y divide-ink-100">
          {articles.map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">
                  {a.title}
                </p>
                <p className="line-clamp-2 text-xs text-ink-500">{a.content}</p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-400">
                  <span>{a.hasEmbedding ? "embedded" : "no embedding"}</span>
                  {a.sourceUrl && (
                    <a
                      href={a.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-ink-600"
                    >
                      source
                    </a>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => deleteArticle(a.id)}
                className="text-xs text-rose-600 hover:underline"
              >
                Delete
              </button>
            </li>
          ))}
          {articles.length === 0 && (
            <li className="py-3 text-xs text-ink-500">
              No articles yet. Add one above to teach the agent.
            </li>
          )}
        </ul>
      </section>

      {/* Tickets */}
      <section className="space-y-4 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-glass backdrop-blur lg:col-span-3">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-900">Tickets</h2>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="text-xs text-ink-500 hover:text-ink-800"
          >
            Refresh
          </button>
        </header>
        <ul className="divide-y divide-ink-100">
          {tickets.map((t) => (
            <li key={t.id} className="py-3">
              <p className="truncate text-sm font-medium text-ink-900">
                {t.subject}
              </p>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-500">
                <span
                  className={
                    t.status === "PENDING"
                      ? "rounded-full bg-amber-100 px-2 py-0.5 text-amber-800"
                      : t.status === "RESOLVED"
                        ? "rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800"
                        : "rounded-full bg-ink-100 px-2 py-0.5 text-ink-700"
                  }
                >
                  {t.status}
                </span>
                <span>{t.channel}</span>
                <span>·</span>
                <span>{new Date(t.updatedAt).toLocaleDateString()}</span>
              </div>
            </li>
          ))}
          {tickets.length === 0 && (
            <li className="py-3 text-xs text-ink-500">No tickets yet.</li>
          )}
        </ul>
      </section>

      {/* Agent test */}
      <section className="space-y-4 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-glass backdrop-blur lg:col-span-4">
        <header>
          <h2 className="text-lg font-semibold text-ink-900">Try the agent</h2>
          <p className="text-xs text-ink-500">
            Ask any question. The agent grounds answers in your KB and flags
            handoff when unsure.
          </p>
        </header>

        <form onSubmit={askAgent} className="space-y-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What's your refund policy?"
            className="h-24 w-full resize-y rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            required
            maxLength={4000}
          />
          {agentError && <p className="text-xs text-rose-600">{agentError}</p>}
          <button
            type="submit"
            disabled={agentBusy || articles.length === 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {agentBusy ? "Thinking…" : "Ask"}
          </button>
          {articles.length === 0 && (
            <p className="text-xs text-ink-500">
              Add at least one KB article to enable the agent.
            </p>
          )}
        </form>

        {agentResult && (
          <div className="space-y-3 rounded-xl border border-ink-100 bg-white p-4">
            <div className="flex items-center gap-2 text-xs">
              <span
                className={
                  agentResult.needsHandoff
                    ? "rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800"
                    : "rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800"
                }
              >
                {agentResult.needsHandoff ? "Needs handoff" : "Confident"}
              </span>
              <span className="text-ink-500">
                confidence {Math.round(agentResult.confidence * 100)}%
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink-900">
              {agentResult.answer}
            </p>
            {agentResult.citedArticles.length > 0 && (
              <div className="border-t border-ink-100 pt-2 text-xs text-ink-500">
                <p className="mb-1 font-medium text-ink-700">Cited:</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {agentResult.citedArticles.map((c) => (
                    <li key={c.id}>{c.title}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
