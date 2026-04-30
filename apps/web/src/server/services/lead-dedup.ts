/**
 * Web-side helpers for lead deduplication. Mirrors apps/worker/src/pipelines/dedupe.ts
 * for shared normalization primitives so manual / CSV / API entry points can
 * benefit from the same dedup logic without importing worker code.
 */
import type { Prisma } from "@prisma/client";

const PHONE_DIGITS = /\d+/g;

export function digitsOnly(s: string | null | undefined): string {
  if (!s) return "";
  return (s.match(PHONE_DIGITS) ?? []).join("");
}

export function websiteHost(s: string | null | undefined): string | null {
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeAddress(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(
      /\b(street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|suite|ste|apt|unit|floor|fl)\b\.?/g,
      "",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Token-set Jaccard similarity, robust to word order. */
export function jaccard(a: string, b: string): number {
  const ta = new Set(a.split(/\s+/).filter(Boolean));
  const tb = new Set(b.split(/\s+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Great-circle distance between two lat/lng points in meters. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export type DupCandidate = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  googlePlaceId?: string | null;
  yelpBusinessId?: string | null;
  externalPlaceId?: string | null;
  provider?: string | null;
  city?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type DupHit = {
  leadId: string;
  reason:
    | "exact"
    | "place_id"
    | "phone"
    | "email"
    | "website"
    | "name_city"
    | "name_address"
    | "name_geo";
  confidence: number;
};

/**
 * Lightweight dedup lookup used by manual entry / CSV import. Checks (in
 * priority order):
 *   1. Exact (provider, externalPlaceId)
 *   2. Provider-specific id (googlePlaceId or yelpBusinessId)
 *   3. Phone (last 10 digits)
 *   4. Email (case-insensitive)
 *   5. Website hostname
 *   6. Name + city fuzzy
 *
 * Returns the first hit. Caller decides whether to merge automatically or
 * flag for review.
 */
export async function findDupOnEntry(
  tx: Prisma.TransactionClient,
  organizationId: string,
  candidate: DupCandidate,
): Promise<DupHit | null> {
  return (
    (await checkExactExternalId(tx, organizationId, candidate)) ??
    (await checkPlaceIds(tx, organizationId, candidate)) ??
    (await checkPhone(tx, organizationId, candidate)) ??
    (await checkEmail(tx, organizationId, candidate)) ??
    (await checkWebsite(tx, organizationId, candidate)) ??
    (await checkNameAndFuzzy(tx, organizationId, candidate))
  );
}

async function checkExactExternalId(
  tx: Prisma.TransactionClient,
  organizationId: string,
  candidate: DupCandidate,
): Promise<DupHit | null> {
  if (!candidate.provider || !candidate.externalPlaceId) return null;
  const exact = await tx.lead.findFirst({
    where: {
      organizationId,
      provider: candidate.provider,
      externalPlaceId: candidate.externalPlaceId,
    },
    select: { id: true },
  });
  return exact ? { leadId: exact.id, reason: "exact", confidence: 1 } : null;
}

async function checkPlaceIds(
  tx: Prisma.TransactionClient,
  organizationId: string,
  candidate: DupCandidate,
): Promise<DupHit | null> {
  if (candidate.googlePlaceId) {
    const hit = await tx.lead.findFirst({
      where: { organizationId, googlePlaceId: candidate.googlePlaceId },
      select: { id: true },
    });
    if (hit) return { leadId: hit.id, reason: "place_id", confidence: 0.99 };
  }
  if (candidate.yelpBusinessId) {
    const hit = await tx.lead.findFirst({
      where: { organizationId, yelpBusinessId: candidate.yelpBusinessId },
      select: { id: true },
    });
    if (hit) return { leadId: hit.id, reason: "place_id", confidence: 0.99 };
  }
  return null;
}

async function checkPhone(
  tx: Prisma.TransactionClient,
  organizationId: string,
  candidate: DupCandidate,
): Promise<DupHit | null> {
  const tail = digitsOnly(candidate.phone);
  if (tail.length < 7) return null;
  const last10 = tail.slice(-10);
  const hit = await tx.lead.findFirst({
    where: { organizationId, phoneNormalized: { endsWith: last10 } },
    select: { id: true },
  });
  return hit ? { leadId: hit.id, reason: "phone", confidence: 0.95 } : null;
}

async function checkEmail(
  tx: Prisma.TransactionClient,
  organizationId: string,
  candidate: DupCandidate,
): Promise<DupHit | null> {
  if (!candidate.email) return null;
  const norm = candidate.email.toLowerCase().trim();
  if (!norm.includes("@")) return null;
  const hit = await tx.lead.findFirst({
    where: { organizationId, emailNormalized: norm },
    select: { id: true },
  });
  return hit ? { leadId: hit.id, reason: "email", confidence: 0.92 } : null;
}

async function checkWebsite(
  tx: Prisma.TransactionClient,
  organizationId: string,
  candidate: DupCandidate,
): Promise<DupHit | null> {
  const host = websiteHost(candidate.website);
  if (!host) return null;
  const hit = await tx.lead.findFirst({
    where: {
      organizationId,
      website: { contains: host, mode: "insensitive" },
    },
    select: { id: true },
  });
  return hit ? { leadId: hit.id, reason: "website", confidence: 0.9 } : null;
}

async function checkNameAndFuzzy(
  tx: Prisma.TransactionClient,
  organizationId: string,
  candidate: DupCandidate,
): Promise<DupHit | null> {
  const nameKey = normalizeName(candidate.name);
  if (nameKey.length < 3) return null;
  const addrKey = normalizeAddress(candidate.address);

  if (candidate.city) {
    const hit = await tx.lead.findFirst({
      where: {
        organizationId,
        nameNormalized: nameKey,
        city: { equals: candidate.city, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (hit) return { leadId: hit.id, reason: "name_city", confidence: 0.7 };
  }

  return fuzzyMatch(tx, organizationId, candidate, nameKey, addrKey);
}

type FuzzyRow = {
  id: string;
  nameNormalized: string | null;
  addressNormalized: string | null;
  lat: number | null;
  lng: number | null;
};

async function fuzzyMatch(
  tx: Prisma.TransactionClient,
  organizationId: string,
  candidate: DupCandidate,
  nameKey: string,
  addrKey: string,
): Promise<DupHit | null> {
  const rows: FuzzyRow[] = await tx.lead.findMany({
    where: {
      organizationId,
      ...(candidate.city
        ? { city: { equals: candidate.city, mode: "insensitive" } }
        : {}),
    },
    select: {
      id: true,
      nameNormalized: true,
      addressNormalized: true,
      lat: true,
      lng: true,
    },
    take: 200,
  });

  let best: DupHit | null = null;
  for (const c of rows) {
    const nameSim = jaccard(nameKey, c.nameNormalized ?? "");
    if (nameSim < 0.55) continue;
    const hit =
      tryAddressMatch(c, nameSim, addrKey) ??
      tryGeoMatch(c, nameSim, candidate);
    if (hit && (!best || hit.confidence > best.confidence)) best = hit;
  }
  return best;
}

function tryAddressMatch(
  c: FuzzyRow,
  nameSim: number,
  addrKey: string,
): DupHit | null {
  if (!addrKey || !c.addressNormalized) return null;
  const addrSim = jaccard(addrKey, c.addressNormalized);
  if (nameSim < 0.7 || addrSim < 0.6) return null;
  const conf = Math.min(1, 0.4 + 0.4 * nameSim + 0.2 * addrSim);
  return { leadId: c.id, reason: "name_address", confidence: conf };
}

function tryGeoMatch(
  c: FuzzyRow,
  nameSim: number,
  candidate: DupCandidate,
): DupHit | null {
  if (
    typeof candidate.lat !== "number" ||
    typeof candidate.lng !== "number" ||
    typeof c.lat !== "number" ||
    typeof c.lng !== "number"
  ) {
    return null;
  }
  const d = haversineMeters(
    { lat: candidate.lat, lng: candidate.lng },
    { lat: c.lat, lng: c.lng },
  );
  if (d > 150 || nameSim < 0.65) return null;
  const conf = Math.min(1, 0.5 + 0.3 * nameSim + (150 - d) / 1500);
  return { leadId: c.id, reason: "name_geo", confidence: conf };
}
