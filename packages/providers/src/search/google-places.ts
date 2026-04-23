/**
 * Google Places (New) provider — stub.
 *
 * Phase 1 implementation note:
 *  - Uses https://places.googleapis.com/v1/places:searchText for keyword searches
 *    and :searchNearby for radius searches.
 *  - Requires GOOGLE_PLACES_API_KEY env var OR per-org key from ProviderConfig.
 *  - Fields mask: places.id,places.displayName,places.types,places.formattedAddress,
 *    places.addressComponents,places.location,places.nationalPhoneNumber,
 *    places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,
 *    places.businessStatus,places.rating,places.userRatingCount
 *  - Handles pagination via nextPageToken (up to 3 pages / 60 results per query).
 *  - Maps businessStatus: OPERATIONAL/CLOSED_TEMPORARILY/CLOSED_PERMANENTLY -> our enum.
 *
 * This file intentionally stays a stub until Phase 1 implementation lands so the
 * contract is reviewed first.
 */
import type { SearchPage, SearchProvider } from '../types.js';

export const googlePlacesProvider: SearchProvider = {
  id: 'google_places',
  displayName: 'Google Places API (New)',
  capabilities: {
    keyword: true,
    niche: true,
    geoBBox: false,
    geoRadius: true,
    postalCode: true,
    maxPageSize: 20,
  },
  async search(): Promise<SearchPage> {
    throw new Error('google_places provider not yet implemented (Phase 1)');
  },
};
