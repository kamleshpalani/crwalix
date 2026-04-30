/**
 * Geoapify Places API v2.
 *
 * Endpoint: GET https://api.geoapify.com/v2/places
 * Auth:     apiKey=<GEOAPIFY_API_KEY> query param
 * Docs:     https://apidocs.geoapify.com/docs/places
 */
import { BusinessStatus, type NormalizedLead } from "@crawlix/shared";
import type { ProviderContext, SearchPage, SearchQuery } from "../types";
import type { LeadProvider } from "./types";

const BASE = "https://api.geoapify.com/v2/places";

interface GeoFeatureProps {
  place_id?: string;
  name?: string;
  categories?: string[];
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postcode?: string;
  phone?: string;
  website?: string;
  email?: string;
  lat?: number;
  lon?: number;
  contact?: { phone?: string; website?: string; email?: string };
}

interface GeoFeature {
  type: "Feature";
  properties: GeoFeatureProps;
  geometry?: { coordinates?: [number, number] };
}

interface GeoResponse {
  type: "FeatureCollection";
  features: GeoFeature[];
}

function toNormalized(f: GeoFeature): NormalizedLead {
  const p = f.properties;
  const id =
    p.place_id ??
    `geo_${p.lat}_${p.lon}_${(p.name ?? "").replace(/\s/g, "_").slice(0, 40)}`;
  return {
    provider: "geoapify",
    externalPlaceId: id,
    name: p.name ?? "Unknown",
    categoryPrimary: p.categories?.[0],
    categories: p.categories ?? [],
    phone: p.phone ?? p.contact?.phone,
    website: p.website ?? p.contact?.website,
    email: p.email ?? p.contact?.email,
    address:
      [p.address_line1, p.address_line2].filter(Boolean).join(", ") ||
      undefined,
    city: p.city,
    state: p.state,
    country: p.country,
    postalCode: p.postcode,
    lat: p.lat ?? f.geometry?.coordinates?.[1],
    lng: p.lon ?? f.geometry?.coordinates?.[0],
    businessStatus: BusinessStatus.UNKNOWN,
    raw: f,
  };
}

export const geoapifyProvider: LeadProvider = {
  id: "geoapify",
  displayName: "Geoapify Places",
  label: "Geoapify",
  status: "ready",
  requiredEnv: ["GEOAPIFY_API_KEY"],
  blurb: "OpenStreetMap-based with enriched business data.",
  capabilities: {
    keyword: true,
    niche: true,
    geoBBox: true,
    geoRadius: true,
    postalCode: true,
    maxPageSize: 500,
  },
  async search(
    query: SearchQuery,
    ctx: ProviderContext,
    cursor?: string,
  ): Promise<SearchPage> {
    const apiKey = ctx.credentials.GEOAPIFY_API_KEY;
    if (!apiKey) throw new Error("GEOAPIFY_API_KEY not configured");

    const offset = cursor ? parseInt(cursor, 10) : 0;
    const limit = Math.min(500, query.limit);

    const params = new URLSearchParams();
    params.set("apiKey", apiKey);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("lang", "en");
    // broad commercial + service categories
    params.set(
      "categories",
      "commercial,service,catering,healthcare,leisure,sport,tourism",
    );

    const searchTerm = query.keyword ?? query.niche;
    if (searchTerm) params.set("name", searchTerm);

    if (typeof query.lat === "number" && typeof query.lng === "number") {
      const radius = query.radiusMeters ?? 5_000;
      params.set("filter", `circle:${query.lng},${query.lat},${radius}`);
      params.set("bias", `proximity:${query.lng},${query.lat}`);
    } else if (query.postalCode) {
      params.set("filter", `postcode:${query.postalCode}`);
    } else if (query.city) {
      params.set("filter", `place:${query.city}`);
    } else if (query.country) {
      params.set("filter", `countrycode:${query.country.toLowerCase()}`);
    }

    const res = await fetch(`${BASE}?${params}`, { signal: ctx.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`geoapify search ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as GeoResponse;
    const features = data.features ?? [];
    await ctx.meter(features.length);

    return {
      leads: features.map(toNormalized),
      nextCursor:
        features.length === limit
          ? String(offset + features.length)
          : undefined,
    };
  },
};
