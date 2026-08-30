/**
 * Small colour toolkit for design validation. No dependencies — the maths is
 * short enough to keep in the repo and it stays readable when the AI pass in a
 * later session has to reason about why a palette was rejected.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  /** Degrees, 0–360. */
  h: number;
  /** 0–1. */
  s: number;
  /** 0–1. */
  l: number;
}

const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_PATTERN.test(value.trim());
}

/** Returns null instead of throwing so callers can report a friendly failure. */
export function hexToRgb(hex: string): Rgb | null {
  if (!isHexColor(hex)) return null;

  let body = hex.trim().slice(1);
  if (body.length === 3) {
    body = body
      .split("")
      .map((c) => c + c)
      .join("");
  }

  return {
    r: parseInt(body.slice(0, 2), 16),
    g: parseInt(body.slice(2, 4), 16),
    b: parseInt(body.slice(4, 6), 16),
  };
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));

  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;

  h *= 60;
  if (h < 0) h += 360;

  return { h, s, l };
}

export function hexToHsl(hex: string): Hsl | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsl(rgb) : null;
}

/** WCAG 2.1 relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function luminanceOf(hex: string): number | null {
  const rgb = hexToRgb(hex);
  return rgb ? relativeLuminance(rgb) : null;
}

/** WCAG contrast ratio, 1:1 to 21:1. Returns null if either colour is invalid. */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminanceOf(a);
  const lb = luminanceOf(b);
  if (la === null || lb === null) return null;

  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Shortest distance between two hues on the colour wheel, 0–180 degrees. */
export function hueDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

/** Rounds for use in human-readable failure messages. */
export function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Picks near-black or near-white for text sitting on `hex`. Used wherever the
 * accent colour carries text: the accent is validated for hue harmony, not for
 * legibility, so the foreground is derived rather than configured.
 */
export function readableOn(hex: string): "#0a0a0a" | "#fafafa" {
  const onDark = contrastRatio(hex, "#fafafa") ?? 1;
  const onLight = contrastRatio(hex, "#0a0a0a") ?? 1;
  return onDark >= onLight ? "#fafafa" : "#0a0a0a";
}

/** `rgba()` string for a hex colour, for tinted surfaces derived from config. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}
