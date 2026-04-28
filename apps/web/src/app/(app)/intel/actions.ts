'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { intelService, CreateIntelReportSchema } from '@/server/services/intel.service';

export type IntelActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

function parseUrlList(raw: string): string[] {
  return raw
    .split(/[\s,;]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function createIntelReportAction(formData: FormData): Promise<IntelActionResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx)) return { ok: false, error: 'No active organization.' };

  const competitorRaw = String(formData.get('competitorUrls') ?? '');
  const parsed = CreateIntelReportSchema.safeParse({
    title: String(formData.get('title') ?? '').trim(),
    primaryUrl: String(formData.get('primaryUrl') ?? '').trim(),
    category: String(formData.get('category') ?? '').trim() || undefined,
    city: String(formData.get('city') ?? '').trim() || undefined,
    country: String(formData.get('country') ?? '').trim() || undefined,
    competitorUrls: parseUrlList(competitorRaw),
    autoDetectCompetitors: formData.get('autoDetectCompetitors') === 'on',
    maxCompetitors: Number(formData.get('maxCompetitors') ?? 5)
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  try {
    const id = await intelService.create(ctx.orgId, ctx.userId, parsed.data);
    revalidatePath('/intel');
    return { ok: true, id };
  } catch (e) {
    console.error('[createIntelReportAction] failed', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Create failed' };
  }
}

export async function rebuildIntelReportAction(formData: FormData): Promise<IntelActionResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx)) return { ok: false, error: 'No active organization.' };
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { ok: false, error: 'Missing report id' };
  try {
    await intelService.dispatch(ctx.orgId, id, {
      autoDetectCompetitors: formData.get('autoDetectCompetitors') === 'on',
      maxCompetitors: Math.max(0, Math.min(8, Number(formData.get('maxCompetitors') ?? 5)))
    });
    revalidatePath('/intel');
    revalidatePath(`/intel/${id}`);
    return { ok: true, id };
  } catch (e) {
    console.error('[rebuildIntelReportAction] failed', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Re-run failed' };
  }
}

export async function deleteIntelReportAction(formData: FormData): Promise<IntelActionResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx)) return { ok: false, error: 'No active organization.' };
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { ok: false, error: 'Missing report id' };
  try {
    await intelService.delete(ctx.orgId, id);
    revalidatePath('/intel');
    return { ok: true };
  } catch (e) {
    console.error('[deleteIntelReportAction] failed', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Delete failed' };
  }
}
