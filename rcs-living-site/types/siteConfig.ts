/**
 * The single object the whole site renders from.
 *
 * Everything here is expected to be regenerated daily (by hand for now, by an
 * AI pass in a later build session). Nothing outside this object is allowed to
 * change day to day — typography, spacing and layout are fixed design tokens.
 */

/** A 3- or 6-digit CSS hex colour, e.g. `#0b1d33`. */
export type HexColor = `#${string}`;

export type WeatherCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "storm"
  | "snow"
  | "wind";

export interface Weather {
  condition: WeatherCondition;
  /** Cloud cover, 0–100. */
  cloudCoverPct: number;
  /** Temperature in degrees Fahrenheit. */
  tempF: number;
}

/**
 * The emotional register of the day. `tone` is the label; the colours are what
 * actually get painted. Both are validated together by `lib/validateConfig`.
 */
export type Tone = "calm" | "bright" | "moody" | "stormy" | "festive";

export interface Mood {
  /** 2–4 hex stops, ordered top → bottom of the sky. */
  skyGradient: HexColor[];
  accentColor: HexColor;
  /** Body/heading colour, must clear WCAG AA against every gradient stop. */
  textColor: HexColor;
  tone: Tone;
}

export interface SectionCopy {
  /** Max 300 characters. */
  whatWeAre: string;
  /** Max 300 characters. */
  products: string;
}

export interface SiteConfig {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  weather: Weather;
  /** Holiday name if the date is one, otherwise null. */
  holiday: string | null;
  mood: Mood;
  /** Max 80 characters. */
  heroLine: string;
  sectionCopy: SectionCopy;
  /** Max 400 characters. */
  dailyEntry: string;
  /** Slim banner copy; null hides the banner entirely. Max 120 characters. */
  announcement: string | null;
}
