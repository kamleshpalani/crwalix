import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import url from 'node:url';

// Load .env.local from the worker workspace, then fall back to repo root.
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '../.env.local') });
loadEnv({ path: path.resolve(__dirname, '../../../.env.local') });

import { Worker, type Job } from 'bullmq';
import { JobName, QueueName, type EnrichmentJob, type IntelBuildJob, type ScoreLeadJob, type SearchIngestJob } from '@crawlix/shared';
import { getConnection } from './lib/redis';
import { logger } from './lib/logger';
import { runSearchIngest } from './pipelines/search-ingest';
import { runScoreLead } from './pipelines/score-lead';
import { runWebsiteEnrichment } from './pipelines/enrich-website';
import { runIntelBuild } from './pipelines/intel-build';
import { runComplianceCleanup } from './pipelines/compliance-cleanup';
import { startScheduler } from './pipelines/scheduler';

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

const enrichmentWorker = makeWorker<EnrichmentJob | IntelBuildJob>(
  QueueName.ENRICHMENT,
  async (name, data) => {
    if (name === JobName.ENRICH_WEBSITE) return runWebsiteEnrichment(data as EnrichmentJob);
    if (name === JobName.INTEL_BUILD) return runIntelBuild(data as IntelBuildJob);
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

// Provider ToS compliance: cached data must be purged on a schedule.
// Google: 30-day max retention. Yelp: 24-hour max retention.
// Runs on boot and every 1 hour thereafter (Yelp is the tightest window).
void runComplianceCleanup();
const complianceTimer = setInterval(
  () => void runComplianceCleanup(),
  60 * 60 * 1000
);
complianceTimer.unref();

// Recurring-search scheduler: enqueues `search.ingest` for every Search
// row whose `nextRunAt` has elapsed. Polls once per minute by default.
startScheduler();

logger.info('crawlix worker started');
