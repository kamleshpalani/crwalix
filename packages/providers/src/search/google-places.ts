/**
 * Google Places API (New) — text + nearby search adapter.
 *
 * Endpoints:
 *   POST https://places.googleapis.com/v1/places:searchText
 *   POST https://places.googleapis.com/v1/places:searchNearby
 *
 * Pagination: `pageToken` (up to 3 pages / 60 results per query).
 * Fields mask controlled via X-Goog-FieldMask header.
 */
import { BusinessStatus, type NormalizedLead } from '@crawlix/shared';
import type { ProviderContext, SearchPage, SearchProvider, SearchQuery } from '../types';

const BASE = 'https://places.googleapis.com/v1/places';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.types',
  'places.formattedAddress',
  'places.addressComponents',
  'places.location',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.businessStatus',
  'places.rating',
  'places.userRatingCount',
  'nextPageToken'
].join(',');

interface GPlace {
  id: string;
  displayName?: { text: string };
  types?: string[];
  formattedAddress?: string;
  addressComponents?: Array<{ types: string[]; shortText?: string; longText?: string }>;
  location?: { latitude: number; longitude: number };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
}

interface GResponse {
  places?: GPlace[];
  nextPageToken?: string;
}

function mapBusinessStatus(s: string | undefined): BusinessStatus {
  switch (s) {
    case 'OPERATIONAL': return BusinessStatus.OPERATIONAL;
    case 'CLOSED_TEMPORARILY': return BusinessStatus.CLOSED_TEMP;
    case 'CLOSED_PERMANENTLY': return BusinessStatus.CLOSED_PERM;
    default: return BusinessStatus.UNKNOWN;
  }
}

function pickComponent(
  components: GPlace['addressComponents'],
  type: string
): string | undefined {
  return components?.find((c) => Array.isArray(c.types) && c.types.includes(type))?.longText ?? undefined;
}

function toNormalized(p: GPlace): NormalizedLead {
  return {
    provider: 'google_places',
    externalPlaceId: p.id,
    name: p.displayName?.text ?? 'Unknown',
    categoryPrimary: p.types?.[0],
    categories: p.types ?? [],
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber,
    website: p.websiteUri,
    sourceUrl: p.googleMapsUri,
    address: p.formattedAddress,
    city: pickComponent(p.addressComponents, 'locality'),
    state: pickComponent(p.addressComponents, 'administrative_area_level_1'),
    country: pickComponent(p.addressComponents, 'country'),
    postalCode: pickComponent(p.addressComponents, 'postal_code'),
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    businessStatus: mapBusinessStatus(p.businessStatus),
    rating: p.rating,
    reviewCount: p.userRatingCount,
    raw: p
  };
}

async function callApi(
  endpoint: 'searchText' | 'searchNearby',
  body: Record<string, unknown>,
  apiKey: string,
  signal: AbortSignal | undefined
): Promise<GResponse> {
  const res = await fetch(`${BASE}:${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK
    },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`google_places ${endpoint} ${res.status}: ${errBody.slice(0, 300)}`);
  }
  return (await res.json()) as GResponse;
}

function buildTextQuery(query: SearchQuery): string {
  const parts = [query.keyword ?? query.niche ?? 'business'];
  if (query.city) parts.push(query.city);
  if (query.state) parts.push(query.state);
  if (query.country) parts.push(query.country);
  if (query.postalCode) parts.push(query.postalCode);
  return parts.filter(Boolean).join(' ');
}

export const googlePlacesProvider: SearchProvider = {
  id: 'google_places',
  displayName: 'Google Places API (New)',
  capabilities: {
    keyword: true,
    niche: true,
    geoBBox: false,
    geoRadius: true,
    postalCode: true,
    maxPageSize: 20
  },
  async search(query: SearchQuery, ctx: ProviderContext, cursor?: string): Promise<SearchPage> {
    const apiKey = ctx.credentials.GOOGLE_PLACES_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

    const useNearby = typeof query.lat === 'number' && typeof query.lng === 'number' && !!query.radiusMeters;

    // Map the generic `rankPreference` to Google's per-endpoint enum.
    // searchText:   RELEVANCE | DISTANCE
    // searchNearby: POPULARITY | DISTANCE
    const rankText =
      query.rankPreference === 'distance' ? 'DISTANCE' : 'RELEVANCE';
    const rankNearby =
      query.rankPreference === 'distance' ? 'DISTANCE' : 'POPULARITY';

    let data: GResponse;
    if (useNearby) {
      data = await callApi(
        'searchNearby',
        {
          includedTypes: query.niche ? [query.niche] : undefined,
          maxResultCount: Math.min(20, query.limit),
          rankPreference: rankNearby,
          locationRestriction: {
            circle: {
              center: { latitude: query.lat, longitude: query.lng },
              radius: query.radiusMeters
            }
          }
        },
        apiKey,
        ctx.signal
      );
    } else {
      data = await callApi(
        'searchText',
        {
          textQuery: buildTextQuery(query),
          pageToken: cursor,
          pageSize: Math.min(20, query.limit),
          rankPreference: rankText,
          regionCode: query.country
        },
        apiKey,
        ctx.signal
      );
    }

    await ctx.meter((data.places?.length ?? 0) || 1);

    return {
      leads: (data.places ?? []).map(toNormalized),
      nextCursor: data.nextPageToken
    };
  }
};
