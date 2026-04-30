/**
 * Bing Maps Local Business Search REST API.
 *
 * Endpoint: GET https://dev.virtualearth.net/REST/v1/LocalSearch/
 * Auth:     key=<BING_MAPS_API_KEY> query param
 * Docs:     https://docs.microsoft.com/en-us/bingmaps/rest-services/locations/local-search
 */
import { BusinessStatus, type NormalizedLead } from "@crawlix/shared";
import type { ProviderContext, SearchPage, SearchQuery } from "../types";
import type { LeadProvider } from "./types";

const BASE = "https://dev.virtualearth.net/REST/v1/LocalSearch/";

interface BingBusiness {
  name: string;
  Address?: {
    addressLine?: string;
    locality?: string;
    adminDistrict?: string;
    countryRegion?: string;
    postalCode?: string;
    formattedAddress?: string;
  };
  point?: { coordinates: [number, number] };
  PhoneNumber?: string;
  Website?: string;
  entityId?: string;
  type?: string;
}

interface BingResponse {
  resourceSets?: Array<{
    resources?: Array<{ value?: BingBusiness[] }>;
  }>;
}

function toNormalized(r: BingBusiness, idx: number): NormalizedLead {
  return {
    provider: "bing_maps",
    externalPlaceId:
      r.entityId ??
      `bing_${idx}_${(r.name ?? "unknown").replace(/\s/g, "_").slice(0, 40)}`,
    name: r.name,
    categoryPrimary: r.type,
    categories: r.type ? [r.type] : [],
    phone: r.PhoneNumber,
    website: r.Website,
    address: r.Address?.formattedAddress ?? r.Address?.addressLine,
    city: r.Address?.locality,
    state: r.Address?.adminDistrict,
    country: r.Address?.countryRegion,
    postalCode: r.Address?.postalCode,
    lat: r.point?.coordinates?.[0],
    lng: r.point?.coordinates?.[1],
    businessStatus: BusinessStatus.UNKNOWN,
    raw: r,
  };
}

export const bingProvider: LeadProvider = {
  id: "bing_maps",
  displayName: "Bing Maps Local Search",
  label: "Bing Maps",
  status: "ready",
  requiredEnv: ["BING_MAPS_API_KEY"],
  blurb: "Microsoft local business data; global coverage.",
  capabilities: {
    keyword: true,
    niche: true,
    geoBBox: true,
    geoRadius: true,
    postalCode: true,
    maxPageSize: 25,
  },
  async search(
    query: SearchQuery,
    ctx: ProviderContext,
    cursor?: string,
  ): Promise<SearchPage> {
    const apiKey = ctx.credentials.BING_MAPS_API_KEY;
    if (!apiKey) throw new Error("BING_MAPS_API_KEY not configured");

    const params = new URLSearchParams();
    params.set("key", apiKey);
    params.set("maxResults", String(Math.min(25, query.limit)));
    params.set("query", query.keyword ?? query.niche ?? "business");

    if (typeof query.lat === "number" && typeof query.lng === "number") {
      params.set("userLocation", `${query.lat},${query.lng}`);
      if (query.radiusMeters) {
        params.set(
          "userCircularMapView",
          `${query.lat},${query.lng},${query.radiusMeters}`,
        );
      }
    } else {
      const place = [query.city, query.state, query.country]
        .filter(Boolean)
        .join(", ");
      if (place) params.set("userLocation", place);
    }

    // Bing uses numeric offset for pagination
    if (cursor) params.set("offset", cursor);

    const res = await fetch(`${BASE}?${params}`, { signal: ctx.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`bing_maps search ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as BingResponse;
    const raw: BingBusiness[] = [];
    for (const set of data.resourceSets ?? []) {
      for (const resource of set.resources ?? []) {
        raw.push(...(resource.value ?? []));
      }
    }
    await ctx.meter(raw.length);

    const offset = cursor ? parseInt(cursor, 10) : 0;
    const limit = Math.min(25, query.limit);
    return {
      leads: raw.map((r, i) => toNormalized(r, offset + i)),
      nextCursor:
        raw.length === limit ? String(offset + raw.length) : undefined,
    };
  },
};
