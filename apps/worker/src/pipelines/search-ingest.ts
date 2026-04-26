import { Prisma } from '@prisma/client';
import { withOrg } from '@crawlix/db';
import {
  EnrichmentKind,
  EnrichmentStatus,
  JobName,
  LeadFocus,
  QueueName,
  WebsiteStatus,
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
    do {
      if (safety++ > 20) break;
      const page = await provider.search(job.query, ctx, cursor);
      totalFetched += page.leads.length;

      await withOrg(job.organizationId, async (tx) => {
        for (const r of page.leads) {
          if (shouldFilter(r)) {
            totalFiltered++;
            continue;
          }
          const inserted = await upsertLead(tx, job.organizationId, r);
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
      if (totalFetched >= job.query.limit) break;
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
          totalDuplicate
        }
      })
    );

    // Auto-trigger website audits when the search is in HIGH_OR_MED mode so
    // that leads with live websites get categorized as FRESH/OUTDATED and
    // re-scored into the right priority tier.
    if (leadFocus === LeadFocus.HIGH_OR_MED && insertedLeadIds.length > 0) {
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
            filtered: totalFiltered,
            leadFocus
          }
        }
      })
    );

    log.info(
      { totalFetched, totalInserted, totalDuplicate, totalFiltered, leadFocus },
      'search ingest done'
    );
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
    const lead = await tx.lead.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        rating: r.rating ?? existing.rating,
        reviewCount: r.reviewCount ?? existing.reviewCount,
        website: r.website ?? existing.website,
        businessStatus: r.businessStatus
      }
    });
    return { lead, created: false, merged: false };
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
      return { lead: merged, created: false, merged: true };
    }
  }

  // 3. Brand-new lead → insert.
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
      rawPayload: (r.raw ?? {}) as Prisma.InputJsonValue,
      normalizedPayload: r as unknown as Prisma.InputJsonValue
    }
  });
  return { lead, created: true, merged: false };
}
