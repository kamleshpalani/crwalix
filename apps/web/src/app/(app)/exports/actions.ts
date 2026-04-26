'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { exportsService, CreateExportSchema } from '@/server/services/exports.service';

export type ExportActionResult =
  | { ok: true; exportId: string }
  | { ok: false; error: string };

export async function createExportAction(formData: FormData): Promise<ExportActionResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization. Create one from the header.' };

  const kind = String(formData.get('sourceKind') ?? 'filter');
  const format = String(formData.get('format') ?? 'CSV') as 'CSV' | 'XLSX' | 'GOOGLE_SHEETS';

  let source: unknown;
  if (kind === 'project') {
    source = { kind: 'project', projectId: String(formData.get('projectId') ?? '') };
  } else if (kind === 'search') {
    source = { kind: 'search', searchId: String(formData.get('searchId') ?? '') };
  } else if (kind === 'list') {
    source = { kind: 'list', listId: String(formData.get('listId') ?? '') };
  } else {
    const minScore = String(formData.get('minScore') ?? '').trim();
    const tier = String(formData.get('priorityTier') ?? '').trim();
    source = {
      kind: 'filter',
      filter: {
        page: 1,
        pageSize: 200,
        sort: '-score',
        ...(minScore && { minScore: Number(minScore) }),
        ...(tier && { priorityTier: tier })
      }
    };
  }

  const parsed = CreateExportSchema.safeParse({ format, source, options: {} });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }

  try {
    const { exportJob } = await exportsService.createAndDispatch(ctx.orgId, ctx.userId, parsed.data);
    revalidatePath('/exports');
    return { ok: true, exportId: exportJob.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to create export' };
  }
}
