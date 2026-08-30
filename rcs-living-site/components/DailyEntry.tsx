import { Section } from "@/components/Section";
import { baseInfo } from "@/lib/baseInfo";
import type { Tone } from "@/types/siteConfig";

export function DailyEntry({ entry, tone }: { entry: string; tone: Tone }) {
  return (
    <Section id="todays-entry" label={baseInfo.sections.dailyEntry}>
      <figure
        className="max-w-prose rounded-card border p-gutter"
        style={{ borderColor: "var(--hairline)", backgroundColor: "var(--surface)" }}
      >
        <blockquote className="font-display text-lead text-pretty">{entry}</blockquote>
        <figcaption className="mt-stack text-micro uppercase" style={{ color: "var(--muted)" }}>
          Mood today — {tone}
        </figcaption>
      </figure>
    </Section>
  );
}
