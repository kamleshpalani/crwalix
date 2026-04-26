'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { searchesService } from '@/server/services/searches.service';

export type SearchOpResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

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
