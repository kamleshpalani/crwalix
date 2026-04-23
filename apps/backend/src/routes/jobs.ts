import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { jobStore } from '../store.js';
import { enqueueJob, cancelJob } from '../engine/runner.js';
import { getAdapter, listAdapters } from '../adapters/registry.js';

const CreateJobBody = z.object({
  adapter: z.string(),
  input: z.unknown(),
});

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.get('/adapters', async () => ({ adapters: listAdapters() }));

  app.post('/jobs', async (req, reply) => {
    const parsed = CreateJobBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', issues: parsed.error.issues });
    }

    const adapter = getAdapter(parsed.data.adapter);
    if (!adapter) {
      return reply.code(404).send({ error: `Unknown adapter: ${parsed.data.adapter}` });
    }

    const inputParsed = adapter.inputSchema.safeParse(parsed.data.input);
    if (!inputParsed.success) {
      return reply.code(400).send({ error: 'Invalid input', issues: inputParsed.error.issues });
    }

    const job = jobStore.create({
      adapter: adapter.name,
      input: inputParsed.data,
    });
    enqueueJob(job);
    return reply.code(202).send(job);
  });

  app.get('/jobs', async (req) => {
    const { status, limit } = req.query as { status?: string; limit?: string };
    return {
      jobs: jobStore.list({
        status: status as never,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  });

  app.get('/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = jobStore.get(id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    return job;
  });

  app.post('/jobs/:id/cancel', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = cancelJob(id);
    if (!ok) return reply.code(404).send({ error: 'Job not found or not running' });
    return { ok: true };
  });
}
