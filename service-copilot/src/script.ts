/**
 * Turn a ServicePlan into a "ground-truth" transcript: the words a
 * congregation/leader would actually say, in arrangement order, each tagged
 * with the slideId it belongs to.
 *
 * This is what the simulator streams and what the CLI scores accuracy against.
 * Because a repeated chorus appears twice in the arrangement, the two runs of
 * identical words carry DIFFERENT slideId tags — which is exactly the
 * disambiguation the engine is graded on.
 */

import { buildArrangement, type ServicePlan } from "./models.js";

export interface TaggedTranscript {
  /** Whitespace-joined transcript text (feed to the simulator as `script`). */
  text: string;
  /** Per-word ground-truth slideId (same length/order as split text). */
  tags: string[];
  /** Arrangement order of slideIds, for reporting. */
  slideOrder: string[];
}

export interface ScriptOptions {
  /**
   * Slides to skip entirely when generating the transcript, by slideId. Models
   * "the worship leader skipped a verse" without touching the plan itself.
   */
  skipSlideIds?: string[];
  /**
   * Extra repetitions of a slide's words, by slideId. e.g. { chorusId: 1 }
   * appends one additional pass of that chorus — "they sang it one more time
   * than the arrangement called for".
   */
  extraRepeats?: Record<string, number>;
}

export function buildTaggedTranscript(
  plan: ServicePlan,
  opts: ScriptOptions = {},
): TaggedTranscript {
  const { ordered } = buildArrangement(plan);
  const skip = new Set(opts.skipSlideIds ?? []);
  const repeats = opts.extraRepeats ?? {};

  const words: string[] = [];
  const tags: string[] = [];
  const slideOrder: string[] = [];

  for (const { slide } of ordered) {
    if (skip.has(slide.slideId)) continue;
    slideOrder.push(slide.slideId);
    const passes = 1 + Math.max(0, repeats[slide.slideId] ?? 0);
    for (let p = 0; p < passes; p++) {
      const slideWords = slide.displayText.split(/\s+/).filter((w) => w.length > 0);
      for (const w of slideWords) {
        words.push(w);
        tags.push(slide.slideId);
      }
    }
  }

  return { text: words.join(" "), tags, slideOrder };
}
