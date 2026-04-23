import { createJobStore, type JobStore } from '@crawlix/database';
import { config } from './config.js';
import { logger } from './utils/logger.js';

export const jobStore: JobStore = createJobStore({
  driver: config.JOB_STORE,
  supabase:
    config.JOB_STORE === 'supabase'
      ? {
          url: config.SUPABASE_URL!,
          serviceRoleKey: config.SUPABASE_SERVICE_ROLE_KEY!,
        }
      : undefined,
});

logger.info({ driver: config.JOB_STORE }, 'Job store ready');
