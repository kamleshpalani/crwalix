'use client';

import { useMemo, useState, useTransition } from 'react';
import { createSearchAction } from './actions';
import { PROVIDER_CATALOG } from '@/lib/providers';
import {
  getAllCountries,
  getStatesByCountry,
  getCitiesByState,
  getCountryName,
  getStateName
} from '@/lib/locations';

type Project = { id: string; name: string };
type Msg = { kind: 'err' | 'ok'; text: string } | null;

type Preset = { label: string; keyword: string; city: string; countryCode: string };
type RegionGroup = { region: string; emoji: string; presets: Preset[] };

/**
 * Global high-value SME presets organized by region. One click fills
 * country, city, and keyword. Categories favour local SMEs whose
 * websites we can sell redesigns for (clinics, salons, contractors,
 * restaurants, services).
 */
const REGION_PRESETS: RegionGroup[] = [
  {
    region: 'United Arab Emirates',
    emoji: '🇦🇪',
    presets: [
      { label: 'Dental clinics — Dubai', keyword: 'dental clinic', city: 'Dubai', countryCode: 'AE' },
      { label: 'Dermatology clinics — Dubai', keyword: 'dermatology clinic', city: 'Dubai', countryCode: 'AE' },
      { label: 'Physiotherapy — Abu Dhabi', keyword: 'physiotherapy clinic', city: 'Abu Dhabi', countryCode: 'AE' },
      { label: 'AC repair — Dubai', keyword: 'AC repair', city: 'Dubai', countryCode: 'AE' },
      { label: 'Cleaning company — Dubai', keyword: 'cleaning company', city: 'Dubai', countryCode: 'AE' },
      { label: 'Pest control — Sharjah', keyword: 'pest control', city: 'Sharjah', countryCode: 'AE' },
      { label: 'Interior fit-out — Dubai', keyword: 'interior fit out', city: 'Dubai', countryCode: 'AE' },
      { label: 'Beauty salon — Dubai', keyword: 'beauty salon', city: 'Dubai', countryCode: 'AE' },
      { label: 'Catering — Abu Dhabi', keyword: 'catering company', city: 'Abu Dhabi', countryCode: 'AE' },
      { label: 'Printing — Deira', keyword: 'printing company', city: 'Deira Dubai', countryCode: 'AE' }
    ]
  },
  {
    region: 'United States',
    emoji: '🇺🇸',
    presets: [
      { label: 'Dentists — Austin TX', keyword: 'dentist', city: 'Austin', countryCode: 'US' },
      { label: 'HVAC — Phoenix AZ', keyword: 'hvac repair', city: 'Phoenix', countryCode: 'US' },
      { label: 'Plumbers — Houston TX', keyword: 'plumber', city: 'Houston', countryCode: 'US' },
      { label: 'Roofers — Tampa FL', keyword: 'roofing contractor', city: 'Tampa', countryCode: 'US' },
      { label: 'Med spa — Miami FL', keyword: 'med spa', city: 'Miami', countryCode: 'US' },
      { label: 'Chiropractor — Denver CO', keyword: 'chiropractor', city: 'Denver', countryCode: 'US' },
      { label: 'Auto repair — Los Angeles', keyword: 'auto repair', city: 'Los Angeles', countryCode: 'US' },
      { label: 'Law firm — Chicago IL', keyword: 'personal injury lawyer', city: 'Chicago', countryCode: 'US' },
      { label: 'Real estate agents — Seattle', keyword: 'real estate agent', city: 'Seattle', countryCode: 'US' },
      { label: 'Restaurants — Brooklyn NY', keyword: 'restaurant', city: 'Brooklyn', countryCode: 'US' }
    ]
  },
  {
    region: 'United Kingdom',
    emoji: '🇬🇧',
    presets: [
      { label: 'Dentists — London', keyword: 'dentist', city: 'London', countryCode: 'GB' },
      { label: 'Plumbers — Manchester', keyword: 'plumber', city: 'Manchester', countryCode: 'GB' },
      { label: 'Electricians — Birmingham', keyword: 'electrician', city: 'Birmingham', countryCode: 'GB' },
      { label: 'Solicitors — Leeds', keyword: 'solicitor', city: 'Leeds', countryCode: 'GB' },
      { label: 'Estate agents — Bristol', keyword: 'estate agent', city: 'Bristol', countryCode: 'GB' },
      { label: 'Beauty salons — Glasgow', keyword: 'beauty salon', city: 'Glasgow', countryCode: 'GB' },
      { label: 'Restaurants — Edinburgh', keyword: 'restaurant', city: 'Edinburgh', countryCode: 'GB' }
    ]
  },
  {
    region: 'Canada',
    emoji: '🇨🇦',
    presets: [
      { label: 'Dentists — Toronto', keyword: 'dentist', city: 'Toronto', countryCode: 'CA' },
      { label: 'Plumbers — Vancouver', keyword: 'plumber', city: 'Vancouver', countryCode: 'CA' },
      { label: 'Real estate — Calgary', keyword: 'real estate agent', city: 'Calgary', countryCode: 'CA' },
      { label: 'Auto repair — Montreal', keyword: 'auto repair', city: 'Montreal', countryCode: 'CA' },
      { label: 'Restaurants — Ottawa', keyword: 'restaurant', city: 'Ottawa', countryCode: 'CA' }
    ]
  },
  {
    region: 'Australia',
    emoji: '🇦🇺',
    presets: [
      { label: 'Dentists — Sydney', keyword: 'dentist', city: 'Sydney', countryCode: 'AU' },
      { label: 'Plumbers — Melbourne', keyword: 'plumber', city: 'Melbourne', countryCode: 'AU' },
      { label: 'Tradies — Brisbane', keyword: 'tradesman', city: 'Brisbane', countryCode: 'AU' },
      { label: 'Cafes — Perth', keyword: 'cafe', city: 'Perth', countryCode: 'AU' },
      { label: 'Gyms — Adelaide', keyword: 'gym', city: 'Adelaide', countryCode: 'AU' }
    ]
  },
  {
    region: 'India',
    emoji: '🇮🇳',
    presets: [
      { label: 'Dental clinics — Mumbai', keyword: 'dental clinic', city: 'Mumbai', countryCode: 'IN' },
      { label: 'Interior designer — Bangalore', keyword: 'interior designer', city: 'Bangalore', countryCode: 'IN' },
      { label: 'Coaching classes — Delhi', keyword: 'coaching classes', city: 'Delhi', countryCode: 'IN' },
      { label: 'Wedding photographer — Jaipur', keyword: 'wedding photographer', city: 'Jaipur', countryCode: 'IN' },
      { label: 'Restaurants — Hyderabad', keyword: 'restaurant', city: 'Hyderabad', countryCode: 'IN' },
      { label: 'Real estate — Pune', keyword: 'real estate agent', city: 'Pune', countryCode: 'IN' }
    ]
  },
  {
    region: 'Saudi Arabia',
    emoji: '🇸🇦',
    presets: [
      { label: 'Dental clinics — Riyadh', keyword: 'dental clinic', city: 'Riyadh', countryCode: 'SA' },
      { label: 'AC repair — Jeddah', keyword: 'AC repair', city: 'Jeddah', countryCode: 'SA' },
      { label: 'Catering — Dammam', keyword: 'catering company', city: 'Dammam', countryCode: 'SA' },
      { label: 'Beauty salon — Mecca', keyword: 'beauty salon', city: 'Mecca', countryCode: 'SA' }
    ]
  },
  {
    region: 'Singapore',
    emoji: '🇸🇬',
    presets: [
      { label: 'Dental clinics', keyword: 'dental clinic', city: 'Singapore', countryCode: 'SG' },
      { label: 'Aircon servicing', keyword: 'aircon servicing', city: 'Singapore', countryCode: 'SG' },
      { label: 'Tuition centre', keyword: 'tuition centre', city: 'Singapore', countryCode: 'SG' },
      { label: 'Restaurants', keyword: 'restaurant', city: 'Singapore', countryCode: 'SG' }
    ]
  },
  {
    region: 'Europe',
    emoji: '🇪🇺',
    presets: [
      { label: 'Dentists — Berlin', keyword: 'zahnarzt', city: 'Berlin', countryCode: 'DE' },
      { label: 'Restaurants — Paris', keyword: 'restaurant', city: 'Paris', countryCode: 'FR' },
      { label: 'Plumbers — Amsterdam', keyword: 'loodgieter', city: 'Amsterdam', countryCode: 'NL' },
      { label: 'Hotels — Barcelona', keyword: 'hotel', city: 'Barcelona', countryCode: 'ES' },
      { label: 'Cafes — Rome', keyword: 'caffè', city: 'Rome', countryCode: 'IT' }
    ]
  }
];

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
  const [cityMajor, setCityMajor] = useState<string>('');
  const [customCity, setCustomCity] = useState<string>('');
  const [postalCode, setPostalCode] = useState<string>('');

  // Controlled keyword (so UAE presets can populate it)
  const [keyword, setKeyword] = useState<string>('');

  const countries = useMemo(() => getAllCountries(), []);
  const states = useMemo(() => getStatesByCountry(countryCode), [countryCode]);
  const cities = useMemo(
    () => getCitiesByState(countryCode, stateCode),
    [countryCode, stateCode]
  );

  const finalLocationPreview = [
    customCity || cityMajor,
    getStateName(countryCode, stateCode),
    getCountryName(countryCode)
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

          {/* === Global Quick Presets === */}
          <details className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3" open>
            <summary className="cursor-pointer text-sm font-semibold text-emerald-900">
              Quick presets — global
              <span className="ml-2 text-xs font-normal text-emerald-700">
                (one click → country, city &amp; niche)
              </span>
            </summary>
            <div className="mt-3 space-y-4">
              {REGION_PRESETS.map((group) => (
                <div key={group.region}>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    {group.emoji} {group.region}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {group.presets.map((p) => (
                      <button
                        key={`${group.region}-${p.label}`}
                        type="button"
                        onClick={() => {
                          setCountryCode(p.countryCode);
                          setStateCode('');
                          setCityMajor('');
                          setCustomCity(p.city);
                          setPostalCode('');
                          setKeyword(p.keyword);
                        }}
                        className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-left text-xs hover:border-emerald-400 hover:bg-emerald-50"
                      >
                        <div className="font-medium text-ink-900">{p.label}</div>
                        <div className="text-ink-500">{p.keyword} · {p.city}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>

          {/* Keyword + result limit */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-700">Keyword / niche</label>
              <input
                name="keyword"
                required
                placeholder="dentists"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
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
                    setCityMajor('');
                  }}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                >
                  {countries.map((c) => (
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
                    setCityMajor('');
                  }}
                  disabled={states.length === 0}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                >
                  <option value="">— any —</option>
                  {states.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700">City</label>
                <select
                  name="cityMajor"
                  value={cityMajor}
                  onChange={(e) => setCityMajor(e.target.value)}
                  disabled={cities.length === 0}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                >
                  <option value="">— select —</option>
                  {cities.map((ci) => (
                    <option key={`${ci.stateCode}:${ci.name}`} value={ci.name}>
                      {ci.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-ink-700">
                  Custom city <span className="font-normal text-ink-500">(overrides selected city if filled)</span>
                </label>
                <input
                  name="customCity"
                  value={customCity}
                  onChange={(e) => setCustomCity(e.target.value)}
                  placeholder="e.g. Plano"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-ink-700">
                  Postal / ZIP code <span className="font-normal text-ink-500">(optional — narrows results to this area)</span>
                </label>
                <input
                  name="postalCode"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="e.g. 75024"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-ink-600">
              Final location:{' '}
              <span className="font-mono">{finalLocationPreview || '— pick at least a country —'}</span>
            </p>
          </fieldset>

          {/* === Schedule === */}
          <fieldset className="rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold text-ink-900">Schedule</legend>
            <p className="mb-2 text-xs text-ink-500">
              Re-run this search automatically to detect newly-listed businesses.
              You&apos;ll be notified in the dashboard (and via webhook/email if configured).
            </p>
            <select
              name="scheduleFrequency"
              defaultValue="NONE"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="NONE">One-shot (run once now)</option>
              <option value="DAILY">Daily (every 24h)</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
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
