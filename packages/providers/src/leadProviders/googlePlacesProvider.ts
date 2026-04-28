/**
 * Google Places (New) lead provider — wraps the existing adapter and adds
 * UI-facing metadata (status, env, blurb).
 */
import { googlePlacesProvider as base } from '../search/google-places';
import type { LeadProvider } from './types';

export const googlePlacesProvider: LeadProvider = {
  ...base,
  label: 'Google Places',
  status: 'ready',
  requiredEnv: ['GOOGLE_PLACES_API_KEY'],
  blurb: 'Best coverage; requires API key.'
};
