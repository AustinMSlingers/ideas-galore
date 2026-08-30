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
  heroLine: "Low cloud over the ridge, and the lights are still on.",
  sectionCopy: {
    // Sits under the locked definition, so it adds the angle rather than
    // restating what is already printed above it.
    whatWeAre:
      "Grey days are the honest test of it. Nobody is waiting on a brief, so the only thing that moves the work forward is the work.",
    products:
      "Some are earning their keep, some are still being built. Each one ships when it is ready to be used, not when a calendar says so.",
  },
  dailyEntry:
    "Grey all day, the kind that doesn't threaten anything — just sits on the hills and stays. Good weather for the unglamorous half of the work: reading back old code, cutting what nobody uses, and leaving the rest quieter than we found it.",
  announcement: null,
};
