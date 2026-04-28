/**
 * Pure validators for the search-edit form. Kept separate from the server
 * action so they can be unit-tested without Next.js / Prisma.
 */

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const ALLOWED_LEAD_FOCUS = ['ALL', 'NO_WEBSITE', 'HIGH_OR_MED'] as const;
export type LeadFocusValue = (typeof ALLOWED_LEAD_FOCUS)[number];

export const ALLOWED_SCHEDULE = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type ScheduleValue = (typeof ALLOWED_SCHEDULE)[number];

export function validateName(input: string): ValidationResult<string> {
  const v = input.trim();
  if (!v) return { ok: false, error: 'Name is required.' };
  if (v.length > 120) return { ok: false, error: 'Name is too long (max 120).' };
  return { ok: true, value: v };
}

export function validateResultLimit(input: string): ValidationResult<number | undefined> {
  const s = input.trim();
  if (s === '') return { ok: true, value: undefined };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1 || n > 500) {
    return { ok: false, error: 'Result limit must be between 1 and 500.' };
  }
  return { ok: true, value: Math.floor(n) };
}

export function validateRadius(input: string | null): ValidationResult<number | null | undefined> {
  if (input === null) return { ok: true, value: undefined };
  const s = input.trim();
  if (s === '') return { ok: true, value: null };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 50_000) {
    return { ok: false, error: 'Radius must be 0..50000 meters.' };
  }
  return { ok: true, value: Math.floor(n) };
}

export function validateLeadFocus(input: string): ValidationResult<LeadFocusValue | undefined> {
  if (!input) return { ok: true, value: undefined };
  if (!ALLOWED_LEAD_FOCUS.includes(input as LeadFocusValue)) {
    return { ok: false, error: 'Invalid lead focus.' };
  }
  return { ok: true, value: input as LeadFocusValue };
}

export function validateSchedule(input: string): ValidationResult<ScheduleValue | undefined> {
  if (!input) return { ok: true, value: undefined };
  if (!ALLOWED_SCHEDULE.includes(input as ScheduleValue)) {
    return { ok: false, error: 'Invalid schedule frequency.' };
  }
  return { ok: true, value: input as ScheduleValue };
}

export function validateCountry(input: string | null): ValidationResult<string | null | undefined> {
  if (input === null) return { ok: true, value: undefined };
  const s = input.trim();
  if (s === '') return { ok: true, value: null };
  if (!/^[a-z]{2}$/i.test(s)) return { ok: false, error: 'Country must be a 2-letter ISO code.' };
  return { ok: true, value: s.toUpperCase() };
}

export function nullableStr(v: string | null): string | null | undefined {
  if (v === null) return undefined;
  const s = v.trim();
  return s === '' ? null : s;
}
