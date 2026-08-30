import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { DailyEntry } from "@/components/DailyEntry";
import { ProductsGrid } from "@/components/ProductsGrid";
import { SkyHero } from "@/components/SkyHero";
import { WhatWeAre } from "@/components/WhatWeAre";
import { baseInfo } from "@/lib/baseInfo";
import { defaultConfig } from "@/lib/defaultConfig";
import { themeVars } from "@/lib/theme";
import { validateConfig } from "@/lib/validateConfig";
import type { SiteConfig } from "@/types/siteConfig";

/**
 * Build session 1 renders straight from the hand-tuned fallback. A later
 * session swaps this for the stored config of the day and falls back here when
 * that config is missing or fails validation.
 */
function getConfig(): SiteConfig {
  return defaultConfig;
}

export default function Home() {
  const config = getConfig();

  if (process.env.NODE_ENV !== "production") {
    const { valid, failures } = validateConfig(config);
    if (!valid) {
      console.warn(`[site-config] ${failures.length} design failure(s):`);
      for (const failure of failures) console.warn(`  - ${failure}`);
    }
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
