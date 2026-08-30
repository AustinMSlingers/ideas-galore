import type { SiteConfig, Tone } from "@/types/siteConfig";
import {
  contrastRatio,
  hexToHsl,
  hueDistance,
  isHexColor,
  luminanceOf,
  round,
} from "@/lib/color";

/**
 * Design validation for a daily SiteConfig.
 *
 * These are *properties*, not a fixed palette: any colour set that satisfies
 * them will look like it belongs to this site. A later build session hands
 * generated configs to `validateConfig` and feeds `failures` back to the model
 * as retry instructions, so every message names the offending value, the
 * measured number, the threshold, and a concrete way to fix it.
 */

export const DESIGN_RULES = {
  /** WCAG 2.1 AA for normal-size text. */
  MIN_CONTRAST_RATIO: 4.5,
  MIN_GRADIENT_STOPS: 2,
  MAX_GRADIENT_STOPS: 4,
  /** Above this the colour reads as neon rather than as weather. */
  MAX_SATURATION: 0.85,
  /** Adjacent stops further apart than this band instead of blending. */
  MAX_ADJACENT_LUMINANCE_DELTA: 0.3,
  /** Below this the two stops are indistinguishable and the sky looks flat. */
  MIN_ADJACENT_LUMINANCE_DELTA: 0.004,
  /** How far the accent may stray from the nearest gradient hue, in degrees. */
  MAX_ACCENT_HUE_DISTANCE: 60,
  /** Below this saturation a colour has no meaningful hue to compare. */
  NEUTRAL_SATURATION: 0.12,
} as const;

export const COPY_LIMITS = {
  heroLine: 80,
  whatWeAre: 300,
  products: 300,
  dailyEntry: 400,
  announcement: 120,
} as const;

const TONES: readonly Tone[] = ["calm", "bright", "moody", "stormy", "festive"];

export interface ValidationResult {
  valid: boolean;
  failures: string[];
}

/**
 * Configs arriving from a model are cast to SiteConfig before they have been
 * checked, so every field is read defensively here.
 */
type Loose = Record<string, unknown>;

function asRecord(value: unknown): Loose {
  return value && typeof value === "object" ? (value as Loose) : {};
}

function checkCopy(
  failures: string[],
  label: string,
  value: unknown,
  limit: number,
  { allowNull = false }: { allowNull?: boolean } = {},
): void {
  if (value === null || value === undefined) {
    if (!allowNull) failures.push(`${label} is missing — it is required.`);
    return;
  }

  if (typeof value !== "string") {
    failures.push(`${label} must be a string, got ${typeof value}.`);
    return;
  }

  if (value.trim().length === 0) {
    failures.push(`${label} is empty — write real copy or set it to null if it is optional.`);
    return;
  }

  if (value.length > limit) {
    failures.push(
      `${label} is ${value.length} characters, over the ${limit}-character limit. ` +
        `Cut ${value.length - limit} character${value.length - limit === 1 ? "" : "s"}.`,
    );
  }
}

function checkHex(failures: string[], label: string, value: unknown): string | null {
  if (typeof value !== "string" || !isHexColor(value)) {
    failures.push(
      `${label} is not a valid hex colour (got ${JSON.stringify(value)}). ` +
        `Use 3- or 6-digit hex with a leading #, e.g. "#2b3f5c".`,
    );
    return null;
  }
  return value.trim();
}

export function validateConfig(config: SiteConfig): ValidationResult {
  const failures: string[] = [];
  const root = asRecord(config);

  // --- Base fields -----------------------------------------------------
  const date = root.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    failures.push(`date must be an ISO "YYYY-MM-DD" string, got ${JSON.stringify(date)}.`);
  }

  const weather = asRecord(root.weather);
  const cloudCoverPct = weather.cloudCoverPct;
  if (typeof cloudCoverPct !== "number" || !Number.isFinite(cloudCoverPct) || cloudCoverPct < 0 || cloudCoverPct > 100) {
    failures.push(`weather.cloudCoverPct must be a number between 0 and 100, got ${JSON.stringify(cloudCoverPct)}.`);
  }
  if (typeof weather.tempF !== "number" || !Number.isFinite(weather.tempF)) {
    failures.push(`weather.tempF must be a number in Fahrenheit, got ${JSON.stringify(weather.tempF)}.`);
  }
  if (typeof weather.condition !== "string" || weather.condition.trim().length === 0) {
    failures.push(`weather.condition must be a non-empty condition string, got ${JSON.stringify(weather.condition)}.`);
  }

  if (root.holiday !== null && typeof root.holiday !== "string") {
    failures.push(`holiday must be a string or null, got ${typeof root.holiday}.`);
  }

  // --- Copy limits -----------------------------------------------------
  checkCopy(failures, "heroLine", root.heroLine, COPY_LIMITS.heroLine);

  const sectionCopy = asRecord(root.sectionCopy);
  checkCopy(failures, "sectionCopy.whatWeAre", sectionCopy.whatWeAre, COPY_LIMITS.whatWeAre);
  checkCopy(failures, "sectionCopy.products", sectionCopy.products, COPY_LIMITS.products);

  checkCopy(failures, "dailyEntry", root.dailyEntry, COPY_LIMITS.dailyEntry);
  checkCopy(failures, "announcement", root.announcement, COPY_LIMITS.announcement, { allowNull: true });

  // --- Mood ------------------------------------------------------------
  const mood = asRecord(root.mood);

  if (typeof mood.tone !== "string" || !TONES.includes(mood.tone as Tone)) {
    failures.push(`mood.tone must be one of ${TONES.join(", ")} — got ${JSON.stringify(mood.tone)}.`);
  }

  const rawGradient = mood.skyGradient;
  const gradient: string[] = [];

  if (!Array.isArray(rawGradient)) {
    failures.push(
      `mood.skyGradient must be an array of ${DESIGN_RULES.MIN_GRADIENT_STOPS}–${DESIGN_RULES.MAX_GRADIENT_STOPS} hex stops, got ${typeof rawGradient}.`,
    );
  } else {
    if (rawGradient.length < DESIGN_RULES.MIN_GRADIENT_STOPS || rawGradient.length > DESIGN_RULES.MAX_GRADIENT_STOPS) {
      failures.push(
        `mood.skyGradient has ${rawGradient.length} stop${rawGradient.length === 1 ? "" : "s"}; it needs ` +
          `${DESIGN_RULES.MIN_GRADIENT_STOPS}–${DESIGN_RULES.MAX_GRADIENT_STOPS}.`,
      );
    }
    rawGradient.forEach((stop, i) => {
      const hex = checkHex(failures, `mood.skyGradient[${i}]`, stop);
      if (hex) gradient.push(hex);
    });
  }

  const textColor = checkHex(failures, "mood.textColor", mood.textColor);
  const accentColor = checkHex(failures, "mood.accentColor", mood.accentColor);

  // --- Property: text clears WCAG AA against every gradient stop --------
  if (textColor) {
    gradient.forEach((stop, i) => {
      const ratio = contrastRatio(textColor, stop);
      if (ratio !== null && ratio < DESIGN_RULES.MIN_CONTRAST_RATIO) {
        const stopIsLight = (luminanceOf(stop) ?? 0) > (luminanceOf(textColor) ?? 0);
        failures.push(
          `mood.textColor ${textColor} scores ${round(ratio, 2)}:1 against mood.skyGradient[${i}] ${stop}, ` +
            `below the WCAG AA minimum of ${DESIGN_RULES.MIN_CONTRAST_RATIO}:1. ` +
            `${stopIsLight ? "Darken that stop or use a darker textColor" : "Lighten that stop or use a lighter textColor"} until the whole gradient sits on one side of the text.`,
        );
      }
    });
  }

  // --- Property: nothing neon ------------------------------------------
  const saturationTargets: Array<[string, string | null]> = [
    ["mood.accentColor", accentColor],
    ["mood.textColor", textColor],
    ...gradient.map((stop, i): [string, string | null] => [`mood.skyGradient[${i}]`, stop]),
  ];

  for (const [label, hex] of saturationTargets) {
    if (!hex) continue;
    const hsl = hexToHsl(hex);
    if (hsl && hsl.s > DESIGN_RULES.MAX_SATURATION) {
      failures.push(
        `${label} ${hex} is ${Math.round(hsl.s * 100)}% saturated, over the ${Math.round(
          DESIGN_RULES.MAX_SATURATION * 100,
        )}% cap — it reads as neon. Mix in grey or drop the saturation.`,
      );
    }
  }

  // --- Property: adjacent stops blend smoothly -------------------------
  for (let i = 0; i < gradient.length - 1; i += 1) {
    const a = gradient[i];
    const b = gradient[i + 1];
    const la = luminanceOf(a);
    const lb = luminanceOf(b);
    if (la === null || lb === null) continue;

    const delta = Math.abs(la - lb);
    if (delta > DESIGN_RULES.MAX_ADJACENT_LUMINANCE_DELTA) {
      failures.push(
        `mood.skyGradient[${i}] ${a} and [${i + 1}] ${b} differ in luminance by ${round(delta, 3)}, ` +
          `over the ${DESIGN_RULES.MAX_ADJACENT_LUMINANCE_DELTA} limit — the blend will band instead of drifting. ` +
          `Move them closer in brightness, or add an intermediate stop between them.`,
      );
    } else if (delta < DESIGN_RULES.MIN_ADJACENT_LUMINANCE_DELTA) {
      failures.push(
        `mood.skyGradient[${i}] ${a} and [${i + 1}] ${b} differ in luminance by only ${round(delta, 4)}; ` +
          `the gradient will look flat. Separate them by at least ${DESIGN_RULES.MIN_ADJACENT_LUMINANCE_DELTA}.`,
      );
    }
  }

  // --- Property: accent belongs to the gradient's hue family -----------
  if (accentColor && gradient.length > 0) {
    const accentHsl = hexToHsl(accentColor);
    const coloredStops = gradient
      .map((stop, i) => ({ stop, i, hsl: hexToHsl(stop) }))
      .filter((entry) => entry.hsl !== null && entry.hsl.s >= DESIGN_RULES.NEUTRAL_SATURATION);

    // A near-grey accent, or an all-grey sky, has no hue worth comparing.
    if (accentHsl && accentHsl.s >= DESIGN_RULES.NEUTRAL_SATURATION && coloredStops.length > 0) {
      const distances = coloredStops.map((entry) => hueDistance(accentHsl.h, entry.hsl!.h));
      const nearest = Math.min(...distances);

      if (nearest > DESIGN_RULES.MAX_ACCENT_HUE_DISTANCE) {
        const family = coloredStops.map((entry) => `${entry.stop} (${Math.round(entry.hsl!.h)}°)`).join(", ");
        failures.push(
          `mood.accentColor ${accentColor} sits at ${Math.round(accentHsl.h)}°, ${Math.round(nearest)}° from the ` +
            `nearest sky hue — over the ${DESIGN_RULES.MAX_ACCENT_HUE_DISTANCE}° limit, so it reads as a foreign colour. ` +
            `Pull it toward the gradient family: ${family}.`,
        );
      }
    }
  }

  return { valid: failures.length === 0, failures };
}

/**
 * The rules as instructions, generated from the same constants the checks use
 * so the curator's brief can never drift from what is actually enforced.
 */
export function describeDesignRules(): string {
  const r = DESIGN_RULES;
  return [
    `- textColor must reach a WCAG AA contrast ratio of at least ${r.MIN_CONTRAST_RATIO}:1 against EVERY stop in skyGradient. In practice this means the whole sky sits on one side of the text: a light textColor needs a uniformly deep sky, a dark textColor a uniformly pale one.`,
    `- skyGradient has ${r.MIN_GRADIENT_STOPS}–${r.MAX_GRADIENT_STOPS} stops, ordered top of the sky to bottom.`,
    `- No colour may exceed ${Math.round(r.MAX_SATURATION * 100)}% HSL saturation. Weather colours, not neon.`,
    `- Adjacent stops must differ in relative luminance by no more than ${r.MAX_ADJACENT_LUMINANCE_DELTA} (so the blend does not band) and at least ${r.MIN_ADJACENT_LUMINANCE_DELTA} (so it does not look flat).`,
    `- accentColor must sit within ${r.MAX_ACCENT_HUE_DISTANCE}° of the nearest saturated sky hue, so it reads as part of the same family rather than a foreign colour.`,
    `- Copy limits, in characters: heroLine ${COPY_LIMITS.heroLine}, sectionCopy.whatWeAre ${COPY_LIMITS.whatWeAre}, sectionCopy.products ${COPY_LIMITS.products}, dailyEntry ${COPY_LIMITS.dailyEntry}, announcement ${COPY_LIMITS.announcement}.`,
  ].join("\n");
}
