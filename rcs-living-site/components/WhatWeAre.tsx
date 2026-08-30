import { Section } from "@/components/Section";
import { baseInfo } from "@/lib/baseInfo";

/**
 * The definition is rendered verbatim from `baseInfo` and cannot be touched by
 * a generated config. The day's copy sits underneath it as the angle, not as a
 * replacement — otherwise "the definition" would only ever reach the page as an
 * AI paraphrase of itself.
 */
export function WhatWeAre({ copy }: { copy: string }) {
  return (
    <Section id="what-we-are" label={baseInfo.sections.whatWeAre}>
      <p className="max-w-prose font-display text-title text-pretty">{baseInfo.definition}</p>
      <p className="mt-stack max-w-prose text-body text-pretty" style={{ color: "var(--muted)" }}>
        {copy}
      </p>
    </Section>
  );
}
