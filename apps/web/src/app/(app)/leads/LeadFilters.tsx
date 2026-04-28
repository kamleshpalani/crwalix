'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { LEAD_STATUS_LIFECYCLE, LEAD_STATUS_LABELS, BUSINESS_SCALE_LABELS } from '@crawlix/shared';
import {
  getAllCountries,
  getStatesByCountry,
  getCitiesByState
} from '@/lib/locations';

const SORTS: Array<{ value: string; label: string }> = [
  { value: '-score', label: 'Score (desc)' },
  { value: 'score', label: 'Score (asc)' },
  { value: '-updatedAt', label: 'Recently updated' },
  { value: 'name', label: 'Name (A→Z)' },
  { value: '-name', label: 'Name (Z→A)' }
];

const TIERS = ['HIGH', 'MEDIUM', 'LOW'];
const STATUSES = LEAD_STATUS_LIFECYCLE;
const WEBSITE = [
  { value: 'EXISTS', label: 'Has website (raw)' },
  { value: 'EXISTS_MISSING_IN_SOURCE', label: 'Found via enrichment' },
  { value: 'LIKELY_NONE', label: 'Likely none' },
  { value: 'HIGH_CONFIDENCE_NONE', label: 'Confirmed none' },
  { value: 'UNKNOWN', label: 'Unknown' }
];

const HEALTH = [
  { value: 'FRESH', label: 'Fresh — modern site' },
  { value: 'NEEDS_REVIEW', label: 'Needs review' },
  { value: 'OUTDATED', label: 'Outdated' },
  { value: 'UNREACHABLE', label: 'Unreachable / parked' },
  { value: 'NOT_AUDITED', label: 'Not audited yet' }
];

const FIT = [
  { value: 'true', label: 'Suitable to contact' },
  { value: 'false', label: 'Skip — low pitch value' }
];

export default function LeadFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  // useSearchParams() may be null when rendered above the route boundary;
  // wrap to keep callers terse.
  const get = (k: string) => sp?.get(k) ?? '';

  const countries = useMemo(() => getAllCountries(), []);

  // Cascading geo state. Country is ISO-2; state/city are stored as
  // readable names (which is what the ingest pipeline writes onto leads).
  const [countryCode, setCountryCode] = useState<string>(() =>
    (get('country') || '').toUpperCase()
  );
  const [stateName, setStateNameLocal] = useState<string>(() => get('state'));
  const [city, setCity] = useState<string>(() => get('city'));

  const states = useMemo(
    () => (countryCode ? getStatesByCountry(countryCode) : []),
    [countryCode]
  );
  const selectedStateCode = useMemo(() => {
    if (!stateName) return '';
    const hit = states.find(
      (s) => s.name.toLowerCase() === stateName.toLowerCase()
    );
    return hit?.code ?? '';
  }, [states, stateName]);
  const cities = useMemo(
    () =>
      countryCode && selectedStateCode
        ? getCitiesByState(countryCode, selectedStateCode)
        : [],
    [countryCode, selectedStateCode]
  );

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
        <label className="block text-xs font-medium text-ink-700">Country</label>
        <select
          name="country"
          value={countryCode}
          onChange={(e) => {
            setCountryCode(e.currentTarget.value);
            setStateNameLocal('');
            setCity('');
          }}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Any country</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-700">State / region</label>
        <select
          name="state"
          value={stateName}
          onChange={(e) => {
            setStateNameLocal(e.currentTarget.value);
            setCity('');
          }}
          disabled={!countryCode || states.length === 0}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-ink-400"
        >
          <option value="">Any state</option>
          {states.map((s) => (
            <option key={s.code} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-700">City</label>
        {cities.length > 0 ? (
          <select
            name="city"
            value={city}
            onChange={(e) => setCity(e.currentTarget.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Any city</option>
            {cities.map((c) => (
              <option key={`${c.name}-${c.stateCode}`} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            name="city"
            value={city}
            onChange={(e) => setCity(e.currentTarget.value)}
            placeholder="Type a city…"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        )}
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-700">Postal / ZIP code</label>
        <input
          name="postalCode"
          defaultValue={get('postalCode')}
          placeholder="e.g. 94105"
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
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
        <label className="block text-xs font-medium text-ink-700">Website health (audit)</label>
        <select
          name="websiteHealth"
          defaultValue={get('websiteHealth')}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Any</option>
          {HEALTH.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2 md:col-span-3">
        <label className="block text-xs font-medium text-ink-700">Outreach fit</label>
        <select
          name="outreachSuitable"
          defaultValue={get('outreachSuitable')}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Any</option>
          {FIT.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2 md:col-span-3">
        <label className="block text-xs font-medium text-ink-700">Website presence (ingest)</label>
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
              {LEAD_STATUS_LABELS[s] ?? s}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2 md:col-span-6">
        <label className="block text-xs font-medium text-ink-700">Business scale</label>
        <select
          name="businessScale"
          defaultValue={get('businessScale')}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Any</option>
          {(['SME', 'MID_MARKET', 'LARGE', 'UNKNOWN'] as const).map((s) => (
            <option key={s} value={s}>
              {BUSINESS_SCALE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2 md:col-span-6">
        <label className="block text-xs font-medium text-ink-700">Newly discovered</label>
        <select
          name="discoveredWithin"
          defaultValue={get('discoveredWithin')}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Any time</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
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
