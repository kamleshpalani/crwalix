import { LeadFilterSchema, type LeadFilter } from '@crawlix/shared';

/** Parse Next.js searchParams into a validated LeadFilter. */
export function parseLeadFilter(
  searchParams: Record<string, string | string[] | undefined>
): LeadFilter {
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(searchParams)) {
    if (v === undefined) continue;
    // Allow comma-separated multi-values for websiteStatus / priorityTier.
    if ((k === 'websiteStatus' || k === 'priorityTier' || k === 'status' || k === 'businessScale') && typeof v === 'string' && v.includes(',')) {
      flat[k] = v.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(v) && v.length === 1) {
      flat[k] = v[0];
    } else {
      flat[k] = v;
    }
  }
  // Drop empty strings so optional fields stay undefined.
  for (const k of Object.keys(flat)) {
    if (flat[k] === '') delete flat[k];
  }
  const parsed = LeadFilterSchema.safeParse(flat);
  return parsed.success ? parsed.data : LeadFilterSchema.parse({});
}

/** Build a query string base for pagination links, omitting `page`. */
export function buildBaseHref(
  pathname: string,
  filter: LeadFilter
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (k === 'page') continue;
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) params.set(k, v.join(','));
    else params.set(k, String(v));
  }
  const qs = params.toString();
  return `${pathname}?${qs ? qs + '&' : ''}`;
}
