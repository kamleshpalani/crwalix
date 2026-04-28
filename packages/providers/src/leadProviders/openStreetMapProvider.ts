/**
 * OpenStreetMap lead provider — keyless via Overpass + Nominatim.
 */
import { osmOverpassProvider as base } from '../search/osm-overpass';
import type { LeadProvider } from './types';

export const openStreetMapProvider: LeadProvider = {
  ...base,
  label: 'OpenStreetMap',
  status: 'ready',
  requiredEnv: [],
  blurb: 'Keyless via Overpass + Nominatim.'
};
