import { BusinessStatus } from '@crawlix/shared';
import type { NormalizedLead } from '@crawlix/shared';

/**
 * Normalize provider-raw records into the canonical NormalizedLead shape.
 * For Phase 1 we trust provider adapters to emit mostly-normalized records;
 * this function re-applies light whitespace/phone/postal normalization and
 * fills defaults.
 */
export function normalizeOne(raw: Partial<NormalizedLead> & { raw: unknown }): NormalizedLead {
  return {
    provider: raw.provider!,
    externalPlaceId: raw.externalPlaceId!,
    name: (raw.name ?? '').trim(),
    categoryPrimary: raw.categoryPrimary?.trim(),
    categories: raw.categories ?? [],
    phone: normalizePhone(raw.phone),
    website: raw.website?.trim(),
    sourceUrl: raw.sourceUrl,
    address: raw.address?.trim(),
    city: raw.city?.trim(),
    state: raw.state?.trim(),
    country: raw.country?.trim(),
    postalCode: raw.postalCode?.trim(),
    lat: raw.lat,
    lng: raw.lng,
    businessStatus: raw.businessStatus ?? BusinessStatus.UNKNOWN,
    rating: raw.rating,
    reviewCount: raw.reviewCount,
    raw: raw.raw
  };
}

function normalizePhone(p: string | undefined): string | undefined {
  if (!p) return undefined;
  return p.replace(/[^\d+]/g, '');
}

export function normalizedName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
