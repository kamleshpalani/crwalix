/**
 * Provider catalog used by the search UI. Sourced from the canonical
 * `leadProviders` barrel in `@crawlix/providers` so the UI, worker, and
 * registry stay aligned automatically when new providers are added.
 */
import { ALL_LEAD_PROVIDERS } from '@crawlix/providers';

export interface ProviderInfo {
  id: string;
  label: string;
  /** True when the worker has a real adapter wired up. */
  ready: boolean;
  /** Selected by default in the UI (only applies to ready providers). */
  defaultOn: boolean;
  blurb?: string;
}

const DEFAULT_ON: ReadonlySet<string> = new Set(['google_places', 'yelp_fusion', 'osm']);

export const PROVIDER_CATALOG: ProviderInfo[] = ALL_LEAD_PROVIDERS.map((p) => ({
  id: p.id,
  label: p.label,
  ready: p.status === 'ready',
  defaultOn: p.status === 'ready' && DEFAULT_ON.has(p.id),
  blurb: p.blurb
}));

export const READY_PROVIDER_IDS = new Set(
  PROVIDER_CATALOG.filter((p) => p.ready).map((p) => p.id)
);
