'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import {
  providersService,
  ProviderConfigSchema
} from '@/server/services/providers.service';
import {
  outreachService,
  OutreachSettingsSchema,
  suppressionService
} from '@/server/services/outreach.service';

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

export async function acceptProviderTermsAction(
  formData: FormData
): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization.' };

  const provider = String(formData.get('provider') ?? '').trim();
  const consent = String(formData.get('consent') ?? '') === 'on';
  if (!provider) return { ok: false, error: 'Missing provider.' };
  if (!consent)
    return {
      ok: false,
      error: 'You must check the consent box to accept this provider\'s Terms.'
    };

  try {
    await providersService.acceptTerms(ctx.orgId, provider, ctx.userId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Accept failed' };
  }
  revalidatePath('/settings');
  revalidatePath('/searches');
  return { ok: true };
}

export async function saveOutreachSettingsAction(
  formData: FormData
): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization.' };

  const parsed = OutreachSettingsSchema.safeParse({
    senderName: String(formData.get('senderName') ?? '').trim() || undefined,
    senderCompany: String(formData.get('senderCompany') ?? '').trim() || undefined,
    senderEmail: String(formData.get('senderEmail') ?? '').trim() || undefined,
    replyToEmail: String(formData.get('replyToEmail') ?? '').trim() || undefined,
    mailingAddress: String(formData.get('mailingAddress') ?? '').trim() || undefined,
    unsubscribeUrl: String(formData.get('unsubscribeUrl') ?? '').trim() || undefined,
    citeProviderInBody: String(formData.get('citeProviderInBody') ?? '') === 'on'
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  try {
    await outreachService.upsert(ctx.orgId, parsed.data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Save failed' };
  }
  revalidatePath('/settings');
  return { ok: true };
}

export async function addSuppressionAction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization.' };

  const email = String(formData.get('email') ?? '').trim();
  if (!email || !email.includes('@')) return { ok: false, error: 'Enter a valid email.' };

  try {
    await suppressionService.add(ctx.orgId, email, 'MANUAL', 'settings_ui');
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Suppression add failed' };
  }
  revalidatePath('/settings');
  return { ok: true };
}

