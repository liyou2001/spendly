import { describe, expect, it } from 'vitest';

import { addDays, calendarDay, calendarWeeks, formatDate, monthDay, todayLocal } from './dates';

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

describe('monthDay', () => {
  it('always gives the short month and day', () => {
    expect(monthDay('2026-10-19')).toBe('Oct 19');
    expect(monthDay('2025-01-02')).toBe('Jan 2');
  });
});

describe('calendarWeeks', () => {
  it('lays out October 2026 from Sunday, starting on Thursday the 1st', () => {
    const weeks = calendarWeeks('2026-10-17');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(weeks[4]).toEqual([
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
    ]);
  });

  it('handles leap years and pads the last week', () => {
    const weeks = calendarWeeks('2028-02-01');
    const days = weeks.flat().filter((d) => d !== null);
    expect(days).toHaveLength(29);
    expect(days.at(-1)).toBe('2028-02-29');
    for (const week of weeks) expect(week).toHaveLength(7);
  });
});

describe('calendarDay', () => {
  it('marks the picked day and today, and refuses days after today', () => {
    expect(calendarDay('2026-10-17', '2026-10-17', '2026-10-19')).toEqual({
      selected: true,
      today: false,
      pickable: true,
    });
    expect(calendarDay('2026-10-19', '2026-10-17', '2026-10-19')).toMatchObject({
      today: true,
      pickable: true,
    });
    expect(calendarDay('2026-10-20', '2026-10-17', '2026-10-19').pickable).toBe(false);
  });
});
