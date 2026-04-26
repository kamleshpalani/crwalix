import type { Page } from 'playwright';
import type { Logger } from './utils/logger.js';

export type { JobStatus, JobRecord, JobStore } from '@crawlix/database';

export interface AdapterContext {
  page: Page;
  logger: Logger;
  signal: AbortSignal;
  onProgress: (p: { progress?: number; itemsCollected?: number }) => void;
}

export interface Adapter<TInput = unknown, TResult = unknown> {
  name: string;
  description: string;
  // Relaxed to ZodTypeAny so schemas with .default()/.optional() (whose input and
  // output types differ) can be assigned. Parsed output is cast to TInput at runtime.
  inputSchema: import('zod').ZodTypeAny;
  run(input: TInput, ctx: AdapterContext): Promise<TResult>;
}
