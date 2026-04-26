/**
 * Provider catalog used by the search UI. Defines display name, default
 * selection, MVP availability, and a stable id consumed by the worker
 * registry. Adding a new provider = adding an entry here + a backend
 * adapter in `packages/providers/src/search/`.
 */
export interface ProviderInfo {
  id: string;
  label: string;
  /** True when the worker has a real adapter wired up. */
  ready: boolean;
  /** Selected by default in the UI. */
  defaultOn: boolean;
  blurb?: string;
}

export const PROVIDER_CATALOG: ProviderInfo[] = [
  {
    id: 'google_places',
    label: 'Google Places',
    ready: true,
    defaultOn: true,
    blurb: 'Best coverage; requires API key.'
  },
  {
    id: 'yelp_fusion',
    label: 'Yelp',
    ready: true,
    defaultOn: true,
    blurb: 'Strong for local SMBs; requires API key.'
  },
  {
    id: 'osm',
    label: 'OpenStreetMap',
    ready: true,
    defaultOn: true,
    blurb: 'Keyless via Overpass + Nominatim.'
  },
  { id: 'foursquare', label: 'Foursquare', ready: false, defaultOn: false, blurb: 'Coming soon.' },
  { id: 'bing_maps', label: 'Bing Maps', ready: false, defaultOn: false, blurb: 'Coming soon.' },
  { id: 'here', label: 'HERE', ready: false, defaultOn: false, blurb: 'Coming soon.' },
  { id: 'tomtom', label: 'TomTom', ready: false, defaultOn: false, blurb: 'Coming soon.' },
  { id: 'geoapify', label: 'Geoapify', ready: false, defaultOn: false, blurb: 'Coming soon.' }
];

export const READY_PROVIDER_IDS = new Set(
  PROVIDER_CATALOG.filter((p) => p.ready).map((p) => p.id)
);
