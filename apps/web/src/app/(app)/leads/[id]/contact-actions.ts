'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { leadsService } from '@/server/services/leads.service';

export type LeadEditResult = { ok: true } | { ok: false; error: string };

function nullableStr(v: FormDataEntryValue | null): string | null | undefined {
  if (v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function validUrl(v: string | null | undefined, label: string): string | null | LeadEditResult {
  if (v === null || v === undefined) return v ?? null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: `${label} must be http(s).` };
    }
    return v;
  } catch {
    return { ok: false, error: `${label} is not a valid URL.` };
  }
}

/**
 * Update editable contact fields on a lead. Tracked fields: ownerName,
 * phone, email, website, facebookUrl, instagramUrl, googleProfileUrl,
 * address, postalCode.
 */
export async function updateLeadContactAction(formData: FormData): Promise<LeadEditResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization.' };

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'Missing lead id.' };

  const email = nullableStr(formData.get('email'));
  if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
    return { ok: false, error: 'Invalid email address.' };
  }

  const urlChecks: Array<[string, string | null | undefined]> = [
    ['Website', nullableStr(formData.get('website'))],
    ['Facebook URL', nullableStr(formData.get('facebookUrl'))],
    ['Instagram URL', nullableStr(formData.get('instagramUrl'))],
    ['Google profile URL', nullableStr(formData.get('googleProfileUrl'))]
  ];
  for (const [label, val] of urlChecks) {
    const r = validUrl(val, label);
    if (typeof r === 'object' && r && 'ok' in r && r.ok === false) return r;
  }

  try {
    await leadsService.patchContact(ctx.orgId, id, {
      ownerName: nullableStr(formData.get('ownerName')),
      phone: nullableStr(formData.get('phone')),
      email,
      website: nullableStr(formData.get('website')),
      facebookUrl: nullableStr(formData.get('facebookUrl')),
      instagramUrl: nullableStr(formData.get('instagramUrl')),
      googleProfileUrl: nullableStr(formData.get('googleProfileUrl')),
      address: nullableStr(formData.get('address')),
      postalCode: nullableStr(formData.get('postalCode'))
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed.' };
  }

  revalidatePath(`/leads/${id}`);
  revalidatePath('/leads');
  return { ok: true };
}
