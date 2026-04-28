import type { Lead } from '@crawlix/db';
import { getPriorityRecommendation, SERVICE_PITCH_LABELS, BUSINESS_SCALE_LABELS, type ServicePitch, type BusinessScale } from '@crawlix/shared';

const FIELDS: Array<{ key: string; label: string }> = [
  { key: 'id', label: 'id' },
  { key: 'name', label: 'business_name' },
  { key: 'ownerName', label: 'owner_name' },
  { key: 'categoryPrimary', label: 'category' },
  { key: 'phone', label: 'phone' },
  { key: 'email', label: 'email' },
  { key: 'website', label: 'website' },
  { key: 'websiteStatus', label: 'website_status' },
  { key: 'websiteIssues', label: 'website_issues' },
  { key: 'facebookUrl', label: 'facebook_url' },
  { key: 'instagramUrl', label: 'instagram_url' },
  { key: 'googleProfileUrl', label: 'google_profile_url' },
  { key: 'servicePitchLabels', label: 'service_pitch' },
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
  { key: 'priorityLabel', label: 'priority_label' },
  { key: 'recommendation', label: 'recommendation' },
  { key: 'businessScale', label: 'business_scale' },
  { key: 'businessScaleLabel', label: 'business_scale_label' },
  { key: 'businessScaleConfidence', label: 'business_scale_confidence' },
  { key: 'status', label: 'status' },
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

function rowFor(l: Lead): Record<string, unknown> {
  const base = l as unknown as Record<string, unknown>;
  const rec = getPriorityRecommendation(l.priorityTier);
  const audit = (l as unknown as { websiteAudit?: { issues?: string[] } }).websiteAudit ?? null;
  const issues = Array.isArray(audit?.issues) ? audit!.issues!.join(' | ') : '';
  const pitches = Array.isArray((l as unknown as { servicePitch?: string[] }).servicePitch)
    ? ((l as unknown as { servicePitch: string[] }).servicePitch
        .map((p) => SERVICE_PITCH_LABELS[p as ServicePitch] ?? p)
        .join(' | '))
    : '';
  return {
    ...base,
    priorityLabel: rec.label,
    recommendation: rec.action,
    websiteIssues: issues,
    servicePitchLabels: pitches,
    businessScaleLabel:
      BUSINESS_SCALE_LABELS[(base.businessScale as BusinessScale) ?? 'UNKNOWN'] ??
      ''
  };
}

export function leadsToCsv(leads: Lead[]): string {
  const lines: string[] = [];
  lines.push(FIELDS.map((f) => f.label).join(','));
  for (const l of leads) {
    const row = rowFor(l);
    lines.push(FIELDS.map((f) => escape(row[f.key as string])).join(','));
  }
  return lines.join('\n');
}
