/**
 * Lead provider barrel — single import surface for all business / place
 * discovery adapters. Each file implements the `LeadProvider` contract
 * defined in `./types.ts`.
 *
 * Ready providers:
 *   - googlePlacesProvider  (Google Places API New)
 *   - yelpProvider          (Yelp Fusion)
 *   - openStreetMapProvider (Overpass + Nominatim, keyless)
 *   - foursquareProvider    (Foursquare Places v3)
 *   - bingProvider          (Bing Maps Local Search)
 *   - hereProvider          (HERE Discover API)
 *   - tomtomProvider        (TomTom Search API v2)
 *   - geoapifyProvider      (Geoapify Places API v2)
 */
export * from "./types";
export { googlePlacesProvider } from "./googlePlacesProvider";
export { yelpProvider } from "./yelpProvider";
export { openStreetMapProvider } from "./openStreetMapProvider";
export { foursquareProvider } from "./foursquareProvider";
export { bingProvider } from "./bingProvider";
export { hereProvider } from "./hereProvider";
export { tomtomProvider } from "./tomtomProvider";
export { geoapifyProvider } from "./geoapifyProvider";

import type { LeadProvider } from "./types";
import { googlePlacesProvider } from "./googlePlacesProvider";
import { yelpProvider } from "./yelpProvider";
import { openStreetMapProvider } from "./openStreetMapProvider";
import { foursquareProvider } from "./foursquareProvider";
import { bingProvider } from "./bingProvider";
import { hereProvider } from "./hereProvider";
import { tomtomProvider } from "./tomtomProvider";
import { geoapifyProvider } from "./geoapifyProvider";

/** Ordered list of every known provider, ready or not. */
export const ALL_LEAD_PROVIDERS: LeadProvider[] = [
  googlePlacesProvider,
  yelpProvider,
  openStreetMapProvider,
  foursquareProvider,
  bingProvider,
  hereProvider,
  tomtomProvider,
  geoapifyProvider,
];

/** Look up a provider by id; returns undefined if not registered. */
export function findLeadProvider(id: string): LeadProvider | undefined {
  return ALL_LEAD_PROVIDERS.find((p) => p.id === id);
}
