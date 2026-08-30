# rcs-living-site

A one-page site that repaints itself daily. Everything that changes day to day
lives in a single `SiteConfig` object; everything that defines the brand —
typography, spacing, layout, base copy — is fixed.

Next.js 14 (app router) · TypeScript · Tailwind.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run check:config # asserts the fallback config passes design validation
npm run typecheck
```

## Shape

| Path | What it is |
| --- | --- |
| `types/siteConfig.ts` | The daily object: date, weather, holiday, mood, copy, announcement. |
| `lib/validateConfig.ts` | Property-based design validation. Returns `{ valid, failures }`. |
| `lib/defaultConfig.ts` | Hand-tuned fallback that passes validation. |
| `lib/baseInfo.ts` | Locked base data. **`products` is a placeholder — replace it.** |
| `lib/color.ts` | Contrast, saturation, luminance and hue maths behind the rules. |
| `lib/theme.ts` | Turns a validated mood into CSS custom properties. |
| `app/page.tsx` | Renders the page from one config. |

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

Two colour decisions are made in code rather than configured: surfaces and
hairlines are tinted with `textColor` (so components work under a light sky as
well as a dark one), and anything sitting on the accent gets a derived
black-or-white foreground, since the accent is validated for hue harmony, not
for legibility.

## Not in this build

Supabase, cron, holiday lookup and any API calls are build session 2. There are
no environment variables yet, and **no secrets belong in this repo** — they will
live in Vercel env vars.
