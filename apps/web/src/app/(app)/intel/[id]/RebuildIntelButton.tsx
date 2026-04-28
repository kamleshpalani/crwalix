'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { rebuildIntelReportAction } from '../actions';

export default function RebuildIntelButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const res = await rebuildIntelReportAction(formData);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          router.refresh();
        });
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="autoDetectCompetitors" value="on" />
      <input type="hidden" name="maxCompetitors" value="5" />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-ink-900 px-3 py-2 text-sm font-medium text-white hover:bg-ink-800 disabled:opacity-60"
      >
        {isPending ? 'Queueing…' : 'Re-run report'}
      </button>
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </form>
  );
}
