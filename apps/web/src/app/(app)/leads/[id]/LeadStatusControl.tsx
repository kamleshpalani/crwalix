'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setLeadStatusAction } from '../actions';

const STATUSES: Array<{ value: 'NEW' | 'REVIEWED' | 'EXPORTED' | 'ARCHIVED'; label: string }> = [
  { value: 'NEW', label: 'New' },
  { value: 'REVIEWED', label: 'Reviewed' },
  { value: 'EXPORTED', label: 'Exported' },
  { value: 'ARCHIVED', label: 'Archived' }
];

export default function LeadStatusControl({
  leadId,
  current
}: {
  leadId: string;
  current: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function set(value: 'NEW' | 'REVIEWED' | 'EXPORTED' | 'ARCHIVED') {
    if (value === current) return;
    startTransition(async () => {
      const res = await setLeadStatusAction(leadId, value);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="inline-flex glass p-0.5 text-xs">
      {STATUSES.map((s) => (
        <button
          key={s.value}
          type="button"
          disabled={pending || current === s.value}
          onClick={() => set(s.value)}
          className={
            'rounded px-2.5 py-1 transition ' +
            (current === s.value
              ? 'bg-slate-900 text-white'
              : 'text-ink-600 hover:bg-slate-100 disabled:opacity-50')
          }
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
