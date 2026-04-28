'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { searchesService } from '@/server/services/searches.service';
import { providersService } from '@/server/services/providers.service';
import { CreateSearchSchema, LeadFocus, PriorityTier } from '@crawlix/shared';
import { READY_PROVIDER_IDS } from '@/lib/providers';
import { composeLocation, getCountryName, getStateName } from '@/lib/locations';

export type SearchActionResult =
  | { ok: true; created: Array<{ provider: string; searchId: string; runId: string }> }
  | { ok: false; error: string };

/** Map a set of selected priority tiers → existing LeadFocus filter. */
function priorityToLeadFocus(priorities: string[]): LeadFocus {
  const set = new Set(priorities);
  const hasHigh = set.has(PriorityTier.HIGH);
  const hasMed = set.has(PriorityTier.MEDIUM);
  const hasLow = set.has(PriorityTier.LOW);
  if (hasLow) return LeadFocus.ALL;
  if (hasHigh && hasMed) return LeadFocus.HIGH_OR_MED;
  if (hasHigh && !hasMed) return LeadFocus.NO_WEBSITE;
  return LeadFocus.HIGH_OR_MED;
}

export async function createSearchAction(formData: FormData): Promise<SearchActionResult> {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx))
    return { ok: false, error: 'No active organization. Create one from the header.' };

  const rawProviders = formData.getAll('providers').map(String);
  const providers = rawProviders.filter((p) => READY_PROVIDER_IDS.has(p));
  if (providers.length === 0) {
    return {
      ok: false,
      error: 'Select at least one available provider (Google Places, Yelp, or OpenStreetMap).'
    };
  }

  // Compliance gate: we cannot call a third-party provider's API on behalf
  // of an org until an admin has explicitly accepted that provider's ToS.
  const missingTerms = await providersService.missingTermsAcceptance(ctx.orgId, providers);
  if (missingTerms.length > 0) {
    return {
      ok: false,
      error:
        `Accept the Terms of Service for: ${missingTerms.join(', ')}. ` +
        `Open Settings → Search providers to accept.`
    };
  }

  const priorities = formData
    .getAll('priorities')
    .map(String)
    .filter((p) =>
      ([PriorityTier.HIGH, PriorityTier.MEDIUM, PriorityTier.LOW] as string[]).includes(p)
    );
  const leadFocus = priorityToLeadFocus(priorities);

  const projectId = String(formData.get('projectId') ?? '');
  const baseName = String(formData.get('name') ?? '').trim();
  const keyword = String(formData.get('keyword') ?? '').trim() || undefined;
  const niche = String(formData.get('niche') ?? '').trim() || undefined;
  const countryCode = String(formData.get('country') ?? '').trim().toUpperCase() || undefined;
  const stateCode = String(formData.get('state') ?? '').trim() || undefined;
  const county = String(formData.get('county') ?? '').trim() || undefined;
  const cityMajor = String(formData.get('cityMajor') ?? '').trim() || undefined;
  const customCity = String(formData.get('customCity') ?? '').trim() || undefined;
  const finalCity = customCity || cityMajor || undefined;
  const postalCode = String(formData.get('postalCode') ?? '').trim() || undefined;
  const resultLimit = Number(formData.get('resultLimit') ?? 20);
  const scheduleFrequencyRaw = String(formData.get('scheduleFrequency') ?? 'NONE');
  const scheduleFrequency = (
    ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'].includes(scheduleFrequencyRaw)
      ? scheduleFrequencyRaw
      : 'NONE'
  ) as 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

  // Convert ISO codes to readable names for downstream providers + storage.
  const stateName = stateCode && countryCode ? getStateName(countryCode, stateCode) ?? stateCode : undefined;
  const countryName = countryCode ? getCountryName(countryCode) ?? countryCode : undefined;

  const composedLocation = composeLocation({
    customCity,
    city: cityMajor,
    county,
    state: stateCode,
    country: countryCode
  });
  const finalKeyword = keyword
    ? composedLocation
      ? `${keyword} in ${composedLocation}`
      : keyword
    : undefined;

  const created: Array<{ provider: string; searchId: string; runId: string }> = [];
  for (const provider of providers) {
    const raw = {
      projectId,
      name: providers.length === 1 ? baseName : `${baseName} · ${provider}`,
      keyword: finalKeyword,
      niche,
      city: finalCity,
      state: stateName,
      country: countryCode,
      postalCode,
      resultLimit,
      provider: provider as 'google_places' | 'yelp_fusion' | 'osm' | 'foursquare',
      leadFocus,
      enrichOnInsert: false,
      scoreOnInsert: true,
      scheduleFrequency
    };
    const parsed = CreateSearchSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      };
    }
    try {
      const { search, run } = await searchesService.createAndDispatch(
        ctx.orgId,
        ctx.userId,
        parsed.data
      );
      created.push({ provider, searchId: search.id, runId: run.id });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Failed to enqueue search' };
    }
  }

  revalidatePath('/searches');
  revalidatePath('/dashboard');
  return { ok: true, created };
}
