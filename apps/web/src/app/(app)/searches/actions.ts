'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { searchesService } from '@/server/services/searches.service';
import { CreateSearchSchema } from '@crawlix/shared';

export type SearchActionResult =
  | { ok: true; searchId: string; runId: string }
  | { ok: false; error: string };

export async function createSearchAction(formData: FormData): Promise<SearchActionResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx)) return { ok: false, error: 'No active organization. Create one from the header.' };

  const raw = {
    projectId: String(formData.get('projectId') ?? ''),
    name: String(formData.get('name') ?? '').trim(),
    keyword: String(formData.get('keyword') ?? '').trim() || undefined,
    niche: String(formData.get('niche') ?? '').trim() || undefined,
    city: String(formData.get('city') ?? '').trim() || undefined,
    country: String(formData.get('country') ?? '').trim().toUpperCase() || undefined,
    resultLimit: Number(formData.get('resultLimit') ?? 20),
    provider: String(formData.get('provider') ?? 'google_places') as
      | 'google_places'
      | 'foursquare'
      | 'yelp_fusion'
      | 'osm',
    leadFocus: (String(formData.get('leadFocus') ?? 'ALL') || 'ALL') as
      | 'ALL'
      | 'NO_WEBSITE'
      | 'HIGH_OR_MED',
    enrichOnInsert: false,
    scoreOnInsert: true
  };

  const parsed = CreateSearchSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }

  try {
    const { search, run } = await searchesService.createAndDispatch(ctx.orgId, ctx.userId, parsed.data);
    revalidatePath('/searches');
    revalidatePath('/dashboard');
    return { ok: true, searchId: search.id, runId: run.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to enqueue search' };
  }
}
