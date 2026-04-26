'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setLeadStatusBulkAction } from './actions';

const STATUSES = ['NEW', 'REVIEWED', 'EXPORTED', 'ARCHIVED'] as const;
type Status = (typeof STATUSES)[number];

export default function LeadsBulkActions({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // Wire up checkboxes rendered server-side as <input data-lead-id="..." />.
  useEffect(() => {
    function onChange(e: Event) {
      const t = e.target as HTMLInputElement;
      if (!(t instanceof HTMLInputElement)) return;
      const id = t.dataset.leadId;
      if (!id) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (t.checked) next.add(id);
        else next.delete(id);
        return next;
      });
    }
    document.addEventListener('change', onChange);
    return () => document.removeEventListener('change', onChange);
  }, []);

  function toggleAll(check: boolean) {
    document
      .querySelectorAll<HTMLInputElement>('input[data-lead-id]')
      .forEach((el) => {
        el.checked = check;
      });
    setSelected(check ? new Set(ids) : new Set());
  }

  function apply(status: Status) {
    if (selected.size === 0) return;
    setMsg(null);
    startTransition(async () => {
      const res = await setLeadStatusBulkAction(Array.from(selected), status);
      if (res.ok) {
        setMsg(`Updated ${res.count} lead(s) → ${status}`);
        toggleAll(false);
        router.refresh();
      } else {
        setMsg(res.error);
      }
    });
  }

  return (
    <div className="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-2 glass px-3 py-2 text-sm shadow-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={selected.size > 0 && selected.size === ids.length}
          onChange={(e) => toggleAll(e.currentTarget.checked)}
          className="h-4 w-4"
        />
        <span className="text-xs text-ink-500">
          {selected.size === 0 ? 'Select all on page' : `${selected.size} selected`}
        </span>
      </label>
      <div className="ml-auto flex flex-wrap gap-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            disabled={isPending || selected.size === 0}
            onClick={() => apply(s)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-white/70 disabled:opacity-40"
          >
            Mark {s}
          </button>
        ))}
      </div>
      {msg && <span className="w-full text-xs text-ink-500">{msg}</span>}
    </div>
  );
}
