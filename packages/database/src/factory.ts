import type { JobStore } from './types.js';
import { InMemoryJobStore } from './jobs.js';
import { SupabaseJobStore } from './supabase.js';

export interface JobStoreConfig {
  driver: 'memory' | 'supabase';
  supabase?: { url: string; serviceRoleKey: string };
}

export function createJobStore(cfg: JobStoreConfig): JobStore {
  if (cfg.driver === 'supabase') {
    if (!cfg.supabase?.url || !cfg.supabase?.serviceRoleKey) {
      throw new Error(
        'JOB_STORE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
      );
    }
    return new SupabaseJobStore(cfg.supabase);
  }
  return new InMemoryJobStore();
}
