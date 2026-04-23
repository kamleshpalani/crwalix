import PQueue from 'p-queue';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getAdapter } from '../adapters/registry.js';
import { acquirePage } from './browser.js';
import { jobStore } from '@crawlix/database';
import type { JobRecord } from '../types.js';

const queue = new PQueue({ concurrency: config.BROWSER_CONCURRENCY });
const controllers = new Map<string, AbortController>();

export function enqueueJob(job: JobRecord): void {
  const controller = new AbortController();
  controllers.set(job.id, controller);

  void queue.add(() => runJob(job, controller.signal)).catch((err) => {
    logger.error({ err, jobId: job.id }, 'Job queue error');
  });
}

export function cancelJob(id: string): boolean {
  const c = controllers.get(id);
  if (!c) return false;
  c.abort();
  return true;
}

async function runJob(job: JobRecord, signal: AbortSignal): Promise<void> {
  const adapter = getAdapter(job.adapter);
  if (!adapter) {
    jobStore.update(job.id, {
      status: 'failed',
      error: `Unknown adapter: ${job.adapter}`,
      finishedAt: new Date().toISOString(),
    });
    return;
  }

  jobStore.update(job.id, { status: 'running', startedAt: new Date().toISOString() });
  logger.info({ jobId: job.id, adapter: adapter.name }, 'Job started');

  const acquired = await acquirePage();
  try {
    if (signal.aborted) throw new Error('Canceled');

    const result = await adapter.run(job.input as never, {
      page: acquired.page,
      logger: logger.child({ jobId: job.id, adapter: adapter.name }),
      signal,
      onProgress: (p) => jobStore.update(job.id, p),
    });

    jobStore.update(job.id, {
      status: 'completed',
      result,
      finishedAt: new Date().toISOString(),
      progress: 1,
    });
    logger.info({ jobId: job.id }, 'Job completed');
  } catch (err) {
    const canceled = signal.aborted;
    const message = err instanceof Error ? err.message : String(err);
    jobStore.update(job.id, {
      status: canceled ? 'canceled' : 'failed',
      error: message,
      finishedAt: new Date().toISOString(),
    });
    logger.warn({ jobId: job.id, err: message }, 'Job ended with error');
  } finally {
    controllers.delete(job.id);
    await acquired.release();
  }
}
