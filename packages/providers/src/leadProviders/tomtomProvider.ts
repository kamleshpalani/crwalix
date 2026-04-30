/**
 * TomTom Search API v2.
 *
 * Endpoint: GET https://api.tomtom.com/search/2/search/{query}.json
 * Auth:     key=<TOMTOM_API_KEY> query param
 * Docs:     https://developer.tomtom.com/search-api/documentation/search-service/fuzzy-search
 */
import { BusinessStatus, type NormalizedLead } from "@crawlix/shared";
import type { ProviderContext, SearchPage, SearchQuery } from "../types";
import type { LeadProvider } from "./types";

const BASE = "https://api.tomtom.com/search/2/search";

interface TomTomResult {
  id: string;
  poi?: {
    name?: string;
    phone?: string;
    url?: string;
    email?: string;
    categories?: string[];
    classifications?: Array<{ code: string; names?: Array<{ name: string }> }>;
  };
  address?: {
    freeformAddress?: string;
    municipality?: string;
    countrySubdivision?: string;
    country?: string;
    postalCode?: string;
  };
  position?: { lat: number; lon: number };
}

interface TomTomResponse {
  results?: TomTomResult[];
  summary?: { totalResults?: number; offset?: number; numResults?: number };
}

function toNormalized(r: TomTomResult): NormalizedLead {
  const cat =
    r.poi?.classifications?.[0]?.names?.[0]?.name ?? r.poi?.categories?.[0];
  return {
    provider: "tomtom",
    externalPlaceId: r.id,
    name: r.poi?.name ?? "Unknown",
    categoryPrimary: cat,
    categories: r.poi?.categories ?? [],
    phone: r.poi?.phone,
    website: r.poi?.url,
    email: r.poi?.email,
    address: r.address?.freeformAddress,
    city: r.address?.municipality,
    state: r.address?.countrySubdivision,
    country: r.address?.country,
    postalCode: r.address?.postalCode,
    lat: r.position?.lat,
    lng: r.position?.lon,
    businessStatus: BusinessStatus.UNKNOWN,
    raw: r,
  };
}

export const tomtomProvider: LeadProvider = {
  id: "tomtom",
  displayName: "TomTom Search API",
  label: "TomTom",
  status: "ready",
  requiredEnv: ["TOMTOM_API_KEY"],
  blurb: "Automotive-grade POI data; strong in EU and APAC.",
  capabilities: {
    keyword: true,
    niche: true,
    geoBBox: false,
    geoRadius: true,
    postalCode: true,
    maxPageSize: 100,
  },
  async search(
    query: SearchQuery,
    ctx: ProviderContext,
    cursor?: string,
  ): Promise<SearchPage> {
    const apiKey = ctx.credentials.TOMTOM_API_KEY;
    if (!apiKey) throw new Error("TOMTOM_API_KEY not configured");

    const offset = cursor ? parseInt(cursor, 10) : 0;
    const limit = Math.min(100, query.limit);
    const searchTerm = encodeURIComponent(
      query.keyword ?? query.niche ?? "business",
    );

    const params = new URLSearchParams();
    params.set("key", apiKey);
    params.set("limit", String(limit));
    params.set("ofs", String(offset));
    params.set("language", "en-US");

    if (typeof query.lat === "number" && typeof query.lng === "number") {
      params.set("lat", String(query.lat));
      params.set("lon", String(query.lng));
      if (query.radiusMeters) params.set("radius", String(query.radiusMeters));
    } else if (query.country) {
      params.set("countrySet", query.country.toUpperCase());
    }

    const res = await fetch(`${BASE}/${searchTerm}.json?${params}`, {
      signal: ctx.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`tomtom search ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as TomTomResponse;
    const results = data.results ?? [];
    await ctx.meter(results.length);

    const total = data.summary?.totalResults ?? 0;
    const nextOffset = offset + results.length;
    return {
      leads: results.map(toNormalized),
      nextCursor: nextOffset < total ? String(nextOffset) : undefined,
      total,
    };
  },
};
