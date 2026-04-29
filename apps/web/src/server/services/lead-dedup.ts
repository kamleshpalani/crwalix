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
};

export type DupHit = {
  leadId: string;
  reason: "exact" | "place_id" | "phone" | "email" | "website" | "name_city";
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
  if (candidate.provider && candidate.externalPlaceId) {
    const exact = await tx.lead.findFirst({
      where: {
        organizationId,
        provider: candidate.provider,
        externalPlaceId: candidate.externalPlaceId,
      },
      select: { id: true },
    });
    if (exact) return { leadId: exact.id, reason: "exact", confidence: 1 };
  }

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

  const tail = digitsOnly(candidate.phone);
  if (tail.length >= 7) {
    const last10 = tail.slice(-10);
    const hit = await tx.lead.findFirst({
      where: {
        organizationId,
        phoneNormalized: { endsWith: last10 },
      },
      select: { id: true },
    });
    if (hit) return { leadId: hit.id, reason: "phone", confidence: 0.95 };
  }

  if (candidate.email) {
    const norm = candidate.email.toLowerCase().trim();
    if (norm.includes("@")) {
      const hit = await tx.lead.findFirst({
        where: { organizationId, emailNormalized: norm },
        select: { id: true },
      });
      if (hit) return { leadId: hit.id, reason: "email", confidence: 0.92 };
    }
  }

  const host = websiteHost(candidate.website);
  if (host) {
    const hit = await tx.lead.findFirst({
      where: {
        organizationId,
        website: { contains: host, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (hit) return { leadId: hit.id, reason: "website", confidence: 0.9 };
  }

  const nameKey = normalizeName(candidate.name);
  if (nameKey.length >= 3 && candidate.city) {
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

  return null;
}
