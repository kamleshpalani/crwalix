'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { projectsService, CreateProjectSchema } from '@/server/services/projects.service';

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createProjectAction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx)) return { ok: false, error: 'No active organization. Create one from the header.' };

  const parsed = CreateProjectSchema.safeParse({
    name: String(formData.get('name') ?? '').trim(),
    description: String(formData.get('description') ?? '').trim() || undefined
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  try {
    await projectsService.create(ctx.orgId, ctx.userId, parsed.data);
  } catch (e) {
    console.error('[createProjectAction] failed', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Create failed' };
  }
  revalidatePath('/projects');
  revalidatePath('/dashboard');
  return { ok: true };
}
