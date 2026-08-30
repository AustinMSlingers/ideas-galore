/**
 * Environment access. Every value here is a secret or a deployment detail — it
 * lives in Vercel env vars (and `.env.local` for development) and never in the
 * repo. Reads are lazy so the site still renders from the fallback config when
 * nothing is configured yet.
 */

function optional(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

function required(name: string, why: string): string {
  const value = optional(name);
  if (!value) throw new Error(`Missing ${name} — ${why}. Set it in .env.local (local) or Vercel env vars (deployed).`);
  return value;
}

export const supabaseUrl = () => optional("SUPABASE_URL") ?? optional("NEXT_PUBLIC_SUPABASE_URL");
export const supabaseAnonKey = () => optional("SUPABASE_ANON_KEY") ?? optional("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const supabaseServiceKey = () => optional("SUPABASE_SERVICE_ROLE_KEY");

export const requireSupabaseUrl = () => supabaseUrl() ?? required("SUPABASE_URL", "the generator needs your project URL");
export const requireSupabaseServiceKey = () =>
  required("SUPABASE_SERVICE_ROLE_KEY", "the generator writes editions and reads announcements");
export const requireAnthropicKey = () => required("ANTHROPIC_API_KEY", "the curator calls the Claude API");
export const requireCronSecret = () =>
  required("CRON_SECRET", "the generate route refuses to run unprotected");

/** True when the site has enough configuration to read stored editions. */
export function canReadEditions(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}
