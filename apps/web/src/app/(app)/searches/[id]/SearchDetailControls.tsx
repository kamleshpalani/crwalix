'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import {
  rerunSearchAction,
  rescoreSearchAction,
  deleteSearchAction,
  cancelRunAction,
  duplicateSearchAction
} from './actions';

const REFRESHING_STATUSES = new Set(['QUEUED', 'RUNNING']);

export default function SearchDetailControls({
  searchId,
  latestStatus,
  latestRunId
}: {
  searchId: string;
  latestStatus?: string | null;
  latestRunId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Auto-refresh while a run is in flight.
  useEffect(() => {
    if (!latestStatus || !REFRESHING_STATUSES.has(latestStatus)) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [latestStatus, router]);

  function call(fn: typeof rerunSearchAction) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn(searchId);
      if (res.ok) {
        setMsg({ kind: 'ok', text: res.message });
        router.refresh();
      } else {
        setMsg({ kind: 'err', text: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {latestRunId && latestStatus && REFRESHING_STATUSES.has(latestStatus) && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setMsg(null);
              startTransition(async () => {
                const res = await cancelRunAction(searchId, latestRunId);
                if (res.ok) {
                  setMsg({ kind: 'ok', text: res.message });
                  router.refresh();
                } else {
                  setMsg({ kind: 'err', text: res.error });
                }
              });
            }}
            className="rounded-md border border-amber-300 bg-white px-4 py-2 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          >
            Cancel run
          </button>
        )}
        <form
          action={(fd) => {
            if (!confirm('Delete this search and all its runs?')) return;
            startTransition(async () => {
              await deleteSearchAction(fd);
            });
          }}
        >
          <input type="hidden" name="id" value={searchId} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-rose-300 bg-white px-4 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            Delete
          </button>
        </form>
        <button
          type="button"
          disabled={pending}
          onClick={() => call(rescoreSearchAction)}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-white/70 disabled:opacity-50"
        >
          Re-score
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            startTransition(async () => {
              const res = await duplicateSearchAction(searchId);
              if (res.ok && res.newId) {
                router.push(`/searches/${res.newId}`);
              } else if (!res.ok) {
                setMsg({ kind: 'err', text: res.error });
              }
            });
          }}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-white/70 disabled:opacity-50"
        >
          Duplicate
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => call(rerunSearchAction)}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? 'Working…' : 'Re-run'}
        </button>
      </div>
      {msg && (
        <span
          className={
            'rounded-md px-2 py-1 text-xs ' +
            (msg.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200')
          }
        >
          {msg.text}
        </span>
      )}
    </div>
  );
}
