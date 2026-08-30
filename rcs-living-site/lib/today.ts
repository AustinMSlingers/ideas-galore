import { baseInfo } from "@/lib/baseInfo";

/**
 * The site's day is the studio's day, not the server's. Vercel runs in UTC and
 * the cron fires at 11:00 UTC (6am Central), so without this the edition would
 * be dated a day ahead for the first six hours of every morning.
 */
export function studioDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: baseInfo.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Parses `YYYY-MM-DD` as a local noon Date — safe for weekday/holiday maths. */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}
