import { prisma } from '@crawlix/db';
import { logger } from '../lib/logger';

/**
 * Google Maps Platform terms (Service Specific Terms §3.2.3) require that
 * Place data sourced from Google must not be cached longer than 30 days,
 * with the sole exception of the opaque place_id (we store it as
 * `externalPlaceId`). This job runs periodically and clears Google-cached
 * fields on any Lead whose `lastSeenAt` is older than 30 days, while
 * preserving the dedupe key, status, notes, tags, and score so the user's
 * own work is not lost.
 *
 * Compliance reference:
 *   https://cloud.google.com/maps-platform/terms/maps-service-terms
 */
const STALE_DAYS_GOOGLE = 30;
/**
 * Yelp Fusion API ToU (§5.b) prohibits caching results longer than 24 hours
 * for most fields. We retain the dedupe key (externalPlaceId) and the
 * user's own metadata, but blank out content that originated from Yelp.
 *
 * Compliance reference:
 *   https://docs.developer.yelp.com/docs/fusion-api-terms-of-use
 */
const STALE_HOURS_YELP = 24;

const log = logger.child({ job: 'compliance.cacheCleanup' });

export async function googleCacheCleanup(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_DAYS_GOOGLE * 24 * 60 * 60 * 1000);
  try {
    const result = await prisma.lead.updateMany({
      where: {
        provider: 'google_places',
        lastSeenAt: { lt: cutoff },
        OR: [
          { phone: { not: null } },
          { address: { not: null } },
          { lat: { not: null } },
          { rating: { not: null } }
        ]
      },
      data: {
        phone: null,
        phoneNormalized: null,
        address: null,
        addressNormalized: null,
        city: null,
        state: null,
        country: null,
        postalCode: null,
        lat: null,
        lng: null,
        rating: null,
        reviewCount: null,
        businessStatus: 'UNKNOWN',
        rawPayload: {},
        normalizedPayload: {}
      }
    });
    if (result.count > 0) {
      log.info({ purged: result.count, cutoff, provider: 'google_places' }, 'purged stale Google cache');
    }
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err), provider: 'google_places' }, 'cleanup failed');
  }
}

export async function yelpCacheCleanup(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_HOURS_YELP * 60 * 60 * 1000);
  try {
    const result = await prisma.lead.updateMany({
      where: {
        provider: 'yelp',
        lastSeenAt: { lt: cutoff },
        OR: [
          { phone: { not: null } },
          { address: { not: null } },
          { rating: { not: null } },
          { reviewCount: { not: null } }
        ]
      },
      data: {
        phone: null,
        phoneNormalized: null,
        address: null,
        addressNormalized: null,
        city: null,
        state: null,
        country: null,
        postalCode: null,
        lat: null,
        lng: null,
        rating: null,
        reviewCount: null,
        businessStatus: 'UNKNOWN',
        rawPayload: {},
        normalizedPayload: {}
      }
    });
    if (result.count > 0) {
      log.info({ purged: result.count, cutoff, provider: 'yelp' }, 'purged stale Yelp cache');
    }
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err), provider: 'yelp' }, 'cleanup failed');
  }
}

export async function runComplianceCleanup(): Promise<void> {
  await googleCacheCleanup();
  await yelpCacheCleanup();
}

