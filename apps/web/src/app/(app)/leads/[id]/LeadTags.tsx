'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addLeadTagAction, removeLeadTagAction } from '../actions';

export default function LeadTags({
  leadId,
  initial
}: {
  leadId: string;
  initial: string[];
}) {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>(initial);
  const [input, setInput] = useState('');
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function add() {
    const v = input.trim();
    if (!v) return;
    setErr(null);
    startTransition(async () => {
      const res = await addLeadTagAction(leadId, v);
      if (res.ok) {
        const norm = v.toLowerCase();
        setTags((prev) => (prev.includes(norm) ? prev : [...prev, norm]));
        setInput('');
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function remove(t: string) {
    setErr(null);
    startTransition(async () => {
      const res = await removeLeadTagAction(leadId, t);
      if (res.ok) {
        setTags((prev) => prev.filter((x) => x !== t));
        router.refresh();
      } else setErr(res.error);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && (
          <span className="text-xs text-ink-400">No tags yet.</span>
        )}
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-ink-700"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              disabled={pending}
              className="text-ink-400 hover:text-rose-600 disabled:opacity-50"
              aria-label={`Remove ${t}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="add tag…"
          className="w-48 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={pending || !input.trim()}
          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-white/70 disabled:opacity-50"
        >
          Add
        </button>
        {err && <span className="text-xs text-rose-600">{err}</span>}
      </div>
    </div>
  );
}
