import { getDate, getDay, getMonth, getYear, isSameDay, lastDayOfMonth, startOfMonth, subDays } from "date-fns";

import { parseISODate } from "@/lib/today";

/**
 * Holiday lookup with no external API — the dates are either fixed or
 * computable, and a service that can go down is a poor reason for the site to
 * miss Christmas.
 */

/** `n`th occurrence of `weekday` (0 = Sunday) in a month. */
function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, n: number): Date {
  const first = startOfMonth(new Date(year, monthIndex, 1));
  const offset = (weekday - getDay(first) + 7) % 7;
  return new Date(year, monthIndex, 1 + offset + (n - 1) * 7, 12);
}

/** Last occurrence of `weekday` in a month. */
function lastWeekdayOfMonth(year: number, monthIndex: number, weekday: number): Date {
  const last = lastDayOfMonth(new Date(year, monthIndex, 1));
  const back = (getDay(last) - weekday + 7) % 7;
  const result = subDays(last, back);
  return new Date(getYear(result), getMonth(result), getDate(result), 12);
}

/**
 * Easter Sunday by the anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 * Valid for any Gregorian year; drives Good Friday too if that is ever wanted.
 */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12);
}

interface HolidayRule {
  name: string;
  /** Fixed dates as [monthIndex, day]; calculated ones as a function of year. */
  on: [number, number] | ((year: number) => Date);
}

const HOLIDAYS: HolidayRule[] = [
  { name: "New Year's Day", on: [0, 1] },
  { name: "Valentine's Day", on: [1, 14] },
  { name: "St. Patrick's Day", on: [2, 17] },
  { name: "Easter", on: (year) => easterSunday(year) },
  { name: "Mother's Day", on: (year) => nthWeekdayOfMonth(year, 4, 0, 2) },
  { name: "Memorial Day", on: (year) => lastWeekdayOfMonth(year, 4, 1) },
  { name: "Father's Day", on: (year) => nthWeekdayOfMonth(year, 5, 0, 3) },
  { name: "Independence Day", on: [6, 4] },
  { name: "Labor Day", on: (year) => nthWeekdayOfMonth(year, 8, 1, 1) },
  { name: "Halloween", on: [9, 31] },
  { name: "Thanksgiving", on: (year) => nthWeekdayOfMonth(year, 10, 4, 4) },
  { name: "Christmas", on: [11, 25] },
];

/** The holiday falling on `date`, or null. Accepts a Date or `YYYY-MM-DD`. */
export function getHoliday(date: Date | string): string | null {
  const day = typeof date === "string" ? parseISODate(date) : date;
  const year = getYear(day);

  for (const holiday of HOLIDAYS) {
    const match =
      typeof holiday.on === "function"
        ? isSameDay(day, holiday.on(year))
        : getMonth(day) === holiday.on[0] && getDate(day) === holiday.on[1];

    if (match) return holiday.name;
  }

  return null;
}
