/**
 * Geoapify Places API — coming soon.
 *
 * Endpoint: GET https://api.geoapify.com/v2/places
 * Auth:     `apiKey=<GEOAPIFY_API_KEY>` query param.
 */
import type { LeadProvider } from './types';
import { NotImplementedProviderError } from './types';

export const geoapifyProvider: LeadProvider = {
  id: 'geoapify',
  displayName: 'Geoapify Places',
  label: 'Geoapify',
  status: 'coming_soon',
  requiredEnv: ['GEOAPIFY_API_KEY'],
  blurb: 'Coming soon.',
  capabilities: {
    keyword: true,
    niche: true,
    geoBBox: true,
    geoRadius: true,
    postalCode: false,
    maxPageSize: 500
  },
  async search() {
    throw new NotImplementedProviderError('geoapify');
  }
};
