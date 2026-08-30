import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  requireSupabaseServiceKey,
  requireSupabaseUrl,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/env";
import type { SiteConfig } from "@/types/siteConfig";

/**
 * Everything lives in its own schema rather than `public`. Remember to add
 * `living_site` to Settings -> API -> Exposed schemas in Supabase, or PostgREST
 * will 404 every one of these queries.
 */
export const SCHEMA = "living_site";

// Type aliases, not interfaces: supabase-js requires rows to be assignable to
// Record<string, unknown>, and only type aliases get an implicit index signature.
export type ConfigRow = {
  id: string;
  date: string;
  config: SiteConfig;
  created_at: string;
};

export type AnnouncementRow = {
  id: string;
  text: string;
  active: boolean;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
};

interface Database {
  living_site: {
    Tables: {
      configs: {
        Row: ConfigRow;
        Insert: { date: string; config: SiteConfig };
        Update: Partial<{ date: string; config: SiteConfig }>;
        Relationships: [];
      };
      announcements: {
        Row: AnnouncementRow;
        Insert: Omit<AnnouncementRow, "id" | "created_at">;
        Update: Partial<Omit<AnnouncementRow, "id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type LivingSiteClient = SupabaseClient<Database, "living_site">;

const clientOptions = {
  db: { schema: SCHEMA },
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

/**
 * Anon-key client for reading published editions. Returns null when Supabase
 * is not configured, which is the signal to fall back to `defaultConfig`.
 */
export function readClient(): LivingSiteClient | null {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;
  return createClient<Database, "living_site">(url, key, clientOptions);
}

/**
 * Service-role client. Bypasses RLS, so it is only ever constructed inside the
 * generator — never in anything that renders to a browser.
 */
export function writeClient(): LivingSiteClient {
  return createClient<Database, "living_site">(
    requireSupabaseUrl(),
    requireSupabaseServiceKey(),
    clientOptions,
  );
}

/**
 * PostgREST will not serve a schema that is not in the project's exposed list,
 * and the raw error ("The schema must be one of the following: public") does
 * not say where to fix it. Every Supabase error the app surfaces goes through
 * here so the answer arrives with the problem.
 */
export function explainSupabaseError(error: { message: string; code?: string }): string {
  const exposureCodes = ["PGRST106", "PGRST002"];
  const looksLikeExposure =
    (error.code && exposureCodes.includes(error.code)) ||
    /schema must be one of the following/i.test(error.message);

  if (looksLikeExposure) {
    return (
      `${error.message} — the "${SCHEMA}" schema is not exposed to the API. ` +
      `Fix it in Supabase: Project Settings -> API -> Exposed schemas -> add "${SCHEMA}" -> Save.`
    );
  }

  return error.message;
}
