import type { SiteConfig } from "@/types/siteConfig";

/**
 * Hand-tuned fallback. This is what the site renders when there is no config
 * for today — a generation failure, a cold start, or local development.
 *
 * It is deliberately conservative: a dusk sky that clears WCAG AA comfortably
 * at every stop, a warm accent inside the sky's own hue family, and copy well
 * under every limit. `npm run check:config` asserts it still passes.
 *
 * `date` is a literal so the fallback is deterministic; the generated config
 * that replaces it carries the real date.
 */
export const defaultConfig: SiteConfig = {
  date: "2026-01-01",
  weather: {
    condition: "overcast",
    cloudCoverPct: 85,
    tempF: 58,
  },
  holiday: null,
  mood: {
    skyGradient: ["#101a2e", "#233150", "#4a3f5c", "#7a5560"],
    accentColor: "#c98a6b",
    textColor: "#f5f2ee",
    tone: "calm",
  },
  heroLine: "Low cloud over the ridge, and the workshop lights are on.",
  sectionCopy: {
    whatWeAre:
      "A small studio that builds software the way you'd build a shed: carefully, in the open, and only as big as it needs to be. Everything here is made by a handful of people who use it themselves.",
    products:
      "Some of these are finished, some are still on the bench. We ship when a thing earns its keep, not when the calendar says to.",
  },
  dailyEntry:
    "Grey all day, the kind that doesn't threaten anything — just sits on the hills and stays. Good weather for the unglamorous half of the work: reading back old code, cutting what nobody uses, and leaving the rest quieter than we found it.",
  announcement: null,
};
