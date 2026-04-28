'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import {
  projectsService,
  CreateProjectSchema,
  UpdateProjectSchema
} from '@/server/services/projects.service';

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

export async function updateProjectAction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx)) return { ok: false, error: 'No active organization.' };

  const parsed = UpdateProjectSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    name: String(formData.get('name') ?? '').trim(),
    description: String(formData.get('description') ?? '').trim() || undefined
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  try {
    await projectsService.update(ctx.orgId, parsed.data, ctx.userId);
  } catch (e) {
    console.error('[updateProjectAction] failed', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed' };
  }
  revalidatePath('/projects');
  revalidatePath(`/projects/${parsed.data.id}`);
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function duplicateProjectAction(
  formData: FormData
): Promise<ActionResult & { newId?: string }> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx)) return { ok: false, error: 'No active organization.' };

  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { ok: false, error: 'Missing project id.' };

  try {
    const created = await projectsService.duplicate(ctx.orgId, ctx.userId, id);
    revalidatePath('/projects');
    revalidatePath('/dashboard');
    return { ok: true, newId: created.id };
  } catch (e) {
    console.error('[duplicateProjectAction] failed', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Duplicate failed' };
  }
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx)) return;

  const id = String(formData.get('id') ?? '');
  if (!id) return;

  try {
    await projectsService.remove(ctx.orgId, id);
  } catch (e) {
    console.error('[deleteProjectAction] failed', e);
    return;
  }
  revalidatePath('/projects');
  revalidatePath('/dashboard');
  redirect('/projects');
}
