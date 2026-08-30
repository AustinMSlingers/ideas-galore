import type { Config } from "tailwindcss";

/**
 * Design tokens are FIXED. The daily SiteConfig may only change colour, tone
 * and copy — never type scale, rhythm, radii or timing. Anything that varies
 * per day lives in SiteConfig; anything that defines the brand lives here.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
      // Mobile-first fluid type scale. Every size clamps between a phone and a
      // desktop value so no breakpoint-specific overrides are ever needed.
      fontSize: {
        micro: ["clamp(0.6875rem, 0.66rem + 0.14vw, 0.75rem)", { lineHeight: "1.4", letterSpacing: "0.08em" }],
        small: ["clamp(0.8125rem, 0.78rem + 0.17vw, 0.9375rem)", { lineHeight: "1.6" }],
        body: ["clamp(1rem, 0.95rem + 0.25vw, 1.125rem)", { lineHeight: "1.7" }],
        lead: ["clamp(1.125rem, 1.02rem + 0.5vw, 1.375rem)", { lineHeight: "1.6" }],
        title: ["clamp(1.5rem, 1.25rem + 1.2vw, 2.25rem)", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
        hero: ["clamp(2.5rem, 1.6rem + 4.5vw, 5.5rem)", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
      },
      // Vertical rhythm: one 8px base, named so sections stay consistent.
      spacing: {
        gutter: "clamp(1.25rem, 4vw, 2.5rem)",
        section: "clamp(2.75rem, 5.5vw, 4.5rem)",
        stack: "clamp(1rem, 2.5vw, 1.75rem)",
      },
      maxWidth: {
        prose: "62ch",
        shell: "72rem",
      },
      borderRadius: {
        card: "1.25rem",
        pill: "9999px",
      },
      transitionTimingFunction: {
        drift: "cubic-bezier(0.45, 0, 0.55, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
