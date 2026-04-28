'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { auditLeadWebsiteAction } from '../actions';

export default function AuditWebsiteButton({
  leadId,
  hasWebsite
}: {
  leadId: string;
  hasWebsite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await auditLeadWebsiteAction(leadId);
      if (res.ok) {
        setQueued(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={!hasWebsite || pending}
        onClick={run}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? 'Queuing…' : queued ? 'Queued' : 'Re-audit website'}
      </button>
      {!hasWebsite && (
        <span className="text-xs text-ink-500">No website on file.</span>
      )}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
