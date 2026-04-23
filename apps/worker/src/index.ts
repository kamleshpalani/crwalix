import { Worker, type Job } from 'bullmq';
import { JobName, QueueName, type ScoreLeadJob, type SearchIngestJob } from '@crawlix/shared';
import { getConnection } from './lib/redis.js';
import { logger } from './lib/logger.js';
import { runSearchIngest } from './pipelines/search-ingest.js';
import { runScoreLead } from './pipelines/score-lead.js';

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

async function shutdown(sig: string): Promise<void> {
  logger.info({ sig }, 'shutting down');
  await Promise.all([searchWorker.close(), scoringWorker.close()]);
  await connection.quit();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

logger.info('crawlix worker started');
