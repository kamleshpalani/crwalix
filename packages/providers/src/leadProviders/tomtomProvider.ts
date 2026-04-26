/**
 * TomTom Search API — coming soon.
 *
 * Endpoint: GET https://api.tomtom.com/search/2/search/{query}.json
 * Auth:     `key=<TOMTOM_API_KEY>` query param.
 */
import type { LeadProvider } from './types';
import { NotImplementedProviderError } from './types';

export const tomtomProvider: LeadProvider = {
  id: 'tomtom',
  displayName: 'TomTom Search',
  label: 'TomTom',
  status: 'coming_soon',
  requiredEnv: ['TOMTOM_API_KEY'],
  blurb: 'Coming soon.',
  capabilities: {
    keyword: true,
    niche: true,
    geoBBox: true,
    geoRadius: true,
    postalCode: true,
    maxPageSize: 100
  },
  async search() {
    throw new NotImplementedProviderError('tomtom');
  }
};
