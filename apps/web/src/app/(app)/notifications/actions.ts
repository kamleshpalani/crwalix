'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { notificationsService } from '@/server/services/notifications.service';

export async function markAllNotificationsReadAction(): Promise<void> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx)) return;
  await notificationsService.markAllRead(ctx.orgId);
  revalidatePath('/notifications');
  revalidatePath('/dashboard');
}
