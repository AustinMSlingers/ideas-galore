import { CuratorError, generateEdition, type CuratorContext } from "@/lib/curator";
import { defaultConfig } from "@/lib/defaultConfig";
import { getActiveAnnouncements, getPreviousEdition, saveEdition } from "@/lib/editions";
import { getHoliday } from "@/lib/holidays";
import { writeClient } from "@/lib/supabase";
import { studioDate } from "@/lib/today";
import { getWeather } from "@/lib/weather";
import type { SiteConfig } from "@/types/siteConfig";

/**
 * One day's generation, start to finish. The API route and the manual script
 * both call this, so what the cron does at 6am and what you run from a terminal
 * are the same code path.
 */

export interface GenerationOptions {
  /** Defaults to today in the studio's timezone. */
  date?: string;
  /** When false, the edition is generated and reported but not stored. */
  save?: boolean;
}

export interface GenerationSummary {
  ok: boolean;
  date: string;
  saved: boolean;
  attempts: number;
  weatherDegraded: boolean;
  holiday: string | null;
  announcementCount: number;
  config?: SiteConfig;
  /** Failures from attempts that were rejected, newest last. */
  rejected: string[][];
  reason?: string;
}

export async function runGeneration(options: GenerationOptions = {}): Promise<GenerationSummary> {
  const date = options.date ?? studioDate();
  const save = options.save ?? true;
  const client = writeClient();

  // A sky we cannot reach is not a reason to skip the day — the curator is told
  // the reading is approximate and writes around it.
  let weather = defaultConfig.weather;
  let weatherDegraded = false;
  try {
    weather = await getWeather();
  } catch (cause) {
    weatherDegraded = true;
    console.warn(`[generate] weather unavailable, using fallback conditions: ${(cause as Error).message}`);
  }

  const holiday = getHoliday(date);
  const announcements = await getActiveAnnouncements(client, date);
  const previous = await getPreviousEdition(client, date);

  const context: CuratorContext = { date, weather, weatherDegraded, holiday, announcements, previous };

  const base = {
    date,
    weatherDegraded,
    holiday,
    announcementCount: announcements.length,
  };

  try {
    const { config, attempts, rejected } = await generateEdition(context);

    if (save) await saveEdition(client, date, config);

    return { ...base, ok: true, saved: save, attempts, config, rejected };
  } catch (cause) {
    // Nothing is written, so the site keeps rendering yesterday's edition.
    const isCuratorError = cause instanceof CuratorError;
    const reason = cause instanceof Error ? cause.message : String(cause);
    const rejected = isCuratorError && cause.failures.length > 0 ? [cause.failures] : [];

    console.error(`[generate] ${date} missed: ${reason}`);
    for (const failure of rejected.flat()) console.error(`[generate]   - ${failure}`);

    return {
      ...base,
      ok: false,
      saved: false,
      attempts: isCuratorError ? cause.attempts : 0,
      rejected,
      reason,
    };
  }
}
