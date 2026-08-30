import type { CSSProperties } from "react";

import { readableOn, withAlpha } from "@/lib/color";
import type { SiteConfig } from "@/types/siteConfig";

/**
 * Turns the validated mood into CSS custom properties. This is the only place
 * SiteConfig touches presentation — every component reads the variables, so
 * nothing downstream has to know how a colour was chosen.
 *
 * Surfaces and hairlines are tinted with `textColor` rather than hardcoded
 * white, so the same components work under a light sky and a dark one.
 */
export function themeVars(config: SiteConfig): CSSProperties {
  const { skyGradient, accentColor, textColor } = config.mood;
  const top = skyGradient[0];
  const bottom = skyGradient[skyGradient.length - 1];

  return {
    "--sky-gradient": `linear-gradient(180deg, ${skyGradient.join(", ")})`,
    "--sky-top": top,
    "--sky-bottom": bottom,
    "--accent": accentColor,
    "--on-accent": readableOn(accentColor),
    "--text": textColor,
    "--bloom-a": withAlpha(accentColor, 0.34),
    "--bloom-b": withAlpha(top, 0.55),
    "--surface": withAlpha(textColor, 0.07),
    "--hairline": withAlpha(textColor, 0.18),
    "--muted": withAlpha(textColor, 0.74),
  } as CSSProperties;
}
