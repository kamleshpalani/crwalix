/**
 * Foursquare Places API v3.
 *
 * Endpoint: GET https://api.foursquare.com/v3/places/search
 * Auth:     Authorization: <FSQ_API_KEY>
 * Docs:     https://docs.foursquare.com/developer/reference/place-search
 */
import { BusinessStatus, type NormalizedLead } from "@crawlix/shared";
import type { ProviderContext, SearchPage, SearchQuery } from "../types";
import type { LeadProvider } from "./types";

const BASE = "https://api.foursquare.com/v3/places";

interface FsqVenue {
  fsq_id: string;
  name: string;
  categories?: Array<{ id: number; name: string }>;
  location?: {
    formatted_address?: string;
    address?: string;
    locality?: string;
    region?: string;
    country?: string;
    postcode?: string;
  };
  geocodes?: { main?: { latitude: number; longitude: number } };
  tel?: string;
  website?: string;
  email?: string;
  rating?: number;
  stats?: { total_ratings?: number };
  closed_bucket?: string;
}

interface FsqListResponse {
  results: FsqVenue[];
  next_cursor?: string;
}

function mapBizStatus(closedBucket?: string): BusinessStatus {
  if (!closedBucket) return BusinessStatus.OPERATIONAL;
  if (closedBucket === "VeryLikelyClosed") return BusinessStatus.CLOSED_PERM;
  if (closedBucket === "LikelyClosed") return BusinessStatus.CLOSED_TEMP;
  return BusinessStatus.OPERATIONAL;
}

function toNormalized(v: FsqVenue): NormalizedLead {
  return {
    provider: "foursquare",
    externalPlaceId: v.fsq_id,
    name: v.name,
    categoryPrimary: v.categories?.[0]?.name,
    categories: v.categories?.map((c) => c.name) ?? [],
    phone: v.tel,
    website: v.website,
    email: v.email,
    address: v.location?.formatted_address ?? v.location?.address,
    city: v.location?.locality,
    state: v.location?.region,
    country: v.location?.country,
    postalCode: v.location?.postcode,
    lat: v.geocodes?.main?.latitude,
    lng: v.geocodes?.main?.longitude,
    // Foursquare rating is 0-10; normalize to 0-5
    rating: typeof v.rating === "number" ? v.rating / 2 : undefined,
    reviewCount: v.stats?.total_ratings,
    businessStatus: mapBizStatus(v.closed_bucket),
    raw: v,
  };
}

export const foursquareProvider: LeadProvider = {
  id: "foursquare",
  displayName: "Foursquare Places",
  label: "Foursquare",
  status: "ready",
  requiredEnv: ["FOURSQUARE_API_KEY"],
  blurb: "Global POI database; strong in US, EU, APAC.",
  capabilities: {
    keyword: true,
    niche: true,
    geoBBox: true,
    geoRadius: true,
    postalCode: true,
    maxPageSize: 50,
  },
  async search(
    query: SearchQuery,
    ctx: ProviderContext,
    cursor?: string,
  ): Promise<SearchPage> {
    const apiKey = ctx.credentials.FOURSQUARE_API_KEY;
    if (!apiKey) throw new Error("FOURSQUARE_API_KEY not configured");

    const params = new URLSearchParams();
    const searchTerm = query.keyword ?? query.niche;
    if (searchTerm) params.set("query", searchTerm);
    params.set("limit", String(Math.min(50, query.limit)));
    params.set(
      "fields",
      "fsq_id,name,categories,location,geocodes,tel,website,email,rating,stats,closed_bucket",
    );

    if (typeof query.lat === "number" && typeof query.lng === "number") {
      params.set("ll", `${query.lat},${query.lng}`);
      if (query.radiusMeters)
        params.set("radius", String(Math.min(query.radiusMeters, 100_000)));
    } else {
      const near = [query.city, query.state, query.country]
        .filter(Boolean)
        .join(", ");
      if (near) params.set("near", near);
      if (query.postalCode) params.set("near", query.postalCode);
    }

    if (cursor) params.set("cursor", cursor);
    params.set(
      "sort",
      query.rankPreference === "distance" ? "DISTANCE" : "RELEVANCE",
    );

    const res = await fetch(`${BASE}/search?${params}`, {
      headers: { Authorization: apiKey, Accept: "application/json" },
      signal: ctx.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`foursquare search ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as FsqListResponse;
    await ctx.meter(data.results.length);
    return {
      leads: data.results.map(toNormalized),
      nextCursor: data.next_cursor,
    };
  },
};
