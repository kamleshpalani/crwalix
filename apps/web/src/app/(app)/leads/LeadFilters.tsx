'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

const SORTS: Array<{ value: string; label: string }> = [
  { value: '-score', label: 'Score (desc)' },
  { value: 'score', label: 'Score (asc)' },
  { value: '-updatedAt', label: 'Recently updated' },
  { value: 'name', label: 'Name (A→Z)' },
  { value: '-name', label: 'Name (Z→A)' }
];

const TIERS = ['HIGH', 'MEDIUM', 'LOW'];
const STATUSES = ['NEW', 'ENRICHED', 'REVIEWED', 'EXPORTED', 'ARCHIVED'];
const WEBSITE = [
  { value: 'EXISTS', label: 'Has website' },
  { value: 'EXISTS_MISSING_IN_SOURCE', label: 'Found via enrichment' },
  { value: 'LIKELY_NONE', label: 'Likely none' },
  { value: 'HIGH_CONFIDENCE_NONE', label: 'Confirmed none' },
  { value: 'UNKNOWN', label: 'Unknown' }
];

export default function LeadFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  // useSearchParams() may be null when rendered above the route boundary;
  // wrap to keep callers terse.
  const get = (k: string) => sp?.get(k) ?? '';

  function update(form: HTMLFormElement) {
    const fd = new FormData(form);
    const params = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      const s = String(v).trim();
      if (s) params.set(k, s);
    }
    // Reset to page 1 on filter change.
    params.delete('page');
    startTransition(() => {
      router.push(`/leads${params.toString() ? '?' + params.toString() : ''}`);
    });
  }

  return (
    <form
      onChange={(e) => update(e.currentTarget)}
      onSubmit={(e) => {
        e.preventDefault();
        update(e.currentTarget);
      }}
      className="grid grid-cols-2 gap-3 glass p-4 md:grid-cols-6"
    >
      <div className="col-span-2 md:col-span-2">
        <label className="block text-xs font-medium text-ink-700">Search</label>
        <input
          name="search"
          defaultValue={get('search')}
          placeholder="Name or phone…"
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-700">City</label>
        <input
          name="city"
          defaultValue={get('city')}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-700">Country</label>
        <input
          name="country"
          maxLength={2}
          defaultValue={get('country')}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm uppercase"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-700">Min score</label>
        <input
          name="minScore"
          type="number"
          min={0}
          max={100}
          defaultValue={get('minScore')}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-700">Sort</label>
        <select
          name="sort"
          defaultValue={(get('sort') || '-score')}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-2 md:col-span-3">
        <label className="block text-xs font-medium text-ink-700">Priority tier</label>
        <select
          name="priorityTier"
          defaultValue={get('priorityTier')}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Any</option>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2 md:col-span-3">
        <label className="block text-xs font-medium text-ink-700">Website status</label>
        <select
          name="websiteStatus"
          defaultValue={get('websiteStatus')}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Any</option>
          {WEBSITE.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2 md:col-span-6">
        <label className="block text-xs font-medium text-ink-700">Lead status</label>
        <select
          name="status"
          defaultValue={get('status')}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Any</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Preserve drilldown filters when present. */}
      {['projectId', 'searchId', 'listId'].map((k) => {
        const v = get(k);
        return v ? <input key={k} type="hidden" name={k} value={v} /> : null;
      })}

      <div className="col-span-2 flex items-center justify-end gap-2 md:col-span-6">
        {pending && <span className="text-xs text-ink-500">Updating…</span>}
        <a
          href="/leads"
          className="rounded-md px-3 py-1.5 text-sm text-ink-600 hover:text-ink-900"
        >
          Reset
        </a>
      </div>
    </form>
  );
}
