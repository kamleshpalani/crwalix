/**
 * Foursquare Places API — coming soon.
 *
 * Endpoint: GET https://api.foursquare.com/v3/places/search
 * Auth:     Authorization: <FSQ_API_KEY>
 *
 * Implementation plan: query by `query` + `near`, paginate via
 * `cursor` header, normalize to NormalizedLead.
 */
import type { LeadProvider } from './types';
import { NotImplementedProviderError } from './types';

export const foursquareProvider: LeadProvider = {
  id: 'foursquare',
  displayName: 'Foursquare Places',
  label: 'Foursquare',
  status: 'coming_soon',
  requiredEnv: ['FOURSQUARE_API_KEY'],
  blurb: 'Coming soon.',
  capabilities: {
    keyword: true,
    niche: true,
    geoBBox: true,
    geoRadius: true,
    postalCode: true,
    maxPageSize: 50
  },
  async search() {
    throw new NotImplementedProviderError('foursquare');
  }
};
