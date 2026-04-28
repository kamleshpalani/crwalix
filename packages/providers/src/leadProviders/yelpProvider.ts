/**
 * Yelp Fusion lead provider.
 */
import { yelpFusionProvider as base } from '../search/yelp-fusion';
import type { LeadProvider } from './types';

export const yelpProvider: LeadProvider = {
  ...base,
  label: 'Yelp',
  status: 'ready',
  requiredEnv: ['YELP_FUSION_API_KEY'],
  blurb: 'Strong for local SMBs; requires API key.'
};
