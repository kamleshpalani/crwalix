'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { searchesService } from '@/server/services/searches.service';

export type SearchOpResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function duplicateSearchAction(
  sourceId: string
): Promise<SearchOpResult & { newId?: string }> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization.' };
  try {
    const created = await searchesService.duplicate(ctx.orgId, ctx.userId, sourceId);
    revalidatePath('/searches');
    return { ok: true, message: `Duplicated as ${created.name}`, newId: created.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Duplicate failed.' };
  }
}

export async function rerunSearchAction(searchId: string): Promise<SearchOpResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization.' };
  try {
    const { run } = await searchesService.rerun(ctx.orgId, searchId);
    revalidatePath(`/searches/${searchId}`);
    revalidatePath('/searches');
    return { ok: true, message: `Queued new run ${run.id.slice(0, 8)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to re-run' };
  }
}

export async function rescoreSearchAction(searchId: string): Promise<SearchOpResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization.' };
  try {
    const count = await searchesService.rescoreLeads(ctx.orgId, searchId);
    revalidatePath(`/searches/${searchId}`);
    revalidatePath('/leads');
    return { ok: true, message: `Queued ${count} lead(s) for re-scoring` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to re-score' };
  }
}

export async function deleteSearchAction(formData: FormData): Promise<void> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx)) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  try {
    await searchesService.remove(ctx.orgId, id);
  } catch (e) {
    console.error('[deleteSearchAction] failed', e);
    return;
  }
  revalidatePath('/searches');
  revalidatePath('/dashboard');
  redirect('/searches');
}

export async function cancelRunAction(
  searchId: string,
  runId: string
): Promise<SearchOpResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization.' };
  try {
    const res = await searchesService.cancelRun(ctx.orgId, runId);
    revalidatePath(`/searches/${searchId}`);
    if (res.count === 0)
      return { ok: false, error: 'Run already finished or not cancelable' };
    return { ok: true, message: 'Run canceled' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Cancel failed' };
  }
}

const ALLOWED_FOCUS = new Set(['ALL', 'NO_WEBSITE', 'HIGH_OR_MED'] as const);
const ALLOWED_FREQ  = new Set(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const);

function nullableStr(v: FormDataEntryValue | null): string | null | undefined {
  if (v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function nullableInt(v: FormDataEntryValue | null, max: number): number | null | undefined {
  if (v === null) return undefined;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined;
  return Math.floor(n);
}

/**
 * Edit a search's query / limits / schedule. Fields that are missing from
 * the form are left untouched; empty strings clear nullable fields.
 */
export async function updateSearchAction(formData: FormData): Promise<SearchOpResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization.' };

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'Missing search id.' };

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Name is required.' };
  if (name.length > 120) return { ok: false, error: 'Name is too long.' };

  const resultLimitRaw = String(formData.get('resultLimit') ?? '').trim();
  const resultLimit = resultLimitRaw === '' ? undefined : Number(resultLimitRaw);
  if (resultLimit !== undefined) {
    if (!Number.isFinite(resultLimit) || resultLimit < 1 || resultLimit > 500) {
      return { ok: false, error: 'Result limit must be between 1 and 500.' };
    }
  }

  const radius = nullableInt(formData.get('radiusMeters'), 50_000);
  if (radius === undefined && formData.get('radiusMeters') !== null) {
    return { ok: false, error: 'Radius must be 0..50000 meters.' };
  }

  const focus = String(formData.get('leadFocus') ?? '');
  if (focus && !ALLOWED_FOCUS.has(focus as 'ALL')) {
    return { ok: false, error: 'Invalid lead focus.' };
  }
  const freq = String(formData.get('scheduleFrequency') ?? '');
  if (freq && !ALLOWED_FREQ.has(freq as 'NONE')) {
    return { ok: false, error: 'Invalid schedule frequency.' };
  }

  try {
    await searchesService.update(ctx.orgId, id, {
      name,
      keyword: nullableStr(formData.get('keyword')),
      niche: nullableStr(formData.get('niche')),
      city: nullableStr(formData.get('city')),
      state: nullableStr(formData.get('state')),
      country: nullableStr(formData.get('country')),
      postalCode: nullableStr(formData.get('postalCode')),
      radiusMeters: radius,
      resultLimit: resultLimit !== undefined ? Math.floor(resultLimit) : undefined,
      leadFocus: (focus || undefined) as 'ALL' | 'NO_WEBSITE' | 'HIGH_OR_MED' | undefined,
      scheduleFrequency: (freq || undefined) as 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | undefined
    }, ctx.userId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed.' };
  }

  revalidatePath(`/searches/${id}`);
  revalidatePath('/searches');
  return { ok: true, message: 'Search updated. Re-run to apply the new settings.' };
}
