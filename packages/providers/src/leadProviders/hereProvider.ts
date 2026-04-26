/**
 * HERE Discover / Browse API — coming soon.
 *
 * Endpoint: GET https://discover.search.hereapi.com/v1/discover
 * Auth:     `apiKey=<HERE_API_KEY>` query param.
 */
import type { LeadProvider } from './types';
import { NotImplementedProviderError } from './types';

export const hereProvider: LeadProvider = {
  id: 'here',
  displayName: 'HERE Discover',
  label: 'HERE',
  status: 'coming_soon',
  requiredEnv: ['HERE_API_KEY'],
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
    throw new NotImplementedProviderError('here');
  }
};
