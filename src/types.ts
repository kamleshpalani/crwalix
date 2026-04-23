import type { Page } from 'playwright';
import type { Logger } from './utils/logger.js';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

export interface JobRecord<TInput = unknown, TResult = unknown> {
  id: string;
  adapter: string;
  input: TInput;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: TResult;
  error?: string;
  progress?: number; // 0..1
  itemsCollected?: number;
}

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
