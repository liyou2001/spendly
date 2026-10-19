// Expense dates are calendar dates ("2026-10-17"), not instants, so they're handled as strings.
// Converting through Date objects in the local time zone is how dates shift by a day.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

export function todayLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function toUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

/** Moves a YYYY-MM-DD date by whole days. Done in UTC, so daylight saving can't skip a day. */
export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** "Today", "Yesterday", "Sat, Oct 17", or "Oct 17, 2025" for another year. */
export function formatDate(date: string, today: string = todayLocal()): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  const d = toUtc(date);
  const monthDay = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  if (date.slice(0, 4) !== today.slice(0, 4)) return `${monthDay}, ${d.getUTCFullYear()}`;
  return `${WEEKDAYS[d.getUTCDay()]}, ${monthDay}`;
}

/** "Oct 19" from "2026-10-19", whatever today is. */
export function monthDay(date: string): string {
  const d = toUtc(date);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
