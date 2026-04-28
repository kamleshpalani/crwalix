'use server';

import { revalidatePath } from 'next/cache';
import { withOrg } from '@crawlix/db';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { validateWebhookUrl, validateNotificationEmail } from '@/lib/notification-prefs';

export type NotifyPrefsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Update org-wide notification delivery channels (webhook URL, digest email).
 * Both fields are optional. Empty strings clear the value.
 */
export async function updateNotificationPrefsAction(formData: FormData): Promise<NotifyPrefsResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx)) return { ok: false, error: 'No active organization.' };

  const webhook = String(formData.get('webhookUrl') ?? '').trim();
  const email   = String(formData.get('email') ?? '').trim();

  const wv = validateWebhookUrl(webhook);
  if (!wv.ok) return wv;
  const ev = validateNotificationEmail(email);
  if (!ev.ok) return ev;

  await withOrg(ctx.orgId, (tx) =>
    tx.organization.update({
      where: { id: ctx.orgId },
      data: {
        notificationWebhookUrl: webhook || null,
        notificationEmail: email || null
      }
    })
  );

  revalidatePath('/settings');
  return { ok: true };
}
