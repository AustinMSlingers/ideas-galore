import { describe, it, expect } from "vitest";
import {
  MatchingEngine,
  type MatchResult,
} from "../src/matchingEngine.js";
import { buildSampleService, slideIdByTitle } from "../src/sampleService.js";
import { buildTaggedTranscript } from "../src/script.js";
import { TranscriptSimulator, type NoiseConfig } from "../src/simulator.js";

const plan = buildSampleService();
const id = (title: string) => slideIdByTitle(plan, title);

/** Feed a chunk of raw text word-by-word; return the per-word results. */
function feed(engine: MatchingEngine, text: string): MatchResult[] {
  const results: MatchResult[] = [];
  for (const w of text.split(/\s+/).filter((x) => x.length > 0)) {
    results.push(engine.pushWord(w));
  }
  return results;
}

function fresh(): MatchingEngine {
  return new MatchingEngine(buildSampleService());
}

describe("end-to-end sample service (clean transcript)", () => {
  it("tracks the whole service with no false advances and 100% slide coverage", () => {
    const engine = fresh();
    const { text, tags, slideOrder } = buildTaggedTranscript(plan);
    const sim = new TranscriptSimulator(text, 130, undefined, tags);

    const detected = new Set<string>();
    let falseAdvances = 0;
    for (const tick of sim.run()) {
      const r =
        tick.word === "" ? engine.tickSilence() : engine.pushWord(tick.word);
      if (tick.sourceTag && r.currentSlideId === tick.sourceTag) {
        detected.add(tick.sourceTag);
      } else if (tick.sourceTag && r.advanced) {
        falseAdvances++;
      }
    }
    // Every slide in the arrangement is reached at some point.
    expect(detected.size).toBe(slideOrder.length);
    // The safety-critical metric: the engine never auto-advanced to a slide the
    // congregation was not actually on.
    expect(falseAdvances).toBe(0);
  });
});

describe("repeated chorus disambiguation", () => {
  it("advances through the two chorus instances in arrangement order", () => {
    const engine = fresh();
    // Sing up to and through both choruses in order.
    engine.jumpTo(id("Verse 2"));
    feed(engine, plan.sections[1]!.slides[1]!.displayText); // verse 2
    const afterC1 = feed(engine, plan.sections[1]!.slides[2]!.displayText); // chorus 1
    expect(engine.currentSlide.title).toBe("Chorus (1st time)");

    feed(engine, plan.sections[1]!.slides[3]!.displayText); // verse 3
    expect(engine.currentSlide.title).toBe("Verse 3");

    feed(engine, plan.sections[1]!.slides[4]!.displayText); // chorus 2
    expect(engine.currentSlide.title).toBe("Chorus (2nd time)");

    // The repetition-ambiguity signal is exposed in the breakdown.
    expect(
      afterC1.some((r) => r.breakdown.repetitionAmbiguity >= 0),
    ).toBe(true);
  });

  it("holds on the final chorus when it is sung one extra time (no false advance)", () => {
    const engine = fresh();
    // Get onto the 2nd (final) chorus.
    engine.jumpTo(id("Chorus (2nd time)"));
    feed(engine, plan.sections[1]!.slides[4]!.displayText);
    expect(engine.currentSlide.title).toBe("Chorus (2nd time)");

    // Sing the chorus AGAIN — one more time than the arrangement planned.
    const extra = feed(engine, plan.sections[1]!.slides[4]!.displayText);

    // It must NOT false-advance to the following slide (Ending) or flip back to
    // the first chorus instance. A repeatable slide absorbs the extra repeat.
    expect(engine.currentSlide.title).toBe("Chorus (2nd time)");
    const advancedAway = extra.some(
      (r) => r.advanced && r.predictedSlide.title !== "Chorus (2nd time)",
    );
    expect(advancedAway).toBe(false);
  });
});

describe("skipped verse", () => {
  it("follows the transcript to Verse 3 when Verse 2 (and the chorus) are skipped", () => {
    const engine = fresh();
    engine.jumpTo(id("Verse 1"));
    feed(engine, plan.sections[1]!.slides[0]!.displayText); // verse 1
    expect(engine.currentSlide.title).toBe("Verse 1");

    // The leader jumps straight to Verse 3, skipping Verse 2 and the chorus.
    feed(engine, plan.sections[1]!.slides[3]!.displayText); // verse 3
    expect(engine.currentSlide.title).toBe("Verse 3");
  });
});

describe("sermon paraphrase vs trigger phrase", () => {
  it("does NOT auto-advance on a paraphrase of a sermon point", () => {
    const engine = fresh();
    engine.jumpTo(id("Point 1"));

    // A loose paraphrase of Point 2 ("Grace sets us free from the weight of
    // sin"). Same idea, different words.
    const results = feed(
      engine,
      "grace liberates us and lifts the heavy burden of our wrongdoing",
    );

    // The engine may recommend, but must not auto-take Point 2.
    expect(engine.currentSlide.title).toBe("Point 1");
    const autoTookPoint2 = results.some(
      (r) => r.advanced && r.predictedSlide.title === "Point 2",
    );
    expect(autoTookPoint2).toBe(false);
  });

  it("DOES auto-advance on the exact trigger phrase", () => {
    const engine = fresh();
    engine.jumpTo(id("Point 1"));
    feed(engine, "Point two: Grace sets us free from the weight of sin.");
    expect(engine.currentSlide.title).toBe("Point 2");
  });
});

describe("manual jump then fast resync", () => {
  it("re-locks within a few words after an operator jump", () => {
    const engine = fresh();
    // Start by tracking the opening slide.
    feed(engine, plan.sections[0]!.slides[0]!.displayText);

    // Operator manually jumps far ahead to the scripture reading.
    engine.jumpTo(id("Ephesians 2:8-9"));
    expect(engine.currentSlide.title).toBe("Ephesians 2:8-9");

    // Feed that slide's words; count how many until confidence is auto-safe.
    let wordsToLock = 0;
    let locked = false;
    for (const w of plan.sections[3]!.slides[0]!.displayText
      .split(/\s+/)
      .filter((x) => x.length > 0)) {
      wordsToLock++;
      const r = engine.pushWord(w);
      if (r.confidence >= 92 && r.currentSlideId === id("Ephesians 2:8-9")) {
        locked = true;
        break;
      }
    }
    expect(locked).toBe(true);
    // "Fast" = a handful of words, thanks to the window reset on jump.
    expect(wordsToLock).toBeLessThanOrEqual(6);
  });
});

describe("garbage transcript segment", () => {
  it("drops confidence and does not advance during garbage", () => {
    const engine = fresh();
    engine.jumpTo(id("Ephesians 2:8-9"));
    feed(engine, plan.sections[3]!.slides[0]!.displayText);
    const before = engine.currentSlide.title;

    const garbage = feed(
      engine,
      "uh sorry can everyone hear the microphone okay testing testing",
    );

    // Confidence must fall into the non-auto range at some point during the
    // garbage, and the live slide must not change.
    const minConf = Math.min(...garbage.map((r) => r.confidence));
    expect(minConf).toBeLessThan(92);
    expect(engine.currentSlide.title).toBe(before);
    expect(garbage.every((r) => !r.advanced)).toBe(true);
  });
});

describe("long silence", () => {
  it("holds the current slide across a long silence", () => {
    const engine = fresh();
    engine.jumpTo(id("Ephesians 2:10"));
    feed(engine, plan.sections[3]!.slides[1]!.displayText);
    const held = engine.currentSlide.title;

    for (let i = 0; i < 40; i++) {
      const r = engine.tickSilence();
      expect(r.recommendation).toBe("hold");
      expect(r.advanced).toBe(false);
    }
    expect(engine.currentSlide.title).toBe(held);
  });
});

describe("noise robustness (dropped + wrong words)", () => {
  it("still reaches every slide with zero false advances under noise", () => {
    const engine = fresh();
    const { text, tags, slideOrder } = buildTaggedTranscript(plan);
    const noise: NoiseConfig = {
      dropRate: 0.12,
      wrongRate: 0.06,
      wrongWordPool: [],
      garbageSegments: [{ beforeSourceIndex: 120, words: ["cough", "cough"] }],
      silenceGaps: [{ beforeSourceIndex: 200, ticks: 10 }],
      seed: 7,
    };
    const sim = new TranscriptSimulator(text, 150, noise, tags);

    const detected = new Set<string>();
    let falseAdvances = 0;
    for (const tick of sim.run()) {
      const r =
        tick.word === "" ? engine.tickSilence() : engine.pushWord(tick.word);
      if (tick.sourceTag && r.currentSlideId === tick.sourceTag) {
        detected.add(tick.sourceTag);
      } else if (tick.sourceTag && r.advanced) {
        falseAdvances++;
      }
    }
    // Noise may cost a little accuracy but must never cause a wrong advance.
    // This is the property that actually matters live: degrade to "hold", never
    // guess onto the wrong slide.
    expect(falseAdvances).toBe(0);
    // Coverage stays high even under compound noise (12% drops, 6% wrong words,
    // a garbage burst and a 10-tick silence). A slide or two whose trigger got
    // eaten by drops may be missed — acceptable, because the cost is a missed
    // auto-advance (operator nudges it), not a wrong one.
    expect(detected.size).toBeGreaterThanOrEqual(slideOrder.length - 2);
  });
});

describe("determinism", () => {
  it("produces identical results for identical inputs", () => {
    const run = () => {
      const engine = fresh();
      const { text, tags } = buildTaggedTranscript(plan);
      const sim = new TranscriptSimulator(text, 130, undefined, tags);
      return sim
        .run()
        .map((t) =>
          t.word === "" ? engine.tickSilence() : engine.pushWord(t.word),
        )
        .map((r) => `${r.currentSlideId}:${r.confidence}:${r.recommendation}`)
        .join("|");
    };
    expect(run()).toBe(run());
  });
});
