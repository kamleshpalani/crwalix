/**
 * Bing Maps Local Search API — coming soon.
 *
 * Endpoint: GET https://dev.virtualearth.net/REST/v1/LocalSearch/
 * Auth:     `key=<BING_MAPS_KEY>` query param.
 */
import type { LeadProvider } from './types';
import { NotImplementedProviderError } from './types';

export const bingProvider: LeadProvider = {
  id: 'bing_maps',
  displayName: 'Bing Maps Local Search',
  label: 'Bing Maps',
  status: 'coming_soon',
  requiredEnv: ['BING_MAPS_API_KEY'],
  blurb: 'Coming soon.',
  capabilities: {
    keyword: true,
    niche: true,
    geoBBox: true,
    geoRadius: true,
    postalCode: true,
    maxPageSize: 25
  },
  async search() {
    throw new NotImplementedProviderError('bing_maps');
  }
};
