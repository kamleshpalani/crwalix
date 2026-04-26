import { nanoid } from 'nanoid';
import type { JobRecord, JobStatus, JobStore } from './types.js';

export class InMemoryJobStore implements JobStore {
  private jobs = new Map<string, JobRecord>();

  create(input: Omit<JobRecord, 'id' | 'status' | 'createdAt'>): JobRecord {
    const job: JobRecord = {
      id: nanoid(12),
      status: 'queued',
      createdAt: new Date().toISOString(),
      ...input,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  update(id: string, patch: Partial<JobRecord>): JobRecord | undefined {
    const existing = this.jobs.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    this.jobs.set(id, updated);
    return updated;
  }

  list(opts?: { status?: JobStatus; limit?: number }): JobRecord[] {
    const all = Array.from(this.jobs.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    const filtered = opts?.status ? all.filter((j) => j.status === opts.status) : all;
    return typeof opts?.limit === 'number' ? filtered.slice(0, opts.limit) : filtered;
  }
}

export const jobStore: JobStore = new InMemoryJobStore();
