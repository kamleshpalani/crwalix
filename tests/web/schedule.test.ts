import { describe, it, expect } from 'vitest';
import { computeNextRunAt } from '../../apps/web/src/lib/schedule';

describe('computeNextRunAt', () => {
  const base = new Date('2026-01-01T00:00:00.000Z');

  it('returns null for NONE', () => {
    expect(computeNextRunAt('NONE', base)).toBeNull();
  });

  it('adds 1 day for DAILY', () => {
    const r = computeNextRunAt('DAILY', base)!;
    expect(r.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('adds 7 days for WEEKLY', () => {
    const r = computeNextRunAt('WEEKLY', base)!;
    expect(r.toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });

  it('adds 30 days for MONTHLY', () => {
    const r = computeNextRunAt('MONTHLY', base)!;
    expect(r.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });

  it('uses now when from is omitted', () => {
    const before = Date.now();
    const r = computeNextRunAt('DAILY')!;
    const after = Date.now();
    expect(r.getTime()).toBeGreaterThanOrEqual(before + 24 * 3600 * 1000 - 5);
    expect(r.getTime()).toBeLessThanOrEqual(after + 24 * 3600 * 1000 + 5);
  });
});
