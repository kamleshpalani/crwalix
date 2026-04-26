import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import type { JobRecord, JobStatus, JobStore } from './types.js';

const TABLE = 'jobs';

/** DB row shape (snake_case). Kept separate from the domain JobRecord. */
interface JobRow {
  id: string;
  adapter: string;
  status: JobStatus;
  input: unknown;
  result: unknown | null;
  error: string | null;
  progress: number | null;
  items_collected: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  user_id: string | null;
}

function rowToRecord(row: JobRow): JobRecord {
  return {
    id: row.id,
    adapter: row.adapter,
    status: row.status,
    input: row.input,
    result: row.result ?? undefined,
    error: row.error ?? undefined,
    progress: row.progress ?? undefined,
    itemsCollected: row.items_collected ?? undefined,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
  };
}

function recordPatchToRow(patch: Partial<JobRecord>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.adapter !== undefined) row.adapter = patch.adapter;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.input !== undefined) row.input = patch.input;
  if (patch.result !== undefined) row.result = patch.result;
  if (patch.error !== undefined) row.error = patch.error;
  if (patch.progress !== undefined) row.progress = patch.progress;
  if (patch.itemsCollected !== undefined) row.items_collected = patch.itemsCollected;
  if (patch.createdAt !== undefined) row.created_at = patch.createdAt;
  if (patch.startedAt !== undefined) row.started_at = patch.startedAt;
  if (patch.finishedAt !== undefined) row.finished_at = patch.finishedAt;
  return row;
}

/**
 * Supabase-backed JobStore.
 *
 * Note: the existing JobStore interface is synchronous. To avoid a breaking
 * refactor of the engine/runner today, write paths are fired-and-forgotten
 * with an in-memory shadow copy returned to callers. A follow-up will make
 * the interface async end-to-end — for now this keeps the runner unchanged
 * while persisting everything to Postgres.
 */
export class SupabaseJobStore implements JobStore {
  private readonly client: SupabaseClient;
  private readonly cache = new Map<string, JobRecord>();

  constructor(opts: { url: string; serviceRoleKey: string }) {
    this.client = createClient(opts.url, opts.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    void this.hydrate();
  }

  private async hydrate(): Promise<void> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[SupabaseJobStore] hydrate failed:', error.message);
      return;
    }
    for (const row of (data ?? []) as JobRow[]) {
      this.cache.set(row.id, rowToRecord(row));
    }
  }

  create(input: Omit<JobRecord, 'id' | 'status' | 'createdAt'>): JobRecord {
    const job: JobRecord = {
      id: nanoid(12),
      status: 'queued',
      createdAt: new Date().toISOString(),
      ...input,
    };
    this.cache.set(job.id, job);

    void this.client
      .from(TABLE)
      .insert({
        id: job.id,
        adapter: job.adapter,
        status: job.status,
        input: job.input,
        created_at: job.createdAt,
      })
      .then(({ error }) => {
        if (error) console.error('[SupabaseJobStore] insert failed:', error.message);
      });

    return job;
  }

  get(id: string): JobRecord | undefined {
    return this.cache.get(id);
  }

  update(id: string, patch: Partial<JobRecord>): JobRecord | undefined {
    const existing = this.cache.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    this.cache.set(id, updated);

    const row = recordPatchToRow(patch);
    if (Object.keys(row).length > 0) {
      void this.client
        .from(TABLE)
        .update(row)
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('[SupabaseJobStore] update failed:', error.message);
        });
    }

    return updated;
  }

  list(opts?: { status?: JobStatus; limit?: number }): JobRecord[] {
    const all = Array.from(this.cache.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    const filtered = opts?.status ? all.filter((j) => j.status === opts.status) : all;
    return typeof opts?.limit === 'number' ? filtered.slice(0, opts.limit) : filtered;
  }
}
