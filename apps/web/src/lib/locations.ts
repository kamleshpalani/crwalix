/**
 * Geo dataset wrapper around `country-state-city` (~250 countries,
 * ~5000 states, ~150,000 cities). Replaces the old hand-curated catalog.
 *
 * The package ships its own JSON; we re-export typed helpers + a
 * `composeLocation` formatter used by the create-search action.
 */
import { Country, State, City } from 'country-state-city';

export interface CountryEntry {
  /** ISO-3166-1 alpha-2 (e.g. "US"). */
  code: string;
  name: string;
}

export interface StateEntry {
  /** Subdivision code as published by the dataset (e.g. "CA"). */
  code: string;
  name: string;
}

export interface CityEntry {
  name: string;
  /** Subdivision code the city belongs to. */
  stateCode: string;
}

/** All countries (alphabetical by name). */
export function getAllCountries(): CountryEntry[] {
  return Country.getAllCountries()
    .map((c) => ({ code: c.isoCode, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** States/provinces/regions for a country. */
export function getStatesByCountry(countryCode: string): StateEntry[] {
  if (!countryCode) return [];
  return State.getStatesOfCountry(countryCode)
    .map((s) => ({ code: s.isoCode, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Cities within a state. Falls back to all cities of the country if no state. */
export function getCitiesByState(countryCode: string, stateCode: string): CityEntry[] {
  if (!countryCode) return [];
  const cities = stateCode
    ? City.getCitiesOfState(countryCode, stateCode)
    : City.getCitiesOfCountry(countryCode) ?? [];
  return cities
    .map((c) => ({ name: c.name, stateCode: c.stateCode }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolve a country's display name from an ISO code. */
export function getCountryName(code: string): string | null {
  if (!code) return null;
  return Country.getCountryByCode(code)?.name ?? null;
}

/** Resolve a state's display name from country + state codes. */
export function getStateName(countryCode: string, stateCode: string): string | null {
  if (!countryCode || !stateCode) return null;
  return State.getStateByCodeAndCountry(stateCode, countryCode)?.name ?? null;
}

/** Compose a final search location string from cascading inputs. */
export function composeLocation(parts: {
  customCity?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
}): string {
  // `state` and `country` may arrive as ISO codes; resolve to readable names.
  const stateName = parts.state
    ? getStateName(parts.country ?? '', parts.state) ?? parts.state
    : '';
  const countryName = parts.country ? getCountryName(parts.country) ?? parts.country : '';
  const ordered = [parts.customCity || parts.city, parts.county, stateName, countryName]
    .map((s) => (s ?? '').trim())
    .filter(Boolean);
  // Drop duplicates while preserving order.
  const seen = new Set<string>();
  return ordered
    .filter((p) => (seen.has(p.toLowerCase()) ? false : (seen.add(p.toLowerCase()), true)))
    .join(', ');
}
