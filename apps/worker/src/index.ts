import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import url from 'node:url';

// Load .env.local from the worker workspace, then fall back to repo root.
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '../.env.local') });
loadEnv({ path: path.resolve(__dirname, '../../../.env.local') });

import { Worker, type Job } from 'bullmq';
import { JobName, QueueName, type EnrichmentJob, type ScoreLeadJob, type SearchIngestJob } from '@crawlix/shared';
import { getConnection } from './lib/redis';
import { logger } from './lib/logger';
import { runSearchIngest } from './pipelines/search-ingest';
import { runScoreLead } from './pipelines/score-lead';
import { runWebsiteEnrichment } from './pipelines/enrich-website';
import { googleCacheCleanup } from './pipelines/compliance-cleanup';

const connection = getConnection();

function makeWorker<T>(
  queue: string,
  handler: (name: string, data: T) => Promise<void>,
  concurrency: number
): Worker {
  const w = new Worker<T>(
    queue,
    async (job: Job<T>) => {
      logger.info({ queue, name: job.name, id: job.id }, 'job start');
      await handler(job.name, job.data);
      logger.info({ queue, name: job.name, id: job.id }, 'job done');
    },
    { connection, concurrency }
  );
  w.on('failed', (job, err) => logger.error({ queue, jobId: job?.id, err: err.message }, 'job failed'));
  return w;
}

const searchWorker = makeWorker<SearchIngestJob>(
  QueueName.SEARCH,
  async (name, data) => {
    if (name === JobName.SEARCH_INGEST) return runSearchIngest(data);
    logger.warn({ name }, 'unknown search job');
  },
  4
);

const scoringWorker = makeWorker<ScoreLeadJob>(
  QueueName.SCORING,
  async (name, data) => {
    if (name === JobName.SCORE_LEAD) return runScoreLead(data);
    logger.warn({ name }, 'unknown scoring job');
  },
  8
);

const enrichmentWorker = makeWorker<EnrichmentJob>(
  QueueName.ENRICHMENT,
  async (name, data) => {
    if (name === JobName.ENRICH_WEBSITE) return runWebsiteEnrichment(data);
    logger.warn({ name }, 'unknown enrichment job');
  },
  4
);

async function shutdown(sig: string): Promise<void> {
  logger.info({ sig }, 'shutting down');
  await Promise.all([searchWorker.close(), scoringWorker.close(), enrichmentWorker.close()]);
  await connection.quit();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// Google Maps Platform ToS: cached Place data must not be retained longer
// than 30 days. Run cleanup on boot and every 6 hours thereafter.
void googleCacheCleanup();
const complianceTimer = setInterval(
  () => void googleCacheCleanup(),
  6 * 60 * 60 * 1000
);
complianceTimer.unref();

logger.info('crawlix worker started');
