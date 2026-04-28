'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LEAD_STATUS_LIFECYCLE, LEAD_STATUS_LABELS, type LeadStatus } from '@crawlix/shared';
import { setLeadStatusAction } from '../actions';

export default function LeadStatusControl({
  leadId,
  current
}: {
  leadId: string;
  current: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function set(value: LeadStatus) {
    if (value === current) return;
    startTransition(async () => {
      const res = await setLeadStatusAction(leadId, value);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="inline-flex flex-wrap glass p-0.5 text-xs">
      {LEAD_STATUS_LIFECYCLE.map((s) => (
        <button
          key={s}
          type="button"
          disabled={pending || current === s}
          onClick={() => set(s)}
          className={
            'rounded px-2.5 py-1 transition ' +
            (current === s
              ? 'bg-slate-900 text-white'
              : 'text-ink-600 hover:bg-slate-100 disabled:opacity-50')
          }
        >
          {LEAD_STATUS_LABELS[s] ?? s}
        </button>
      ))}
    </div>
  );
}
