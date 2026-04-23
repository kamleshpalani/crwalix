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

export interface JobStore {
  create(input: Omit<JobRecord, 'id' | 'status' | 'createdAt'>): JobRecord;
  get(id: string): JobRecord | undefined;
  update(id: string, patch: Partial<JobRecord>): JobRecord | undefined;
  list(opts?: { status?: JobStatus; limit?: number }): JobRecord[];
}
