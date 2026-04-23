import { Prisma } from '@prisma/client';
import { withOrg } from '@crawlix/db';
import {
  JobName,
  QueueName,
  WebsiteStatus,
  type NormalizedLead,
  type SearchIngestJob
} from '@crawlix/shared';
import { Queue } from 'bullmq';
import { getConnection } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { normalizedName } from './normalize.js';
import { resolveSearchProvider } from '../providers/index.js';

const scoringQueue = new Queue(QueueName.SCORING, { connection: getConnection() });

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
  const insertedLeadIds: string[] = [];

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
          const inserted = await upsertLead(tx, job.organizationId, r);
          if (inserted.created) {
            totalInserted++;
            insertedLeadIds.push(inserted.lead.id);
          } else {
            totalDuplicate++;
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
      await scoringQueue.addBulk(
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

    await withOrg(job.organizationId, (tx) =>
      tx.usageLog.create({
        data: {
          organizationId: job.organizationId,
          kind: 'search.run',
          units: 1,
          metadata: { provider: job.provider, fetched: totalFetched, inserted: totalInserted }
        }
      })
    );

    log.info({ totalFetched, totalInserted, totalDuplicate }, 'search ingest done');
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
    return { lead, created: false };
  }

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
      phoneNormalized: r.phone,
      website: r.website,
      websiteStatus: r.website ? WebsiteStatus.EXISTS : WebsiteStatus.UNKNOWN,
      sourceUrl: r.sourceUrl,
      address: r.address,
      addressNormalized: r.address?.toLowerCase(),
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
  return { lead, created: true };
}
