import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { QueueName } from '@crawlix/shared';

let connection: IORedis | null = null;
const queues = new Map<string, Queue>();

function getConnection(): IORedis {
  if (connection) return connection;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL not set');
  connection = new IORedis(url, { maxRetriesPerRequest: null });
  return connection;
}

export function getQueue(name: string): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: getConnection() });
    queues.set(name, q);
  }
  return q;
}

export async function enqueue(
  queueName: (typeof QueueName)[keyof typeof QueueName],
  jobName: string,
  payload: Record<string, unknown>,
  opts?: JobsOptions
): Promise<string> {
  const job = await getQueue(queueName).add(jobName, payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86_400 },
    ...opts
  });
  return job.id ?? '';
}
