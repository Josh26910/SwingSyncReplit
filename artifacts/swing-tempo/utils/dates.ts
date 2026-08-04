/**
 * Local-calendar date helpers.
 *
 * Everything day-keyed in this app — practice sessions, swing records,
 * streaks, the contribution grid, the weekly recap — used to derive "today"
 * from `new Date().toISOString().slice(0, 10)`. That is always the UTC date,
 * so for anyone east of Greenwich the day rolled over mid-morning local
 * time: an evening practice in Sydney was filed under tomorrow, and streaks
 * broke at random. These helpers use the device's own calendar instead.
 */

/** `YYYY-MM-DD` for a Date in the device's local timezone. */
export function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today's local date as `YYYY-MM-DD`. */
export function todayIso(): string {
  return toLocalIsoDate(new Date());
}

/**
 * The local date `n` days before today. Built by stepping a Date rather
 * than subtracting milliseconds, so DST transitions don't shift the result
 * by an hour and skip or repeat a day.
 */
export function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalIsoDate(d);
}
