'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setLeadNotesAction } from '../actions';

export default function LeadNotes({
  leadId,
  initial
}: {
  leadId: string;
  initial: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? '');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = (value ?? '') !== (initial ?? '');

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={5}
        placeholder="Internal notes about this lead…"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={() => {
            setMsg(null);
            startTransition(async () => {
              const res = await setLeadNotesAction(leadId, value);
              if (res.ok) {
                setMsg('Saved');
                router.refresh();
              } else setMsg(res.error);
            });
          }}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save notes'}
        </button>
        {dirty && !pending && (
          <button
            type="button"
            onClick={() => setValue(initial ?? '')}
            className="text-xs text-ink-500 hover:text-ink-900"
          >
            Reset
          </button>
        )}
        {msg && <span className="text-xs text-ink-500">{msg}</span>}
        <span className="ml-auto text-xs text-ink-400">{value.length} / 4000</span>
      </div>
    </div>
  );
}
