/**
 * Forward-looking holiday verification: `npm run check:holidays`.
 *
 * Everything here is derived independently of lib/holidays — plain `Date`
 * arithmetic for the weekday rules and Gauss's algorithm for Easter, rather
 * than date-fns and Meeus/Jones/Butcher. Two implementations agreeing is worth
 * something; one implementation agreeing with itself is not.
 *
 * It walks EVERY day in the window, so it catches a holiday wrongly flagged
 * just as surely as one missed.
 */
import { getHoliday } from "../lib/holidays";
import { studioDate } from "../lib/today";

// Defaults to today and the next five years — past holidays prove the
// algorithm, but only the ones ahead of us will ever reach the site.
//   npm run check:holidays
//   npm run check:holidays -- 2027-01-01 2035
const START = process.argv[2] ?? studioDate();
const THROUGH_YEAR = Number(process.argv[3] ?? new Date().getFullYear() + 5);

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** `n`th `weekday` of a month, found by counting — no library, no formula. */
function nthWeekday(year: number, monthIndex: number, weekday: number, n: number): Date {
  let seen = 0;
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(year, monthIndex, day, 12);
    if (date.getMonth() !== monthIndex) break;
    if (date.getDay() === weekday && ++seen === n) return date;
  }
  throw new Error(`no ${n}th weekday ${weekday} in ${year}-${monthIndex + 1}`);
}

function lastWeekday(year: number, monthIndex: number, weekday: number): Date {
  let found: Date | null = null;
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(year, monthIndex, day, 12);
    if (date.getMonth() !== monthIndex) break;
    if (date.getDay() === weekday) found = date;
  }
  if (!found) throw new Error(`no weekday ${weekday} in ${year}-${monthIndex + 1}`);
  return found;
}

/** Gauss's Easter algorithm — a different derivation from the one in lib. */
function easterGauss(year: number): Date {
  const a = year % 19;
  const b = year % 4;
  const c = year % 7;
  const k = Math.floor(year / 100);
  const p = Math.floor((13 + 8 * k) / 25);
  const q = Math.floor(k / 4);
  const M = (15 - p + k - q) % 30;
  const N = (4 + k - q) % 7;
  const d = (19 * a + M) % 30;
  const e = (2 * b + 4 * c + 6 * d + N) % 7;
  const march22 = new Date(year, 2, 22, 12);
  march22.setDate(march22.getDate() + d + e);
  // The two exceptional corrections to the base rule.
  if (d === 29 && e === 6) return new Date(year, 3, 19, 12);
  if (d === 28 && e === 6 && a > 10) return new Date(year, 3, 18, 12);
  return march22;
}

/** What the calendar says, derived here rather than read from lib/holidays. */
function expectedFor(year: number): Map<string, string> {
  const expected = new Map<string, string>();
  const put = (date: Date, name: string) => expected.set(iso(date), name);

  put(new Date(year, 0, 1, 12), "New Year's Day");
  put(new Date(year, 1, 14, 12), "Valentine's Day");
  put(new Date(year, 2, 17, 12), "St. Patrick's Day");
  put(easterGauss(year), "Easter");
  put(nthWeekday(year, 4, 0, 2), "Mother's Day");
  put(lastWeekday(year, 4, 1), "Memorial Day");
  put(nthWeekday(year, 5, 0, 3), "Father's Day");
  put(new Date(year, 6, 4, 12), "Independence Day");
  put(nthWeekday(year, 8, 1, 1), "Labor Day");
  put(new Date(year, 9, 31, 12), "Halloween");
  put(nthWeekday(year, 10, 4, 4), "Thanksgiving");
  put(new Date(year, 11, 25, 12), "Christmas");

  return expected;
}

/** How a calculated date is justified, for the printed table. */
function rule(name: string, date: Date): string {
  const day = DAY_NAMES[date.getDay()];
  const ordinal = Math.ceil(date.getDate() / 7);
  switch (name) {
    case "Easter":
      return `${day} — Gauss and Meeus/Jones/Butcher agree`;
    case "Mother's Day":
    case "Father's Day":
    case "Labor Day":
    case "Thanksgiving":
      return `${ordinal}${["th", "st", "nd", "rd"][ordinal] ?? "th"} ${day} of the month`;
    case "Memorial Day":
      return `last ${day} of the month`;
    default:
      return `${day} — fixed date`;
  }
}

const start = new Date(`${START}T12:00:00`);
const failures: string[] = [];
let checked = 0;
let matched = 0;

console.log(`Verifying every day from ${START} through ${THROUGH_YEAR}-12-31.\n`);

for (let year = start.getFullYear(); year <= THROUGH_YEAR; year += 1) {
  const expected = expectedFor(year);
  const rows: string[] = [];

  for (let cursor = new Date(year, 0, 1, 12); cursor.getFullYear() === year; cursor.setDate(cursor.getDate() + 1)) {
    if (cursor < start) continue;
    checked += 1;

    const key = iso(cursor);
    const got = getHoliday(key);
    const want = expected.get(key) ?? null;

    if (got === want) {
      if (want) {
        matched += 1;
        rows.push(`  ${key}  ${want.padEnd(18)} ${rule(want, new Date(cursor))}`);
      }
      continue;
    }

    failures.push(
      want === null
        ? `${key}: lib says "${got}", but it is not a holiday (${DAY_NAMES[cursor.getDay()]})`
        : `${key}: lib says ${JSON.stringify(got)}, calendar says "${want}"`,
    );
  }

  // A year in the window that should carry all twelve, but does not, is a miss
  // the day-by-day walk above would only catch as individual absences.
  const inWindow = [...expected.keys()].filter((key) => new Date(`${key}T12:00:00`) >= start);
  console.log(`${year} — ${rows.length}/${inWindow.length} holidays`);
  rows.forEach((row) => console.log(row));
  console.log();
}

console.log(`Checked ${checked} days; ${matched} holidays matched.`);

if (failures.length > 0) {
  console.error(`\n${failures.length} MISMATCH(ES):`);
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log("Every day agrees with the independently derived calendar.");
