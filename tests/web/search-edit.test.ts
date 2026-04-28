import { describe, it, expect } from 'vitest';
import {
  validateName,
  validateResultLimit,
  validateRadius,
  validateLeadFocus,
  validateSchedule,
  validateCountry,
  nullableStr
} from '../../apps/web/src/lib/search-edit';

describe('validateName', () => {
  it('accepts a normal name', () => {
    expect(validateName('Yoga studios in NY')).toEqual({ ok: true, value: 'Yoga studios in NY' });
  });
  it('trims whitespace', () => {
    expect(validateName('   foo   ')).toEqual({ ok: true, value: 'foo' });
  });
  it('rejects empty', () => {
    expect(validateName('').ok).toBe(false);
    expect(validateName('   ').ok).toBe(false);
  });
  it('rejects > 120 chars', () => {
    expect(validateName('a'.repeat(121)).ok).toBe(false);
  });
});

describe('validateResultLimit', () => {
  it('returns undefined when blank (no change)', () => {
    expect(validateResultLimit('')).toEqual({ ok: true, value: undefined });
  });
  it('accepts 1..500', () => {
    expect(validateResultLimit('1').value).toBe(1);
    expect(validateResultLimit('250').value).toBe(250);
    expect(validateResultLimit('500').value).toBe(500);
  });
  it('floors decimals', () => {
    expect(validateResultLimit('99.9').value).toBe(99);
  });
  it('rejects out-of-range', () => {
    expect(validateResultLimit('0').ok).toBe(false);
    expect(validateResultLimit('501').ok).toBe(false);
    expect(validateResultLimit('-5').ok).toBe(false);
  });
  it('rejects non-numeric', () => {
    expect(validateResultLimit('lots').ok).toBe(false);
  });
});

describe('validateRadius', () => {
  it('returns undefined when not present in form', () => {
    expect(validateRadius(null)).toEqual({ ok: true, value: undefined });
  });
  it('returns null when blank (clear)', () => {
    expect(validateRadius('')).toEqual({ ok: true, value: null });
  });
  it('accepts 0..50000', () => {
    expect(validateRadius('0').value).toBe(0);
    expect(validateRadius('25000').value).toBe(25000);
    expect(validateRadius('50000').value).toBe(50000);
  });
  it('rejects > 50000', () => {
    expect(validateRadius('50001').ok).toBe(false);
  });
  it('rejects negatives', () => {
    expect(validateRadius('-1').ok).toBe(false);
  });
});

describe('validateLeadFocus', () => {
  it('returns undefined for empty', () => {
    expect(validateLeadFocus('')).toEqual({ ok: true, value: undefined });
  });
  it('accepts the three values', () => {
    expect(validateLeadFocus('ALL').value).toBe('ALL');
    expect(validateLeadFocus('NO_WEBSITE').value).toBe('NO_WEBSITE');
    expect(validateLeadFocus('HIGH_OR_MED').value).toBe('HIGH_OR_MED');
  });
  it('rejects unknown', () => {
    expect(validateLeadFocus('SOMETHING').ok).toBe(false);
  });
});

describe('validateSchedule', () => {
  it('returns undefined for empty', () => {
    expect(validateSchedule('')).toEqual({ ok: true, value: undefined });
  });
  it('accepts the four values', () => {
    for (const v of ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']) {
      expect(validateSchedule(v).value).toBe(v);
    }
  });
  it('rejects unknown', () => {
    expect(validateSchedule('HOURLY').ok).toBe(false);
  });
});

describe('validateCountry', () => {
  it('uppercases ISO-2', () => {
    expect(validateCountry('us').value).toBe('US');
    expect(validateCountry('IN').value).toBe('IN');
  });
  it('returns null when blank (clear)', () => {
    expect(validateCountry('')).toEqual({ ok: true, value: null });
  });
  it('rejects non-2-letter', () => {
    expect(validateCountry('USA').ok).toBe(false);
    expect(validateCountry('U').ok).toBe(false);
    expect(validateCountry('12').ok).toBe(false);
  });
});

describe('nullableStr', () => {
  it('undefined when null', () => {
    expect(nullableStr(null)).toBeUndefined();
  });
  it('null when blank', () => {
    expect(nullableStr('')).toBeNull();
    expect(nullableStr('   ')).toBeNull();
  });
  it('trims otherwise', () => {
    expect(nullableStr('  hi  ')).toBe('hi');
  });
});
