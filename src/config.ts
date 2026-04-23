import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  HEADLESS: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  BROWSER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  NAV_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  DEFAULT_LOCALE: z.string().default('en-US'),
  DEFAULT_USER_AGENT: z.string().optional(),
});

export const config = schema.parse(process.env);
export type Config = typeof config;
