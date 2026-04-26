'use client';

import { useState, useTransition } from 'react';
import { saveProviderConfigAction } from './actions';

export default function ProviderConfigForm({
  provider,
  enabled,
  dailyBudget
}: {
  provider: string;
  enabled: boolean;
  dailyBudget: number | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      action={(formData) => {
        setMsg(null);
        startTransition(async () => {
          const res = await saveProviderConfigAction(formData);
          setMsg(res.ok ? 'Saved' : res.error);
        });
      }}
      className="flex shrink-0 flex-col items-end gap-2 text-sm"
    >
      <input type="hidden" name="provider" value={provider} />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          className="h-4 w-4"
        />
        <span>Enabled</span>
      </label>
      <label className="flex items-center gap-2">
        <span className="text-xs text-ink-500">Daily budget</span>
        <input
          type="number"
          name="dailyBudget"
          defaultValue={dailyBudget ?? ''}
          min={0}
          className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-xs"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {isPending ? 'Saving…' : 'Save'}
      </button>
      {msg && <span className="text-xs text-ink-500">{msg}</span>}
    </form>
  );
}
