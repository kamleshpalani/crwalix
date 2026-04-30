/**
 * HERE Discover / Browse API.
 *
 * Endpoint: GET https://discover.search.hereapi.com/v1/discover
 * Auth:     apiKey=<HERE_API_KEY> query param
 * Docs:     https://developer.here.com/documentation/geocoding-search-api
 */
import { BusinessStatus, type NormalizedLead } from "@crawlix/shared";
import type { ProviderContext, SearchPage, SearchQuery } from "../types";
import type { LeadProvider } from "./types";

const BASE = "https://discover.search.hereapi.com/v1/discover";

interface HereContact {
  phone?: Array<{ value: string }>;
  www?: Array<{ value: string }>;
  email?: Array<{ value: string }>;
}

interface HereItem {
  id: string;
  title: string;
  address?: {
    label?: string;
    city?: string;
    state?: string;
    countryName?: string;
    postalCode?: string;
  };
  position?: { lat: number; lng: number };
  contacts?: HereContact[];
  categories?: Array<{ id: string; name: string; primary?: boolean }>;
}

interface HereResponse {
  items: HereItem[];
  next?: string;
}

function toNormalized(item: HereItem): NormalizedLead {
  const contact = item.contacts?.[0];
  const primaryCat =
    item.categories?.find((c) => c.primary) ?? item.categories?.[0];
  return {
    provider: "here",
    externalPlaceId: item.id,
    name: item.title,
    categoryPrimary: primaryCat?.name,
    categories: item.categories?.map((c) => c.name) ?? [],
    phone: contact?.phone?.[0]?.value,
    website: contact?.www?.[0]?.value,
    email: contact?.email?.[0]?.value,
    address: item.address?.label,
    city: item.address?.city,
    state: item.address?.state,
    country: item.address?.countryName,
    postalCode: item.address?.postalCode,
    lat: item.position?.lat,
    lng: item.position?.lng,
    businessStatus: BusinessStatus.UNKNOWN,
    raw: item,
  };
}

export const hereProvider: LeadProvider = {
  id: "here",
  displayName: "HERE Places",
  label: "HERE",
  status: "ready",
  requiredEnv: ["HERE_API_KEY"],
  blurb: "Premium mapping + POI data; strong global coverage.",
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
    const apiKey = ctx.credentials.HERE_API_KEY;
    if (!apiKey) throw new Error("HERE_API_KEY not configured");

    // HERE returns a full "next" URL as the pagination cursor
    if (cursor?.startsWith("http")) {
      const res = await fetch(`${cursor}&apiKey=${apiKey}`, {
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`here cursor ${res.status}`);
      const data = (await res.json()) as HereResponse;
      await ctx.meter(data.items.length);
      return { leads: data.items.map(toNormalized), nextCursor: data.next };
    }

    const params = new URLSearchParams();
    params.set("apiKey", apiKey);
    params.set(
      "q",
      [
        query.keyword ?? query.niche ?? "business",
        query.city,
        query.state,
        query.country,
      ]
        .filter(Boolean)
        .join(" "),
    );
    params.set("limit", String(Math.min(100, query.limit)));
    params.set("lang", "en");

    if (typeof query.lat === "number" && typeof query.lng === "number") {
      params.set("at", `${query.lat},${query.lng}`);
      if (query.radiusMeters) {
        params.set(
          "in",
          `circle:${query.lat},${query.lng};r=${query.radiusMeters}`,
        );
      }
    } else if (query.country && query.country.length === 2) {
      params.set("in", `countryCode:${query.country.toUpperCase()}`);
    }

    const res = await fetch(`${BASE}?${params}`, { signal: ctx.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`here search ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as HereResponse;
    await ctx.meter(data.items.length);
    return { leads: data.items.map(toNormalized), nextCursor: data.next };
  },
};
