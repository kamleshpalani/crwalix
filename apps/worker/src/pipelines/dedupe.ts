/**
 * Cross-provider lead deduplication.
 *
 * Same physical business can show up in Google Places, Yelp, OSM, etc.
 * This module finds those duplicates by phone / website / name+address /
 * name+coords proximity and merges them into a single canonical Lead.
 *
 * The DB still treats `(organizationId, provider, externalPlaceId)` as
 * unique — when a match is found we update the existing row in place and
 * record an extra `LeadSource` so we know which providers contributed.
 */
import type { Prisma } from "@prisma/client";
import type { NormalizedLead } from "@crawlix/shared";

export type CandidateMatch = {
  leadId: string;
  reason:
    | "phone"
    | "website"
    | "name_address"
    | "name_geo"
    | "exact"
    | "email"
    | "place_id";
  confidence: number; // 0..1
};

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

/**
 * Look for an existing lead in the same org that represents the same
 * physical business as `candidate`. Skips leads with the same
 * `(provider, externalPlaceId)` because that case is handled by the
 * exact-match upsert path.
 */
export async function findDuplicateLead(
  tx: Prisma.TransactionClient,
  organizationId: string,
  candidate: NormalizedLead,
): Promise<CandidateMatch | null> {
  const phoneDigits = digitsOnly(candidate.phone);
  const host = websiteHost(candidate.website);
  const nameKey = normalizeName(candidate.name);
  const addrKey = normalizeAddress(candidate.address);
  const emailNorm = candidate.email?.toLowerCase().trim() || null;

  // 0. Provider-specific place IDs (Google Place ID / Yelp business ID).
  //    These are stable identifiers; an exact match means same business
  //    even if surfaced via a different provider record.
  if (candidate.provider === "google_places" && candidate.externalPlaceId) {
    const byPlace = await tx.lead.findFirst({
      where: {
        organizationId,
        googlePlaceId: candidate.externalPlaceId,
        NOT: {
          AND: [
            { provider: candidate.provider },
            { externalPlaceId: candidate.externalPlaceId },
          ],
        },
      },
      select: { id: true },
    });
    if (byPlace)
      return { leadId: byPlace.id, reason: "place_id", confidence: 0.99 };
  }
  if (candidate.provider === "yelp_fusion" && candidate.externalPlaceId) {
    const byYelp = await tx.lead.findFirst({
      where: {
        organizationId,
        yelpBusinessId: candidate.externalPlaceId,
        NOT: {
          AND: [
            { provider: candidate.provider },
            { externalPlaceId: candidate.externalPlaceId },
          ],
        },
      },
      select: { id: true },
    });
    if (byYelp)
      return { leadId: byYelp.id, reason: "place_id", confidence: 0.99 };
  }

  // 1. Phone match (highest confidence). Compare last 10 digits to
  //    survive country-code differences.
  if (phoneDigits.length >= 7) {
    const tail = phoneDigits.slice(-10);
    const byPhone = await tx.lead.findFirst({
      where: {
        organizationId,
        phoneNormalized: { endsWith: tail },
        NOT: {
          AND: [
            { provider: candidate.provider },
            { externalPlaceId: candidate.externalPlaceId },
          ],
        },
      },
      select: { id: true },
    });
    if (byPhone)
      return { leadId: byPhone.id, reason: "phone", confidence: 0.95 };
  }
  // 1b. Email match.
  if (emailNorm && emailNorm.includes("@")) {
    const byEmail = await tx.lead.findFirst({
      where: {
        organizationId,
        emailNormalized: emailNorm,
        NOT: {
          AND: [
            { provider: candidate.provider },
            { externalPlaceId: candidate.externalPlaceId },
          ],
        },
      },
      select: { id: true },
    });
    if (byEmail)
      return { leadId: byEmail.id, reason: "email", confidence: 0.92 };
  }
  // 2. Website hostname match.
  if (host) {
    const byWebsite = await tx.lead.findFirst({
      where: {
        organizationId,
        website: { contains: host, mode: "insensitive" },
        NOT: {
          AND: [
            { provider: candidate.provider },
            { externalPlaceId: candidate.externalPlaceId },
          ],
        },
      },
      select: { id: true },
    });
    if (byWebsite)
      return { leadId: byWebsite.id, reason: "website", confidence: 0.9 };
  }

  // 3 + 4. Name similarity, narrowed by city when available.
  if (nameKey.length >= 3) {
    const candidates = await tx.lead.findMany({
      where: {
        organizationId,
        city: candidate.city ?? undefined,
        NOT: {
          AND: [
            { provider: candidate.provider },
            { externalPlaceId: candidate.externalPlaceId },
          ],
        },
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

    let best: CandidateMatch | null = null;
    for (const c of candidates) {
      const nameSim = jaccard(nameKey, c.nameNormalized ?? "");
      if (nameSim < 0.55) continue;

      // 3. Name + address.
      if (addrKey && c.addressNormalized) {
        const addrSim = jaccard(addrKey, c.addressNormalized);
        if (nameSim >= 0.7 && addrSim >= 0.6) {
          const conf = Math.min(1, 0.4 + 0.4 * nameSim + 0.2 * addrSim);
          if (!best || conf > best.confidence) {
            best = { leadId: c.id, reason: "name_address", confidence: conf };
          }
          continue;
        }
      }

      // 4. Name + coordinates within ~150m.
      if (
        typeof candidate.lat === "number" &&
        typeof candidate.lng === "number" &&
        typeof c.lat === "number" &&
        typeof c.lng === "number"
      ) {
        const d = haversineMeters(
          { lat: candidate.lat, lng: candidate.lng },
          { lat: c.lat, lng: c.lng },
        );
        if (d <= 150 && nameSim >= 0.65) {
          const conf = Math.min(1, 0.5 + 0.3 * nameSim + (150 - d) / 1500);
          if (!best || conf > best.confidence) {
            best = { leadId: c.id, reason: "name_geo", confidence: conf };
          }
        }
      }
    }
    if (best) return best;
  }

  return null;
}

/**
 * Merge a new provider hit into the canonical lead row. Picks the best
 * available value for each field (longer phone, valid website, higher
 * rating count) and unions categories.
 */
export function buildMergeData(
  existing: {
    phone: string | null;
    phoneNormalized: string | null;
    email: string | null;
    emailNormalized: string | null;
    website: string | null;
    websiteStatus: string;
    rating: number | null;
    reviewCount: number | null;
    address: string | null;
    addressNormalized: string | null;
    categories: string[];
    sourceUrl: string | null;
  },
  incoming: NormalizedLead,
): Prisma.LeadUpdateInput {
  const data: Prisma.LeadUpdateInput = { lastSeenAt: new Date() };

  // Phone: prefer the longer normalized number (more digits = more likely
  // canonical).
  const incomingPhoneDigits = digitsOnly(incoming.phone);
  if (
    incomingPhoneDigits.length >
    digitsOnly(existing.phoneNormalized ?? existing.phone).length
  ) {
    data.phone = incoming.phone;
    data.phoneNormalized = incomingPhoneDigits || null;
  }

  // Website: take incoming if existing has none, OR if existing isn't an
  // http(s) URL and incoming is.
  if (incoming.website) {
    const existingHost = websiteHost(existing.website);
    const incomingHost = websiteHost(incoming.website);
    if (!existingHost && incomingHost) {
      data.website = incoming.website;
      data.websiteStatus = "EXISTS";
    }
  }

  // Rating + reviewCount: prefer the source with more reviews (more
  // statistically reliable).
  if (
    typeof incoming.reviewCount === "number" &&
    incoming.reviewCount > (existing.reviewCount ?? -1)
  ) {
    data.rating = incoming.rating ?? existing.rating;
    data.reviewCount = incoming.reviewCount;
  }

  // Address: keep existing unless empty.
  if (!existing.address && incoming.address) {
    data.address = incoming.address;
    data.addressNormalized = normalizeAddress(incoming.address);
  }

  // Categories: union.
  if (incoming.categories?.length) {
    const set = new Set([
      ...(existing.categories ?? []),
      ...incoming.categories,
    ]);
    data.categories = { set: Array.from(set) };
  }

  if (!existing.sourceUrl && incoming.sourceUrl) {
    data.sourceUrl = incoming.sourceUrl;
  }

  // Email: take incoming if existing has none.
  if (incoming.email && !existing.email) {
    data.email = incoming.email;
    data.emailNormalized = incoming.email.toLowerCase().trim();
  }

  return data;
}
