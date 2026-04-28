/**
 * OpenStreetMap (Nominatim + Overpass API) — keyless business discovery.
 *
 * Strategy:
 *  1. Resolve a bounding box for the user's location string via Nominatim.
 *  2. Query Overpass for nodes/ways/relations within that bbox whose `name`
 *     matches the keyword and that carry common business tags
 *     (amenity, shop, office, craft, tourism, healthcare, leisure).
 *
 * Notes:
 *  - Nominatim usage policy requires a valid User-Agent and ≤ 1 req/sec.
 *  - Overpass instances are public; results are cached upstream.
 *  - `nextCursor` is unused — Overpass returns one page per query.
 */
import { BusinessStatus, type NormalizedLead } from '@crawlix/shared';
import type { ProviderContext, SearchPage, SearchProvider, SearchQuery } from '../types';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const UA = 'Crawlix-Lead-Discovery/1.0 (contact: ops@crawlix.local)';

/**
 * Nominatim's usage policy caps clients at 1 request per second.
 * We serialize all calls through a chain of promises and ensure at least
 * 1100ms passes between successive requests from this process.
 *   https://operations.osmfoundation.org/policies/nominatim/
 */
const NOMINATIM_MIN_GAP_MS = 1100;
let nominatimChain: Promise<unknown> = Promise.resolve();
let nominatimLastAt = 0;
function rateLimitedNominatim<T>(fn: () => Promise<T>): Promise<T> {
  const next = nominatimChain.then(async () => {
    const wait = Math.max(0, nominatimLastAt + NOMINATIM_MIN_GAP_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    nominatimLastAt = Date.now();
    return fn();
  });
  // Don't let one failure poison the chain.
  nominatimChain = next.catch(() => undefined);
  return next;
}

interface NominatimResult {
  lat: string;
  lon: string;
  /** [south, north, west, east] as strings */
  boundingbox: [string, string, string, string];
  display_name: string;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

const BUSINESS_KEYS = [
  'amenity',
  'shop',
  'office',
  'craft',
  'tourism',
  'healthcare',
  'leisure',
  'industrial'
];

function pickCategory(tags: Record<string, string> | undefined): {
  primary?: string;
  all: string[];
} {
  if (!tags) return { all: [] };
  const all: string[] = [];
  let primary: string | undefined;
  for (const k of BUSINESS_KEYS) {
    const v = tags[k];
    if (v && v !== 'yes') {
      const label = `${k}=${v}`;
      all.push(label);
      if (!primary) primary = label;
    }
  }
  return { primary, all };
}

function tagsToAddress(tags: Record<string, string> | undefined): {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
} {
  if (!tags) return {};
  const street =
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ').trim() || undefined;
  return {
    address: street,
    city: tags['addr:city'],
    state: tags['addr:state'] ?? tags['addr:province'],
    country: tags['addr:country'],
    postalCode: tags['addr:postcode']
  };
}

function elementToLead(el: OverpassElement): NormalizedLead | null {
  const tags = el.tags ?? {};
  const name = tags.name ?? tags['name:en'];
  if (!name) return null;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const cat = pickCategory(tags);
  const addr = tagsToAddress(tags);
  const phone = tags.phone ?? tags['contact:phone'];
  const website = tags.website ?? tags['contact:website'] ?? tags.url;

  return {
    provider: 'osm',
    externalPlaceId: `${el.type}/${el.id}`,
    name,
    categoryPrimary: cat.primary,
    categories: cat.all,
    phone,
    website: website && /^https?:\/\//i.test(website) ? website : undefined,
    sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    address: addr.address,
    city: addr.city,
    state: addr.state,
    country: addr.country,
    postalCode: addr.postalCode,
    lat,
    lng: lon,
    businessStatus: BusinessStatus.UNKNOWN,
    rating: undefined,
    reviewCount: undefined,
    raw: el
  };
}

async function resolveBbox(query: SearchQuery, signal: AbortSignal): Promise<NominatimResult | null> {
  const parts = [query.city, query.state, query.country].filter(Boolean);
  const q = parts.join(', ');
  if (!q) return null;
  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`;
  const res = await rateLimitedNominatim(() =>
    fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal
    })
  );
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const arr = (await res.json()) as NominatimResult[];
  return arr[0] ?? null;
}

function buildOverpassQuery(opts: {
  bbox: [number, number, number, number];
  keyword?: string;
  limit: number;
}): string {
  const [s, w, n, e] = opts.bbox;
  const bboxStr = `${s},${w},${n},${e}`;
  const nameFilter = opts.keyword
    ? `["name"~"${opts.keyword.replace(/["\\]/g, '')}",i]`
    : '';
  const filters = BUSINESS_KEYS.map((k) =>
    [`node["${k}"]${nameFilter}(${bboxStr});`, `way["${k}"]${nameFilter}(${bboxStr});`].join('')
  ).join('');
  return `[out:json][timeout:25];(${filters});out center ${opts.limit};`;
}

export const osmOverpassProvider: SearchProvider = {
  id: 'osm',
  displayName: 'OpenStreetMap (Overpass)',
  capabilities: {
    keyword: true,
    niche: true,
    geoBBox: true,
    geoRadius: false,
    postalCode: false,
    maxPageSize: 200
  },
  async search(query: SearchQuery, ctx: ProviderContext): Promise<SearchPage> {
    let bbox: [number, number, number, number] | null = null;
    if (
      typeof query.lat === 'number' &&
      typeof query.lng === 'number' &&
      query.radiusMeters
    ) {
      const dLat = query.radiusMeters / 111_320;
      const dLng = query.radiusMeters / (111_320 * Math.cos((query.lat * Math.PI) / 180));
      bbox = [query.lat - dLat, query.lng - dLng, query.lat + dLat, query.lng + dLng];
    } else {
      const loc = await resolveBbox(query, ctx.signal);
      if (!loc) {
        throw new Error('osm: could not geocode location (set city/state/country)');
      }
      const [sStr, nStr, wStr, eStr] = loc.boundingbox;
      bbox = [Number(sStr), Number(wStr), Number(nStr), Number(eStr)];
    }

    const overpassQL = buildOverpassQuery({
      bbox,
      keyword: query.keyword ?? query.niche,
      limit: Math.min(200, query.limit)
    });

    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: `data=${encodeURIComponent(overpassQL)}`,
      signal: ctx.signal
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`overpass ${res.status}: ${txt.slice(0, 300)}`);
    }
    const data = (await res.json()) as OverpassResponse;
    const elements = data.elements ?? [];
    await ctx.meter(elements.length || 1);

    const seen = new Set<string>();
    const leads: NormalizedLead[] = [];
    for (const el of elements) {
      const lead = elementToLead(el);
      if (!lead) continue;
      const key = lead.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      leads.push(lead);
      if (leads.length >= query.limit) break;
    }
    return { leads, total: leads.length };
  }
};
