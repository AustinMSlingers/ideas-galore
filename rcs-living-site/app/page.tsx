import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { DailyEntry } from "@/components/DailyEntry";
import { ProductsGrid } from "@/components/ProductsGrid";
import { SkyHero } from "@/components/SkyHero";
import { WhatWeAre } from "@/components/WhatWeAre";
import { baseInfo } from "@/lib/baseInfo";
import { getCurrentEdition } from "@/lib/editions";
import { themeVars } from "@/lib/theme";

/**
 * Re-check for a new edition every five minutes. The cron publishes once a day,
 * so this is really about picking up a manual regeneration without a redeploy.
 */
export const revalidate = 300;

export default async function Home() {
  const edition = await getCurrentEdition();
  const config = edition.config;

  if (edition.source === "fallback") {
    console.warn(`[edition] rendering the fallback config — ${edition.note ?? "no reason given"}`);
  }

  return (
    <div style={themeVars(config)}>
      {config.announcement ? (
        <AnnouncementBanner
          announcement={config.announcement}
          accentColor={config.mood.accentColor}
        />
      ) : null}

      <main>
        <SkyHero config={config} />

        <div className="page-body">
          <WhatWeAre copy={config.sectionCopy.whatWeAre} />
          <ProductsGrid copy={config.sectionCopy.products} />
          <DailyEntry entry={config.dailyEntry} tone={config.mood.tone} />
        </div>
      </main>

      {/* Flat sky-top, which is exactly where the page gradient above lands. */}
      <footer
        className="px-gutter pb-[max(2rem,env(safe-area-inset-bottom))] pt-stack"
        style={{ backgroundColor: "var(--sky-top)" }}
      >
        <div
          className="mx-auto flex w-full max-w-shell flex-wrap items-center justify-between gap-3 border-t pt-6 text-micro uppercase"
          style={{ borderColor: "var(--hairline)", color: "var(--muted)" }}
        >
          <span>
            {baseInfo.name} · {baseInfo.location}
          </span>
          <a href={`mailto:${baseInfo.contactEmail}`} className="hover:text-[var(--text)]">
            {baseInfo.contactEmail}
          </a>
        </div>
      </footer>
    </div>
  );
}
