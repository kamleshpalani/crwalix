import type { Lead } from '@crawlix/db';

const FIELDS: Array<{ key: keyof Lead | 'score'; label: string }> = [
  { key: 'id', label: 'id' },
  { key: 'name', label: 'name' },
  { key: 'categoryPrimary', label: 'category' },
  { key: 'phone', label: 'phone' },
  { key: 'website', label: 'website' },
  { key: 'websiteStatus', label: 'website_status' },
  { key: 'address', label: 'address' },
  { key: 'city', label: 'city' },
  { key: 'state', label: 'state' },
  { key: 'country', label: 'country' },
  { key: 'postalCode', label: 'postal_code' },
  { key: 'lat', label: 'lat' },
  { key: 'lng', label: 'lng' },
  { key: 'rating', label: 'rating' },
  { key: 'reviewCount', label: 'review_count' },
  { key: 'score', label: 'score' },
  { key: 'priorityTier', label: 'priority_tier' },
  { key: 'businessStatus', label: 'business_status' },
  { key: 'provider', label: 'provider' },
  { key: 'externalPlaceId', label: 'external_id' }
];

function escape(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'string' ? v : String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    s = '"' + s.replaceAll('"', '""') + '"';
  }
  return s;
}

export function leadsToCsv(leads: Lead[]): string {
  const lines: string[] = [];
  lines.push(FIELDS.map((f) => f.label).join(','));
  for (const l of leads) {
    const row = FIELDS.map((f) => escape((l as unknown as Record<string, unknown>)[f.key as string]));
    lines.push(row.join(','));
  }
  return lines.join('\n');
}
