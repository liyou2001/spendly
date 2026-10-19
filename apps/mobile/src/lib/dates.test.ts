import { describe, expect, it } from 'vitest';

import { addDays, formatDate, todayLocal } from './dates';

describe('todayLocal', () => {
  it('uses the phone’s local calendar date', () => {
    expect(todayLocal(new Date(2026, 9, 17, 23, 59))).toBe('2026-10-17');
    expect(todayLocal(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });
});

describe('addDays', () => {
  it('moves across month, year and leap-day boundaries', () => {
    expect(addDays('2026-10-17', -1)).toBe('2026-10-16');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('does not skip or repeat a day around daylight saving changes', () => {
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });
});

describe('formatDate', () => {
  const today = '2026-10-18';
  it('says Today and Yesterday', () => {
    expect(formatDate('2026-10-18', today)).toBe('Today');
    expect(formatDate('2026-10-17', today)).toBe('Yesterday');
  });
  it('shows weekday and date this year, and the year otherwise', () => {
    expect(formatDate('2026-10-16', today)).toBe('Fri, Oct 16');
    expect(formatDate('2025-12-31', today)).toBe('Dec 31, 2025');
  });
});
