import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { jobRoutes } from './routes/jobs.js';
import { healthRoutes } from './routes/health.js';
import { shutdownBrowser } from './engine/browser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildServer(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger });

  await app.register(cors, { origin: true });

  // Serve the dashboard from /public
  await app.register(fastifyStatic, {
    root: path.resolve(__dirname, '../public'),
    prefix: '/',
    decorateReply: false,
  });

  await app.register(async (api) => {
    await healthRoutes(api);
    await jobRoutes(api);
  }, { prefix: '/api' });

  return app;
}

async function main(): Promise<void> {
  const app = await buildServer();
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    logger.info(`Crawlix listening on http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    await app.close();
    await shutdownBrowser();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// Run only when this file is the entrypoint.
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  void main();
}
