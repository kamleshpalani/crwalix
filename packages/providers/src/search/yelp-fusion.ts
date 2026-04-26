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

    const res = await fetch(`${BASE}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: ctx.signal
    });
    if (!res.ok) {
      const txt = await res.text();
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
