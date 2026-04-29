import { Prisma } from '@prisma/client';
import { withOrg } from '@crawlix/db';
import {
  EnrichmentKind,
  EnrichmentStatus,
  JobName,
  LeadFocus,
  QueueName,
  WebsiteStatus,
  classifyBusinessScale,
  type NormalizedLead,
  type SearchIngestJob
} from '@crawlix/shared';
import { Queue } from 'bullmq';
import { getConnection } from '../lib/redis';
import { logger } from '../lib/logger';
import { normalizedName } from './normalize';
import { resolveSearchProvider } from '../providers/index';
import {
  buildMergeData,
  digitsOnly,
  findDuplicateLead,
  normalizeAddress
} from './dedupe';
import { notify } from '../lib/notify';

let _scoringQueue: Queue | null = null;
function scoringQueue(): Queue {
  if (!_scoringQueue) {
    _scoringQueue = new Queue(QueueName.SCORING, { connection: getConnection() });
  }
  return _scoringQueue;
}

let _enrichmentQueue: Queue | null = null;
function enrichmentQueue(): Queue {
  if (!_enrichmentQueue) {
    _enrichmentQueue = new Queue(QueueName.ENRICHMENT, { connection: getConnection() });
  }
  return _enrichmentQueue;
}

export async function runSearchIngest(job: SearchIngestJob): Promise<void> {
  const log = logger.child({ job: 'search.ingest', runId: job.searchRunId });
  log.info({ provider: job.provider }, 'search ingest start');

  await withOrg(job.organizationId, (tx) =>
    tx.searchRun.update({
      where: { id: job.searchRunId },
      data: { status: 'RUNNING', startedAt: new Date() }
    })
  );

  let totalFetched = 0;
  let totalInserted = 0;
  let totalDuplicate = 0;
  let totalFiltered = 0;
  let totalSkipped = 0;
  const insertedLeadIds: string[] = [];
  const leadFocus = job.options.leadFocus ?? LeadFocus.ALL;

  /**
   * Returns true if the worker should drop this lead before persisting.
   *  - NO_WEBSITE  → drop anything with a website (highest precision).
   *  - HIGH_OR_MED → keep everything; the website-audit enrichment will
   *                  later categorize live sites and the scoring engine
   *                  will tier them (FRESH = low priority, OUTDATED = med).
   *  - ALL         → keep everything (no filter).
   */
  const shouldFilter = (r: NormalizedLead): boolean => {
    if (leadFocus === LeadFocus.NO_WEBSITE) return Boolean(r.website);
    return false;
  };

  try {
    const provider = resolveSearchProvider(job.provider);
    const ctrl = new AbortController();
    const ctx = {
      logger: {
        info: (...a: unknown[]) => log.info(a),
        warn: (...a: unknown[]) => log.warn(a),
        error: (...a: unknown[]) => log.error(a)
      },
      signal: ctrl.signal,
      credentials: {
        GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY ?? '',
        FOURSQUARE_API_KEY: process.env.FOURSQUARE_API_KEY ?? '',
        YELP_FUSION_API_KEY: process.env.YELP_FUSION_API_KEY ?? ''
      },
      meter: async () => {}
    };

    let cursor: string | undefined;
    let safety = 0;
    let warning: string | undefined;

    // Rotate ranking per run so back-to-back re-runs surface different
    // leads instead of the same top-N. Derived deterministically from
    // `searchRunId` so retries of the same run are stable.
    const RANKS = ['relevance', 'distance', 'rating', 'review_count'] as const;
    let seedHash = 0;
    for (const ch of job.searchRunId) seedHash = (seedHash * 31 + ch.charCodeAt(0)) | 0;
    const rotatedQuery = {
      ...job.query,
      rankPreference: RANKS[Math.abs(seedHash) % RANKS.length]
    };

    // Keep paging until we accumulate `limit` *new* (inserted) leads, the
    // provider runs out of pages, or we hit a hard safety cap. The previous
    // logic stopped at `totalFetched >= limit`, which meant a re-run that
    // hit mostly-known leads (e.g. 47/50 already in DB) would never advance
    // past the first page even though Yelp can return up to 240 results.
    const fetchCap = Math.max(job.query.limit * 6, job.query.limit + 200);

    do {
      if (safety++ > 20) break;
      const page = await provider.search(rotatedQuery, ctx, cursor);
      totalFetched += page.leads.length;
      if (page.warning && !warning) warning = page.warning;

      await withOrg(job.organizationId, async (tx) => {
        for (const r of page.leads) {
          if (shouldFilter(r)) {
            totalFiltered++;
            continue;
          }
          const inserted = await upsertLead(tx, job.organizationId, r);
          if (inserted.skipped) {
            // Re-run hit on a lead we already have from the same provider.
            // Don't update, don't re-link, don't re-enrich — just count it.
            totalSkipped++;
            continue;
          }
          if (inserted.created) {
            totalInserted++;
            insertedLeadIds.push(inserted.lead.id);
          } else {
            totalDuplicate++;
            if (inserted.merged) {
              // Cross-provider merge: rescore so the lead picks up any new
              // signals (additional categories, better phone/website, etc.).
              insertedLeadIds.push(inserted.lead.id);
            }
          }
          await tx.leadSource.create({
            data: {
              leadId: inserted.lead.id,
              searchRunId: job.searchRunId,
              provider: job.provider,
              rawPayload: (r.raw ?? {}) as Prisma.InputJsonValue
            }
          });
        }

        await tx.searchRun.update({
          where: { id: job.searchRunId },
          data: { totalFetched, totalInserted, totalDuplicate }
        });
      });

      cursor = page.nextCursor;
      // Stop conditions:
      //   1. We've inserted enough new leads to satisfy the user's limit.
      //   2. Provider has no more pages.
      //   3. Safety cap to avoid runaway scans on dead-end queries.
      if (totalInserted >= job.query.limit) break;
      if (totalFetched >= fetchCap) break;
    } while (cursor);

    if (job.options.scoreOnInsert && insertedLeadIds.length > 0) {
      await scoringQueue().addBulk(
        insertedLeadIds.map((leadId) => ({
          name: JobName.SCORE_LEAD,
          data: { organizationId: job.organizationId, leadId, rulesetVersion: 'v1.0.0' }
        }))
      );
    }

    await withOrg(job.organizationId, (tx) =>
      tx.searchRun.update({
        where: { id: job.searchRunId },
        data: {
          status: 'COMPLETED',
          finishedAt: new Date(),
          totalFetched,
          totalInserted,
          totalDuplicate,
          metadata: { totalSkipped, totalFiltered, leadFocus, warning, rankPreference: rotatedQuery.rankPreference }
        }
      })
    );

    // Auto-trigger website audits for every inserted lead with a website,
    // regardless of leadFocus. Every site goes through the full quality
    // review (design, mobile, performance, SEO, contact, security, business)
    // and gets an outreach-suitability verdict.
    if (insertedLeadIds.length > 0) {
      const leadsWithWebsites = await withOrg(job.organizationId, (tx) =>
        tx.lead.findMany({
          where: { id: { in: insertedLeadIds }, website: { not: null } },
          select: { id: true }
        })
      );
      if (leadsWithWebsites.length > 0) {
        const enrichments = await withOrg(job.organizationId, async (tx) => {
          const created = await Promise.all(
            leadsWithWebsites.map((l) =>
              tx.enrichment.create({
                data: {
                  organizationId: job.organizationId,
                  leadId: l.id,
                  kind: EnrichmentKind.WEBSITE_VALIDATION,
                  provider: 'crawlix-auditor',
                  status: EnrichmentStatus.QUEUED
                }
              })
            )
          );
          return created;
        });
        await enrichmentQueue().addBulk(
          enrichments.map((e) => ({
            name: JobName.ENRICH_WEBSITE,
            data: {
              organizationId: job.organizationId,
              enrichmentId: e.id,
              leadId: e.leadId,
              kind: EnrichmentKind.WEBSITE_VALIDATION,
              provider: 'crawlix-auditor'
            }
          }))
        );
        log.info({ count: enrichments.length }, 'queued website audits');
      }
    }

    await withOrg(job.organizationId, (tx) =>
      tx.usageLog.create({
        data: {
          organizationId: job.organizationId,
          kind: 'search.run',
          units: 1,
          metadata: {
            provider: job.provider,
            fetched: totalFetched,
            inserted: totalInserted,
            duplicate: totalDuplicate,
            skipped: totalSkipped,
            filtered: totalFiltered,
            leadFocus,
            warning
          }
        }
      })
    );

    log.info(
      { totalFetched, totalInserted, totalDuplicate, totalSkipped, totalFiltered, leadFocus, warning },
      'search ingest done'
    );

    // LEADS_DISCOVERED notification — only fired for runs the scheduler
    // initiated, so the user isn't pinged for the manual searches they just
    // submitted from the UI.
    if (job.options.notifyOnNewLeads && totalInserted > 0) {
      await notify({
        organizationId: job.organizationId,
        kind: 'LEADS_DISCOVERED',
        title: `${totalInserted} new lead${totalInserted === 1 ? '' : 's'} discovered`,
        body: `${job.provider} surfaced ${totalInserted} newly listed business${totalInserted === 1 ? '' : 'es'} for your scheduled search.`,
        href: `/leads?discoveredWithin=24h`,
        data: {
          provider: job.provider,
          searchRunId: job.searchRunId,
          inserted: totalInserted,
          fetched: totalFetched,
          leadIds: insertedLeadIds.slice(0, 25)
        }
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, 'search ingest failed');
    await withOrg(job.organizationId, (tx) =>
      tx.searchRun.update({
        where: { id: job.searchRunId },
        data: { status: 'FAILED', finishedAt: new Date(), error: message }
      })
    );
    throw err;
  }
}

async function upsertLead(
  tx: Prisma.TransactionClient,
  organizationId: string,
  r: NormalizedLead
) {
  // 1. Exact same provider + externalPlaceId → straight update.
  const existing = await tx.lead.findUnique({
    where: {
      organizationId_provider_externalPlaceId: {
        organizationId,
        provider: r.provider,
        externalPlaceId: r.externalPlaceId
      }
    }
  });

  if (existing) {
    // Already in DB from the same provider — skip on re-run so we don't
    // re-link to the new SearchRun, re-trigger enrichments, or churn writes.
    // Caller increments `totalSkipped` and moves on.
    return { lead: existing, created: false, merged: false, skipped: true };
  }

  // 2. Cross-provider deduplication: same business from a different
  //    provider already lives in the org's leads → merge into it.
  const match = await findDuplicateLead(tx, organizationId, r);
  if (match) {
    const target = await tx.lead.findUnique({ where: { id: match.leadId } });
    if (target) {
      const merged = await tx.lead.update({
        where: { id: target.id },
        data: buildMergeData(target, r)
      });
      // Audit trail (Section 7.4: maintain merge history).
      await tx.leadMergeHistory.create({
        data: {
          organizationId,
          canonicalLeadId: target.id,
          reason: match.reason,
          confidence: match.confidence,
          fromProvider: r.provider,
          fromExternalId: r.externalPlaceId,
          payload: r as unknown as Prisma.InputJsonValue,
        },
      });
      return { lead: merged, created: false, merged: true, skipped: false };
    }
  }

  // 3. Brand-new lead → insert.
  const classification = classifyBusinessScale({
    name: r.name,
    categoryPrimary: r.categoryPrimary,
    categories: r.categories,
    reviewCount: r.reviewCount,
    rating: r.rating,
    hasWebsite: Boolean(r.website),
  });
  const lead = await tx.lead.create({
    data: {
      organizationId,
      provider: r.provider,
      externalPlaceId: r.externalPlaceId,
      name: r.name,
      nameNormalized: normalizedName(r.name),
      categoryPrimary: r.categoryPrimary,
      categories: r.categories,
      phone: r.phone,
      phoneNormalized: digitsOnly(r.phone) || null,
      email: r.email ?? null,
      emailNormalized: r.email ? r.email.toLowerCase().trim() : null,
      googlePlaceId: r.provider === 'google_places' ? r.externalPlaceId : null,
      yelpBusinessId: r.provider === 'yelp_fusion' ? r.externalPlaceId : null,
      website: r.website,
      websiteStatus: r.website ? WebsiteStatus.EXISTS : WebsiteStatus.UNKNOWN,
      sourceUrl: r.sourceUrl,
      address: r.address,
      addressNormalized: normalizeAddress(r.address),
      city: r.city,
      state: r.state,
      country: r.country,
      postalCode: r.postalCode,
      lat: r.lat,
      lng: r.lng,
      businessStatus: r.businessStatus,
      rating: r.rating,
      reviewCount: r.reviewCount,
      businessScale: classification.scale,
      businessScaleConfidence: classification.confidence,
      businessScaleSignals: classification as unknown as Prisma.InputJsonValue,
      googleProfileUrl:
        r.provider === 'google_places' && r.externalPlaceId
          ? `https://www.google.com/maps/place/?q=place_id:${r.externalPlaceId}`
          : null,
      rawPayload: (r.raw ?? {}) as Prisma.InputJsonValue,
      normalizedPayload: r as unknown as Prisma.InputJsonValue
    }
  });
  return { lead, created: true, merged: false, skipped: false };
}
