'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import {
  providersService,
  ProviderConfigSchema
} from '@/server/services/providers.service';

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveProviderConfigAction(
  formData: FormData
): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization.' };

  const parsed = ProviderConfigSchema.safeParse({
    provider: String(formData.get('provider') ?? ''),
    enabled: String(formData.get('enabled') ?? '') === 'on',
    dailyBudget: formData.get('dailyBudget')
      ? Number(formData.get('dailyBudget'))
      : undefined
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  try {
    await providersService.upsert(ctx.orgId, parsed.data);
  } catch (e) {
    console.error('[saveProviderConfigAction] failed', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Save failed' };
  }
  revalidatePath('/settings');
  return { ok: true };
}
