/**
 * Yelp Fusion API — business search adapter.
 *
 * Endpoint: GET https://api.yelp.com/v3/businesses/search
 * Auth:     Authorization: Bearer <API_KEY>
 * Pagination: offset+limit (limit max 50, offset max 240).
 *
 * Docs: https://docs.developer.yelp.com/reference/v3_business_search
 */
import { BusinessStatus, type NormalizedLead } from '@crawlix/shared';
import type { ProviderContext, SearchPage, SearchProvider, SearchQuery } from '../types';

const BASE = 'https://api.yelp.com/v3/businesses/search';

/**
 * Yelp Fusion supported locales (per official docs at
 * https://docs.developer.yelp.com/docs/resources-supported-locales).
 *
 * Format is `{lang}_{country}`. Yelp validates this strictly — passing
 * an unsupported locale (or a country Yelp doesn't cover) returns 400.
 *
 * For each supported country we pick a sensible default language. When
 * the operator's search is in a country not in this list, we omit the
 * `locale` parameter entirely and let Yelp use its server default
 * (which usually falls back to en_US).
 */
const YELP_LOCALES_BY_COUNTRY: Record<string, string> = {
  AR: 'es_AR',
  AT: 'de_AT',
  AU: 'en_AU',
  BE: 'nl_BE',
  BR: 'pt_BR',
  CA: 'en_CA',
  CH: 'de_CH',
  CL: 'es_CL',
  CZ: 'cs_CZ',
  DE: 'de_DE',
  DK: 'da_DK',
  ES: 'es_ES',
  FI: 'fi_FI',
  FR: 'fr_FR',
  GB: 'en_GB',
  HK: 'zh_HK',
  IE: 'en_IE',
  IT: 'it_IT',
  JP: 'ja_JP',
  MX: 'es_MX',
  MY: 'en_MY',
  NL: 'nl_NL',
  NO: 'nb_NO',
  NZ: 'en_NZ',
  PH: 'en_PH',
  PL: 'pl_PL',
  PT: 'pt_PT',
  SE: 'sv_SE',
  SG: 'en_SG',
  TR: 'tr_TR',
  TW: 'zh_TW',
  US: 'en_US'
};

/**
 * Set of countries Yelp Fusion actually covers — used to short-circuit
 * a request when the operator searches outside the supported region
 * (e.g. AE/SA/IN), saving an API call and a 400 response.
 */
const YELP_SUPPORTED_COUNTRIES = new Set(Object.keys(YELP_LOCALES_BY_COUNTRY));

function resolveYelpLocale(query: SearchQuery): string | undefined {
  const cc = (query.country ?? '').trim().toUpperCase();
  if (!cc) return undefined;
  // Allow exact 2-letter country codes; ignore 3-letter or names.
  if (cc.length === 2) return YELP_LOCALES_BY_COUNTRY[cc];
  return undefined;
}

interface YBusiness {
  id: string;
  alias?: string;
  name: string;
  image_url?: string;
  url?: string;
  phone?: string;
  display_phone?: string;
  rating?: number;
  review_count?: number;
  is_closed?: boolean;
  categories?: Array<{ alias: string; title: string }>;
  coordinates?: { latitude: number; longitude: number };
  location?: {
    address1?: string;
    address2?: string;
    address3?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    country?: string;
    display_address?: string[];
  };
}

interface YResponse {
  businesses?: YBusiness[];
  total?: number;
}

function toNormalized(b: YBusiness): NormalizedLead {
  const addr = (b.location?.display_address ?? []).join(', ') || undefined;
  return {
    provider: 'yelp_fusion',
    externalPlaceId: b.id,
    name: b.name,
    categoryPrimary: b.categories?.[0]?.title,
    categories: (b.categories ?? []).map((c) => c.title),
    phone: b.phone || b.display_phone,
    // Yelp does not return a business website on /search — only a Yelp page URL.
    // We deliberately leave `website` undefined so these surface as
    // "no-website" candidates and get audited only on enrichment.
    website: undefined,
    sourceUrl: b.url,
    address: addr,
    city: b.location?.city,
    state: b.location?.state,
    country: b.location?.country,
    postalCode: b.location?.zip_code,
    lat: b.coordinates?.latitude,
    lng: b.coordinates?.longitude,
    businessStatus: b.is_closed ? BusinessStatus.CLOSED_PERM : BusinessStatus.OPERATIONAL,
    rating: b.rating,
    reviewCount: b.review_count,
    raw: b
  };
}

function buildLocation(query: SearchQuery): string | undefined {
  const parts = [query.city, query.state, query.country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

export const yelpFusionProvider: SearchProvider = {
  id: 'yelp_fusion',
  displayName: 'Yelp Fusion API',
  capabilities: {
    keyword: true,
    niche: true,
    geoBBox: false,
    geoRadius: true,
    postalCode: true,
    maxPageSize: 50
  },
  async search(query: SearchQuery, ctx: ProviderContext, cursor?: string): Promise<SearchPage> {
    const apiKey = ctx.credentials.YELP_FUSION_API_KEY;
    if (!apiKey) throw new Error('YELP_FUSION_API_KEY not configured');

    // Short-circuit: if the operator picked a country Yelp doesn't cover
    // (e.g. AE, SA, IN), don't even bother hitting the API. Return an
    // empty page with a warning so the run completes cleanly.
    const cc = (query.country ?? '').trim().toUpperCase();
    if (cc && cc.length === 2 && !YELP_SUPPORTED_COUNTRIES.has(cc)) {
      return {
        leads: [],
        nextCursor: undefined,
        total: 0,
        warning: `yelp_fusion does not cover country ${cc}`
      };
    }

    const offset = cursor ? Number(cursor) : 0;
    const limit = Math.min(50, query.limit);

    const params = new URLSearchParams();
    const term = query.keyword ?? query.niche;
    if (term) params.set('term', term);
    const location = buildLocation(query);
    if (typeof query.lat === 'number' && typeof query.lng === 'number') {
      params.set('latitude', String(query.lat));
      params.set('longitude', String(query.lng));
      if (query.radiusMeters) params.set('radius', String(Math.min(40_000, query.radiusMeters)));
    } else if (location) {
      params.set('location', location);
    } else {
      throw new Error('yelp_fusion requires either lat/lng or city/state/country');
    }
    params.set('limit', String(limit));
    params.set('offset', String(offset));

    // Locale — when we know one for the country, send it so Yelp
    // disambiguates the location string and returns native-language
    // category names. Omit otherwise; Yelp defaults to en_US.
    const locale = resolveYelpLocale(query);
    if (locale) params.set('locale', locale);

    // Map generic rankPreference → Yelp `sort_by`.
    // Allowed: best_match | rating | review_count | distance.
    const sortBy =
      query.rankPreference === 'distance' ? 'distance' :
      query.rankPreference === 'rating' ? 'rating' :
      query.rankPreference === 'review_count' ? 'review_count' :
      'best_match';
    params.set('sort_by', sortBy);

    const res = await fetch(`${BASE}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: ctx.signal
    });
    if (!res.ok) {
      const txt = await res.text();
      // Yelp Fusion only covers a subset of countries (US/CA/UK/AU/various EU
      // & a few APAC). For unsupported locales it returns 400 with a
      // LOCATION_NOT_FOUND code — treat that as "no results" rather than a
      // hard failure so the search run can complete.
      if (res.status === 400 && /LOCATION_NOT_FOUND/i.test(txt)) {
        return {
          leads: [],
          nextCursor: undefined,
          total: 0,
          warning: 'yelp_fusion does not cover this region (LOCATION_NOT_FOUND)'
        };
      }
      throw new Error(`yelp_fusion ${res.status}: ${txt.slice(0, 300)}`);
    }
    const data = (await res.json()) as YResponse;
    const businesses = data.businesses ?? [];

    await ctx.meter(businesses.length || 1);

    const nextOffset = offset + businesses.length;
    const total = data.total ?? 0;
    const nextCursor =
      businesses.length === limit && nextOffset < Math.min(240, total) ? String(nextOffset) : undefined;

    return {
      leads: businesses.map(toNormalized),
      nextCursor,
      total
    };
  }
};
