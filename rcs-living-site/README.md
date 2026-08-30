# rcs-living-site

A one-page site that repaints itself daily. Everything that changes day to day
lives in a single `SiteConfig` object; everything that defines the brand —
typography, spacing, layout, base copy — is fixed.

Next.js 14 (app router) · TypeScript · Tailwind.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill it in — see Setup below
npm run dev                  # http://localhost:3000
npm run regenerate           # mount today's edition with the curator
npm run regenerate -- --dry  # generate and print, save nothing
npm run check:config         # assert the fallback config passes validation
npm run check:holidays       # verify every holiday from today through +5 years
npm run typecheck
```

## Setup

1. **Env vars.** Copy `.env.example` to `.env.local` and fill in all five. The
   same five go in Vercel's project settings. Nothing secret is ever committed.

2. **Database.** Apply `supabase/migrations/0001_living_site.sql` (SQL editor or
   `supabase db push`).

3. **Expose the schema.** In Supabase: **Project Settings → API → Exposed
   schemas → add `living_site` → Save.** PostgREST serves only listed schemas,
   so without this every query 404s. (Do *not* set `pgrst.db_schemas` on the
   `authenticator` role by hand — that permanently stops the dashboard from
   managing exposed schemas.) If you miss this step the app says so: the error
   names the setting and the path to it.

4. **Announcements** are optional. Add one and the next generation folds it into
   the edition and shows the banner:

   ```sql
   insert into living_site.announcements (text, active, starts_on, ends_on)
   values ('The winter run of prints goes up Saturday at 9am.', true, null, '2026-12-31');
   ```

Note: `living_site.announcements` has RLS enabled with **no** policies on
purpose — unpublished studio news should not be world-readable, and only the
service role (which bypasses RLS) touches it. The Supabase linter flags this as
`rls_enabled_no_policy`; that is the intended state, not an oversight.

## Shape

| Path | What it is |
| --- | --- |
| `types/siteConfig.ts` | The daily object: date, weather, holiday, mood, copy, announcement. |
| `lib/validateConfig.ts` | Property-based design validation. Returns `{ valid, failures }`. |
| `lib/defaultConfig.ts` | Hand-tuned fallback that passes validation. |
| `lib/baseInfo.ts` | Locked studio data: definition, products, closing line, founder. Never generated. |
| `lib/color.ts` | Contrast, saturation, luminance and hue maths behind the rules. |
| `lib/theme.ts` | Turns a validated mood into CSS custom properties. |
| `lib/weather.ts` | Current conditions for the studio from Open-Meteo (free, no key). |
| `lib/holidays.ts` | Fixed and calculated holidays, computed locally — no API. |
| `lib/curator.ts` | The Claude call: brief, schema, and the validation retry loop. |
| `lib/runGeneration.ts` | One day's generation end to end. The cron and the script share it. |
| `lib/editions.ts` | Reading, saving and falling back. |
| `app/api/generate/route.ts` | The daily generation, behind `CRON_SECRET`. |
| `app/page.tsx` | Renders the newest valid edition, or the fallback. |
| `supabase/migrations/` | Schema, RLS and grants. |

## The design rules

`validateConfig` does not check a palette against a list of approved colours —
it checks *properties*, so any palette that satisfies them belongs to this site:

1. `textColor` clears WCAG AA (4.5:1) against **every** gradient stop.
2. No colour exceeds 85% saturation — nothing reads as neon.
3. Adjacent gradient stops sit within a 0.3 luminance delta (blends smoothly)
   and at least 0.004 apart (does not look flat).
4. `accentColor` is within 60° of the nearest sky hue, so it reads as part of
   the same family. Near-grey accents and all-grey skies skip this check.
5. All copy is within its length limit.

Every failure message names the value, the measured number, the threshold, and
a way to fix it — a later build session feeds `failures` back to the model as
retry instructions.

## What the curator may and may not touch

`baseInfo` is passed into the brief as **read-only** context and the page
renders it from that module directly, so the guarantee is structural rather
than a matter of the model behaving:

| On the page | Source |
| --- | --- |
| Studio definition, product names, domains, links, statuses, closing line, founder | `lib/baseInfo.ts` — locked |
| Hero line, the What We Are angle, products intro, daily entry, mood | the day's config — generated |

The definition is printed verbatim above the generated "What We Are" copy, so
what reaches the page is the definition itself, never a paraphrase of it. The
curator may name products, but only exactly as written, and generated copy may
not contain a URL or domain at all — every link is rendered from the locked
data, so a link in generated copy is by definition wrong. That check runs on
`heroLine`, both `sectionCopy` fields and `dailyEntry`; `announcement` is exempt
because it is composed from studio news you wrote, which may carry a real link.

Two colour decisions are made in code rather than configured: surfaces and
hairlines are tinted with `textColor` (so components work under a light sky as
well as a dark one), and anything sitting on the accent gets a derived
black-or-white foreground, since the accent is validated for hue harmony, not
for legibility.

## How a day gets made

At 11:00 UTC (6am Central) Vercel Cron hits `/api/generate` with
`Authorization: Bearer $CRON_SECRET`. That route:

1. Gathers the facts — Open-Meteo for the sky, `lib/holidays` for the date,
   Supabase for active announcements and yesterday's edition.
2. Briefs the curator (`claude-sonnet-5`, adaptive thinking, structured output)
   and gets back a candidate SiteConfig.
3. Overwrites `date`, `weather` and `holiday` with the real facts — the curator
   phrases them, it does not get to invent them — then runs `validateConfig`.
4. On failure, sends the specific failure messages back and asks again, up to
   three attempts.
5. Saves the accepted edition to `living_site.configs`, keyed on date.

If all three attempts fail, **nothing is written**. The site keeps rendering
yesterday's edition, and the route returns 502 so the miss shows up red in the
cron log instead of passing silently.

The generator is also the thing that decides whether an announcement appears:
no active announcement forces `announcement` to null, and an active one that the
curator ignores is sent back as a validation failure.

**No secrets belong in this repo.** They live in Vercel env vars and, locally,
in `.env.local` — which is gitignored.
