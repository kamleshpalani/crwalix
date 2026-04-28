import { describe, it, expect } from 'vitest';
import {
  CreateSearchSchema,
  LeadFilterSchema,
  ScheduleFrequencyEnum,
  NormalizedLeadSchema
} from '@crawlix/shared';

describe('ScheduleFrequencyEnum', () => {
  it('accepts the four supported values', () => {
    for (const v of ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']) {
      expect(ScheduleFrequencyEnum.parse(v)).toBe(v);
    }
  });
  it('rejects unsupported values', () => {
    expect(() => ScheduleFrequencyEnum.parse('HOURLY')).toThrow();
    expect(() => ScheduleFrequencyEnum.parse('')).toThrow();
  });
});

describe('CreateSearchSchema', () => {
  const base = {
    projectId: '11111111-1111-1111-1111-111111111111',
    name: 'Yoga studios in NY',
    provider: 'osm' as const
  };

  it('applies defaults', () => {
    const parsed = CreateSearchSchema.parse(base);
    expect(parsed.scheduleFrequency).toBe('NONE');
    expect(parsed.resultLimit).toBe(100);
    expect(parsed.enrichOnInsert).toBe(true);
    expect(parsed.scoreOnInsert).toBe(true);
  });

  it('accepts a recurring schedule', () => {
    const parsed = CreateSearchSchema.parse({ ...base, scheduleFrequency: 'DAILY' });
    expect(parsed.scheduleFrequency).toBe('DAILY');
  });

  it('rejects an invalid provider', () => {
    expect(() => CreateSearchSchema.parse({ ...base, provider: 'bing' })).toThrow();
  });

  it('rejects bad uuid', () => {
    expect(() => CreateSearchSchema.parse({ ...base, projectId: 'not-uuid' })).toThrow();
  });

  it('rejects oversized result limit', () => {
    expect(() => CreateSearchSchema.parse({ ...base, resultLimit: 9999 })).toThrow();
  });
});

describe('LeadFilterSchema', () => {
  it('parses discoveredWithin window', () => {
    const r = LeadFilterSchema.parse({ discoveredWithin: '7d' });
    expect(r.discoveredWithin).toBe('7d');
  });
  it('rejects bad discoveredWithin window', () => {
    expect(() => LeadFilterSchema.parse({ discoveredWithin: '14d' })).toThrow();
  });
  it('coerces page/pageSize from strings', () => {
    const r = LeadFilterSchema.parse({ page: '2', pageSize: '25' });
    expect(r.page).toBe(2);
    expect(r.pageSize).toBe(25);
  });
  it('caps pageSize', () => {
    expect(() => LeadFilterSchema.parse({ pageSize: '500' })).toThrow();
  });
  it('coerces outreachSuitable string to boolean', () => {
    expect(LeadFilterSchema.parse({ outreachSuitable: 'true' }).outreachSuitable).toBe(true);
    expect(LeadFilterSchema.parse({ outreachSuitable: 'false' }).outreachSuitable).toBe(false);
  });
});

describe('NormalizedLeadSchema', () => {
  it('requires non-empty externalPlaceId and name', () => {
    expect(() => NormalizedLeadSchema.parse({ provider: 'osm', externalPlaceId: '', name: 'x', raw: {} })).toThrow();
    expect(() => NormalizedLeadSchema.parse({ provider: 'osm', externalPlaceId: '1', name: '', raw: {} })).toThrow();
  });
  it('rejects bad website url', () => {
    expect(() => NormalizedLeadSchema.parse({
      provider: 'osm', externalPlaceId: '1', name: 'X', website: 'not-a-url', raw: {}
    })).toThrow();
  });
  it('clamps rating to 0..5', () => {
    expect(() => NormalizedLeadSchema.parse({
      provider: 'osm', externalPlaceId: '1', name: 'X', rating: 6, raw: {}
    })).toThrow();
  });
});
