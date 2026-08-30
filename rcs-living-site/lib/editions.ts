import { defaultConfig } from "@/lib/defaultConfig";
import { explainSupabaseError, readClient, writeClient, type LivingSiteClient } from "@/lib/supabase";
import { studioDate } from "@/lib/today";
import { validateConfig } from "@/lib/validateConfig";
import type { SiteConfig } from "@/types/siteConfig";

/** How far back to look when the most recent editions fail validation. */
const LOOKBACK = 5;

export interface Edition {
  config: SiteConfig;
  source: "supabase" | "fallback";
  /** The date the rendered edition was published for; null for the fallback. */
  date: string | null;
  /** Why the fallback was used, when it was. */
  note?: string;
}

/**
 * The newest edition that still passes validation, or the hand-tuned fallback.
 *
 * Stored configs are re-validated on read rather than trusted: the design rules
 * can tighten after a config was written, and a row that no longer satisfies
 * them should quietly step aside instead of rendering something unreadable.
 */
export async function getCurrentEdition(client: LivingSiteClient | null = readClient()): Promise<Edition> {
  if (!client) {
    return { config: defaultConfig, source: "fallback", date: null, note: "Supabase is not configured." };
  }

  try {
    const { data, error } = await client
      .from("configs")
      .select("date, config")
      .lte("date", studioDate())
      .order("date", { ascending: false })
      .limit(LOOKBACK);

    if (error) {
      return { config: defaultConfig, source: "fallback", date: null, note: `Supabase read failed: ${explainSupabaseError(error)}` };
    }

    if (!data || data.length === 0) {
      return { config: defaultConfig, source: "fallback", date: null, note: "No editions stored yet." };
    }

    for (const row of data) {
      if (validateConfig(row.config).valid) {
        return { config: row.config, source: "supabase", date: row.date };
      }
    }

    return {
      config: defaultConfig,
      source: "fallback",
      date: null,
      note: `The ${data.length} most recent editions all failed validation.`,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { config: defaultConfig, source: "fallback", date: null, note: `Supabase unreachable: ${message}` };
  }
}

/** The most recent edition published strictly before `date`. */
export async function getPreviousEdition(client: LivingSiteClient, date: string): Promise<SiteConfig | null> {
  const { data, error } = await client
    .from("configs")
    .select("config")
    .lt("date", date)
    .order("date", { ascending: false })
    .limit(1);

  if (error) throw new Error(`Could not read the previous edition: ${explainSupabaseError(error)}`);
  return data?.[0]?.config ?? null;
}

/** Upserts on `date`, so re-running a generation replaces that day's edition. */
export async function saveEdition(client: LivingSiteClient, date: string, config: SiteConfig): Promise<void> {
  const { error } = await client.from("configs").upsert({ date, config }, { onConflict: "date" });
  if (error) throw new Error(`Could not save the edition: ${explainSupabaseError(error)}`);
}

export async function getActiveAnnouncements(client: LivingSiteClient, date: string) {
  const { data, error } = await client
    .from("announcements")
    .select("*")
    .eq("active", true)
    .or(`starts_on.is.null,starts_on.lte.${date}`)
    .or(`ends_on.is.null,ends_on.gte.${date}`)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not read announcements: ${explainSupabaseError(error)}`);
  return data ?? [];
}

export { writeClient };
