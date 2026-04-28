import type { ScheduleFrequency } from '@crawlix/shared';

/**
 * Map a recurring schedule onto the next absolute UTC fire time.
 * Returns `null` for one-shot ('NONE') searches.
 */
export function computeNextRunAt(freq: ScheduleFrequency, from: Date = new Date()): Date | null {
  const t = from.getTime();
  switch (freq) {
    case 'DAILY':   return new Date(t + 24 * 60 * 60 * 1000);
    case 'WEEKLY':  return new Date(t + 7 * 24 * 60 * 60 * 1000);
    case 'MONTHLY': return new Date(t + 30 * 24 * 60 * 60 * 1000);
    default:        return null;
  }
}
