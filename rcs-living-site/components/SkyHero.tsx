import { baseInfo } from "@/lib/baseInfo";
import type { SiteConfig } from "@/types/siteConfig";

const CONDITION_LABEL: Record<string, string> = {
  clear: "Clear",
  "partly-cloudy": "Partly cloudy",
  cloudy: "Cloudy",
  overcast: "Overcast",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  storm: "Storm",
  snow: "Snow",
  wind: "Wind",
};

function formatDate(iso: string): string {
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Full-viewport animated sky. Everything visual here comes from `mood`. */
export function SkyHero({ config }: { config: SiteConfig }) {
  const { weather, holiday, heroLine, date } = config;
  const condition = CONDITION_LABEL[weather.condition] ?? weather.condition;

  return (
    <section className="sky flex min-h-[100svh] flex-col justify-between px-gutter pb-gutter pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="sky__layer sky__base" aria-hidden="true" />
      <div className="sky__layer sky__bloom" aria-hidden="true" />
      <div className="sky__grain" aria-hidden="true" />

      <header className="mx-auto flex w-full max-w-shell items-baseline justify-between gap-4">
        <span className="text-micro font-semibold uppercase" style={{ letterSpacing: "0.18em" }}>
          {baseInfo.shortName}
        </span>
        <span className="text-micro uppercase" style={{ color: "var(--muted)" }}>
          {baseInfo.location}
        </span>
      </header>

      <div className="mx-auto flex w-full max-w-shell flex-1 flex-col justify-center py-section">
        <h1 className="max-w-[18ch] font-display text-hero text-balance">{heroLine}</h1>
        <p className="mt-stack max-w-prose text-lead" style={{ color: "var(--muted)" }}>
          {baseInfo.shortDefinition}
        </p>
      </div>

      <footer className="mx-auto flex w-full max-w-shell flex-wrap items-center gap-x-4 gap-y-2 text-micro uppercase">
        <span className="inline-flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-pill"
            style={{ backgroundColor: "var(--accent)" }}
            aria-hidden="true"
          />
          {formatDate(date)}
        </span>
        <span style={{ color: "var(--muted)" }}>
          {condition} · {Math.round(weather.tempF)}°F · {Math.round(weather.cloudCoverPct)}% cloud
        </span>
        {holiday ? (
          <span
            className="rounded-pill border px-3 py-1"
            style={{ borderColor: "var(--hairline)", backgroundColor: "var(--surface)" }}
          >
            {holiday}
          </span>
        ) : null}
      </footer>
    </section>
  );
}
