'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createIntelReportAction } from '../actions';

export default function NewIntelForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const res = await createIntelReportAction(formData);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          if (res.id) router.push(`/intel/${res.id}`);
          else router.push('/intel');
        });
      }}
      className="glass space-y-4 p-4"
    >
      <div>
        <label className="block text-sm font-medium">Report title *</label>
        <input
          name="title"
          required
          minLength={2}
          maxLength={120}
          className="mt-1 w-full rounded-md border border-white/60 bg-white/80 px-3 py-2 text-sm"
          placeholder="Smith Dental — Aug 2025"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Business website *</label>
        <input
          name="primaryUrl"
          required
          className="mt-1 w-full rounded-md border border-white/60 bg-white/80 px-3 py-2 text-sm"
          placeholder="https://smithdental.com"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium">Category</label>
          <input
            name="category"
            maxLength={80}
            className="mt-1 w-full rounded-md border border-white/60 bg-white/80 px-3 py-2 text-sm"
            placeholder="dentist"
          />
          <p className="mt-1 text-xs text-ink-500">Used for auto-detecting competitors via Google Places.</p>
        </div>
        <div>
          <label className="block text-sm font-medium">City</label>
          <input
            name="city"
            maxLength={80}
            className="mt-1 w-full rounded-md border border-white/60 bg-white/80 px-3 py-2 text-sm"
            placeholder="Austin"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Country</label>
          <input
            name="country"
            maxLength={80}
            className="mt-1 w-full rounded-md border border-white/60 bg-white/80 px-3 py-2 text-sm"
            placeholder="United States"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium">Manual competitor URLs</label>
        <textarea
          name="competitorUrls"
          rows={3}
          className="mt-1 w-full rounded-md border border-white/60 bg-white/80 px-3 py-2 text-sm"
          placeholder="One URL per line, or comma-separated."
        />
        <p className="mt-1 text-xs text-ink-500">Up to 8 competitors total (manual + auto).</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="autoDetectCompetitors" defaultChecked />
          Auto-detect competitors via Google Places
        </label>
        <div>
          <label className="block text-sm font-medium">Max competitors</label>
          <input
            name="maxCompetitors"
            type="number"
            min={0}
            max={8}
            defaultValue={5}
            className="mt-1 w-full rounded-md border border-white/60 bg-white/80 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error && <div className="rounded-md bg-rose-50 p-2 text-sm text-rose-800">{error}</div>}

      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800 disabled:opacity-60"
        >
          {isPending ? 'Queueing…' : 'Generate report'}
        </button>
      </div>
    </form>
  );
}
