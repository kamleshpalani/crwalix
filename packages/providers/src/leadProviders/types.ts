/**
 * LeadProvider — unified contract for every business / place discovery
 * adapter. This sits on top of the existing `SearchProvider` interface so
 * the worker can keep using the registry pattern while the UI gets a
 * richer descriptor (status, env requirements, marketing blurb).
 */
import type { SearchProvider } from '../types';

export type LeadProviderId =
  | 'google_places'
  | 'yelp_fusion'
  | 'osm'
  | 'foursquare'
  | 'bing_maps'
  | 'here'
  | 'tomtom'
  | 'geoapify';

export type LeadProviderStatus = 'ready' | 'coming_soon';

export interface LeadProvider extends SearchProvider {
  /** Friendly UI label (e.g. "OpenStreetMap"). */
  readonly label: string;
  /** "ready" → adapter is implemented; "coming_soon" → stub. */
  readonly status: LeadProviderStatus;
  /** Required env var names — used by the UI to warn when keys are missing. */
  readonly requiredEnv: string[];
  /** One-line description rendered next to the checkbox in the UI. */
  readonly blurb?: string;
}

/** Throws a deterministic error from coming-soon stubs. */
export class NotImplementedProviderError extends Error {
  constructor(id: string) {
    super(`Lead provider "${id}" is not implemented yet (coming soon).`);
    this.name = 'NotImplementedProviderError';
  }
}
