'use client';

import { useMemo, useState, useTransition } from 'react';
import { createSearchAction } from './actions';
import { PROVIDER_CATALOG } from '@/lib/providers';
import { LOCATIONS } from '@/lib/locations';

type Project = { id: string; name: string };
type Msg = { kind: 'err' | 'ok'; text: string } | null;

const PRIORITY_OPTIONS = [
  {
    value: 'HIGH',
    label: 'High Priority',
    blurb: 'Businesses with no website'
  },
  {
    value: 'MEDIUM',
    label: 'Medium Priority',
    blurb: 'Website exists but needs improvement'
  },
  {
    value: 'LOW',
    label: 'Low Priority',
    blurb: 'Already has a proper, updated website'
  }
] as const;

export default function NewSearchForm({
  projects,
  defaultProjectId
}: {
  projects: Project[];
  defaultProjectId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();

  // Provider selection
  const [selectedProviders, setSelectedProviders] = useState<string[]>(
    PROVIDER_CATALOG.filter((p) => p.defaultOn).map((p) => p.id)
  );

  // Priority selection
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>(['HIGH', 'MEDIUM']);

  // Location cascading
  const [countryCode, setCountryCode] = useState<string>('US');
  const [stateCode, setStateCode] = useState<string>('');
  const [county, setCounty] = useState<string>('');
  const [cityMajor, setCityMajor] = useState<string>('');
  const [customCity, setCustomCity] = useState<string>('');

  const country = useMemo(
    () => LOCATIONS.find((c) => c.code === countryCode) ?? null,
    [countryCode]
  );
  const stateEntry = useMemo(
    () => country?.states.find((s) => s.code === stateCode) ?? null,
    [country, stateCode]
  );
  const counties = stateEntry?.counties ?? [];
  const cities = useMemo(() => {
    if (!stateEntry) return [];
    if (county) return stateEntry.cities.filter((ci) => !ci.county || ci.county === county);
    return stateEntry.cities;
  }, [stateEntry, county]);

  const finalLocationPreview = [
    customCity || cityMajor,
    county,
    stateEntry?.name,
    country?.name
  ]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(', ');

  function toggle(set: string[], value: string): string[] {
    return set.includes(value) ? set.filter((v) => v !== value) : [...set, value];
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Create a <a href="/projects" className="underline">project</a> first before running a search.
      </div>
    );
  }

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMsg(null);
          }}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + New search
        </button>
      ) : (
        <form
          action={(fd) => {
            setMsg(null);
            // The browser only submits checked checkboxes; nothing extra needed.
            startTransition(async () => {
              const res = await createSearchAction(fd);
              if (res.ok) {
                setMsg({
                  kind: 'ok',
                  text: `Queued ${res.created.length} search${res.created.length === 1 ? '' : 'es'} across providers: ${res.created
                    .map((c) => c.provider)
                    .join(', ')}`
                });
                setOpen(false);
              } else {
                setMsg({ kind: 'err', text: res.error });
              }
            });
          }}
          className="glass space-y-6 p-4"
        >
          {/* Project + name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-700">Project</label>
              <select
                name="projectId"
                required
                defaultValue={defaultProjectId ?? projects[0]?.id}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700">Name</label>
              <input
                name="name"
                required
                placeholder="e.g. Austin dentists — run 1"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Keyword + result limit */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-700">Keyword / niche</label>
              <input
                name="keyword"
                required
                placeholder="dentists"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700">Result limit per provider</label>
              <input
                name="resultLimit"
                type="number"
                min={1}
                max={500}
                defaultValue={20}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* === Data Source Providers === */}
          <fieldset className="rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold text-ink-900">Data Source Providers</legend>
            <p className="mb-2 text-xs text-ink-500">
              The search runs on every checked provider. Each one creates its own run.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {PROVIDER_CATALOG.map((p) => {
                const checked = selectedProviders.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={
                      'flex items-start gap-2 rounded border px-2 py-1.5 text-xs transition ' +
                      (p.ready
                        ? 'cursor-pointer border-slate-200 bg-white/60 hover:bg-white'
                        : 'cursor-not-allowed border-dashed border-slate-200 bg-slate-50 text-ink-400')
                    }
                  >
                    <input
                      type="checkbox"
                      name="providers"
                      value={p.id}
                      disabled={!p.ready}
                      checked={p.ready && checked}
                      onChange={() => p.ready && setSelectedProviders((s) => toggle(s, p.id))}
                      className="mt-0.5"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium">
                        {p.label}
                        {!p.ready && (
                          <span className="ml-1 text-[10px] uppercase tracking-wide text-amber-600">
                            soon
                          </span>
                        )}
                      </span>
                      {p.blurb && <span className="text-[11px] text-ink-500">{p.blurb}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* === Lead Priority === */}
          <fieldset className="rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold text-ink-900">Lead Priority</legend>
            <p className="mb-2 text-xs text-ink-500">
              Which prospect tiers to keep when ingesting results. Default targets businesses
              with no website (highest value) and websites that need a redesign.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PRIORITY_OPTIONS.map((o) => {
                const checked = selectedPriorities.includes(o.value);
                return (
                  <label
                    key={o.value}
                    className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 bg-white/60 px-2 py-1.5 text-xs hover:bg-white"
                  >
                    <input
                      type="checkbox"
                      name="priorities"
                      value={o.value}
                      checked={checked}
                      onChange={() => setSelectedPriorities((s) => toggle(s, o.value))}
                      className="mt-0.5"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium">{o.label}</span>
                      <span className="text-[11px] text-ink-500">{o.blurb}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* === Location === */}
          <fieldset className="rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold text-ink-900">Location</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700">Country</label>
                <select
                  name="country"
                  value={countryCode}
                  onChange={(e) => {
                    setCountryCode(e.target.value);
                    setStateCode('');
                    setCounty('');
                    setCityMajor('');
                  }}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                >
                  {LOCATIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700">State / Province / Region</label>
                <select
                  name="state"
                  value={stateCode}
                  onChange={(e) => {
                    setStateCode(e.target.value);
                    setCounty('');
                    setCityMajor('');
                  }}
                  disabled={!country}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                >
                  <option value="">— any —</option>
                  {country?.states.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700">County / District</label>
                <select
                  name="county"
                  value={county}
                  onChange={(e) => {
                    setCounty(e.target.value);
                    setCityMajor('');
                  }}
                  disabled={counties.length === 0}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                >
                  <option value="">— any —</option>
                  {counties.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700">Major city</label>
                <select
                  name="cityMajor"
                  value={cityMajor}
                  onChange={(e) => setCityMajor(e.target.value)}
                  disabled={cities.length === 0}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                >
                  <option value="">— select —</option>
                  {cities.map((ci) => (
                    <option key={ci.name} value={ci.name}>
                      {ci.name}
                      {ci.county ? ` (${ci.county})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-ink-700">
                  Custom city <span className="font-normal text-ink-500">(overrides major city if filled)</span>
                </label>
                <input
                  name="customCity"
                  value={customCity}
                  onChange={(e) => setCustomCity(e.target.value)}
                  placeholder="e.g. Plano"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-ink-600">
              Final location:{' '}
              <span className="font-mono">{finalLocationPreview || '— pick at least a country —'}</span>
            </p>
          </fieldset>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending || selectedProviders.length === 0}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? 'Queuing…' : `Run search on ${selectedProviders.length} provider${selectedProviders.length === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setMsg(null);
              }}
              className="rounded-md px-4 py-2 text-sm text-ink-600 hover:text-ink-900"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {msg && (
        <div
          className={
            'mt-3 rounded-md p-3 text-sm ' +
            (msg.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200')
          }
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
