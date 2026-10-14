import { describe, expect, it } from 'vitest';
import { attendanceRate, ctr, formatPercent, formatPoints, growth, noShowRate, percent, pointChange, repeatRate } from './metrics';

// SRS 3.7.7 definitions and acceptance 7.4: zero denominators give null ("—"), never 0% or Infinity.

describe('percent', () => {
  it('divides and multiplies by 100', () => expect(percent(1, 4)).toBe(25));
  it('is null for a zero denominator', () => expect(percent(3, 0)).toBeNull());
});

describe('attendance metrics', () => {
  it('attendance rate = checked in ÷ eligible confirmed', () => expect(attendanceRate(14, 15)).toBeCloseTo(93.33, 2));
  it('no-show rate is the complement', () => expect(noShowRate(14, 15)).toBeCloseTo(6.67, 2));
  it('no eligible holders gives no rate', () => {
    expect(attendanceRate(0, 0)).toBeNull();
    expect(noShowRate(0, 0)).toBeNull();
  });
  it('repeat rate uses unique hikers as the denominator', () => expect(repeatRate(30, 120)).toBe(25));
});

describe('growth', () => {
  it('is the change as a share of the previous period', () => expect(growth(120, 100)).toBe(20));
  it('can be negative', () => expect(growth(80, 100)).toBe(-20));
  it('is null when the previous period was zero', () => expect(growth(5, 0)).toBeNull());
});

describe('ctr (ADS-015)', () => {
  it('= clicks ÷ impressions × 100', () => expect(ctr(663, 21400)).toBeCloseTo(3.098, 3));
  it('is null with no impressions', () => expect(ctr(0, 0)).toBeNull());
});

describe('formatting', () => {
  it('shows — for null', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPoints(null)).toBe('—');
  });
  it('rounds to the given digits', () => expect(formatPercent(93.333, 0)).toBe('93%'));
  it('point change needs both rates', () => {
    expect(pointChange(10, 7.5)).toBe(2.5);
    expect(pointChange(null, 7.5)).toBeNull();
    expect(formatPoints(2.5)).toBe('+2.5 pt');
  });
});
