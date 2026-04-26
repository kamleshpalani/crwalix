'use server';

import { revalidatePath } from 'next/cache';
import { LeadStatus } from '@crawlix/shared';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { leadsService } from '@/server/services/leads.service';

export type SetStatusResult = { ok: true } | { ok: false; error: string };

export async function setLeadStatusAction(
  leadId: string,
  status: keyof typeof LeadStatus
): Promise<SetStatusResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization.' };

  const next = LeadStatus[status];
  if (!next) return { ok: false, error: `Invalid status: ${status}` };

  try {
    await leadsService.setStatus(ctx.orgId, leadId, next);
    revalidatePath(`/leads/${leadId}`);
    revalidatePath('/leads');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function setLeadStatusBulkAction(
  ids: string[],
  status: keyof typeof LeadStatus
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization.' };

  const next = LeadStatus[status];
  if (!next) return { ok: false, error: `Invalid status: ${status}` };
  if (!Array.isArray(ids) || ids.length === 0)
    return { ok: false, error: 'No leads selected' };

  try {
    const count = await leadsService.setStatusBulk(ctx.orgId, ids, next);
    revalidatePath('/leads');
    return { ok: true, count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function setLeadNotesAction(
  leadId: string,
  notes: string
): Promise<SetStatusResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization.' };
  if (notes.length > 4000) return { ok: false, error: 'Notes too long (max 4000)' };
  try {
    await leadsService.setNotes(ctx.orgId, leadId, notes);
    revalidatePath(`/leads/${leadId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function addLeadTagAction(
  leadId: string,
  tag: string
): Promise<SetStatusResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization.' };
  const clean = tag.trim();
  if (!clean) return { ok: false, error: 'Empty tag' };
  if (clean.length > 32) return { ok: false, error: 'Tag too long (max 32)' };
  if (!/^[a-z0-9][a-z0-9 _-]*$/i.test(clean))
    return { ok: false, error: 'Letters, numbers, space, _ and - only' };
  try {
    await leadsService.addTag(ctx.orgId, leadId, clean);
    revalidatePath(`/leads/${leadId}`);
    revalidatePath('/leads');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function removeLeadTagAction(
  leadId: string,
  tag: string
): Promise<SetStatusResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization.' };
  try {
    await leadsService.removeTag(ctx.orgId, leadId, tag);
    revalidatePath(`/leads/${leadId}`);
    revalidatePath('/leads');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}
