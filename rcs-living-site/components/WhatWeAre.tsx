import { Section } from "@/components/Section";
import { baseInfo } from "@/lib/baseInfo";

export function WhatWeAre({ copy }: { copy: string }) {
  return (
    <Section id="what-we-are" label={baseInfo.sections.whatWeAre}>
      <p className="max-w-prose font-display text-title text-pretty">{copy}</p>
    </Section>
  );
}
