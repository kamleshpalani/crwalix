"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const STARTER = "Hi! Ask me about your milestones, invoices, or proposal.";

export default function PortalChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: STARTER },
  ]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/portal/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          // Send last 6 turns as history (drop the synthetic starter).
          history: next
            .slice(-7, -1)
            .filter((m) => m.content !== STARTER)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        reply?: string;
        error?: { code?: string };
      } | null;
      if (!res.ok || !json?.reply) {
        const code = json?.error?.code;
        setError(
          code === "RATE_LIMITED"
            ? "You've hit the hourly limit. Try again later."
            : "Sorry, I couldn't answer just now. Please try again.",
        );
        return;
      }
      setMessages((cur) => [
        ...cur,
        { role: "assistant", content: json.reply! },
      ]);
    } catch {
      setError("Network error — please retry.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-lg hover:bg-slate-800"
      >
        Ask the project assistant
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex h-[480px] w-[360px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">
          Project assistant
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          ×
        </button>
      </header>
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-8 rounded-2xl rounded-br-sm bg-slate-900 px-3 py-2 text-sm text-white"
                : "mr-8 rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800"
            }
          >
            {m.content}
          </div>
        ))}
        {busy ? (
          <div className="mr-8 rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-500">
            Thinking…
          </div>
        ) : null}
        {error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        ) : null}
      </div>
      <form
        className="flex items-center gap-2 border-t border-slate-200 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your project…"
          className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
