# Service Copilot — MVP 1: Matching Engine

A deterministic TypeScript engine that keeps a worship service's projected slide
in sync with a live transcript, fed one word at a time.

**MVP 1 scope: engine only.** No UI, no audio capture, no network APIs. Pure,
deterministic logic that is easy to test and reason about. Audio, projection,
and import pipelines come later; this is the brain they will plug into.

## Why this exists

Live services are driven by a person clicking through slides. They lose their
place, mis-time a chorus, or get pulled away. Service Copilot watches the
transcript and either advances the slide automatically (when it is very sure) or
recommends the next slide to an operator (when it is not) — and, above all,
**never confidently jumps to the wrong slide.** Missing an advance is a shrug;
a wrong advance is a public failure. Every design choice follows from that
asymmetry.

## What's here

```
src/
  models.ts          ServicePlan / Section / Slide + arrangement flattening
  text.ts            normalization, token-set ratio, n-gram containment
  fingerprint.ts     rolling word-window
  matchingEngine.ts  the MatchingEngine class (scoring, tiers, repetition, policy)
  simulator.ts       transcript simulator: WPM + seeded, injectable noise
  script.ts          build a tagged ground-truth transcript from a plan
  sampleService.ts   a full sample Sunday service
  cli.ts             CLI runner + accuracy report
test/                Vitest suite covering the hard cases
docs/MATCHING.md     how the algorithm works and why
```

## Quick start

```bash
npm install

# Run the sample service through the engine (per-tick trace + accuracy report):
npm run cli

# Add noise / speed:
npm run cli -- --wpm 160 --drop 0.1 --wrong 0.05 --garbage --quiet

# Tests and typecheck:
npm test
npm run typecheck
```

### CLI flags

| Flag        | Default | Meaning                                       |
| ----------- | ------- | --------------------------------------------- |
| `--wpm N`   | 130     | transcript speed (words per minute)           |
| `--drop R`  | 0       | probability each word is dropped              |
| `--wrong R` | 0       | probability each word is replaced with a wrong word |
| `--garbage` | off     | inject a garbage burst + a silence gap mid-service |
| `--seed N`  | 42      | PRNG seed (determinism)                        |
| `--quiet`   | off     | suppress the per-tick trace, print only the report |

The accuracy report prints **correct %**, **average detection delay (in words)**,
and **false-advance count** — the last being the metric that actually matters.

## The matching engine in one paragraph

Keep a short rolling window of recent words. Score candidate slides by blending a
length-robust fuzzy **text match** (token-set ratio + directional n-gram
containment) with a **position prior** that expects forward, one-slide-at-a-time
motion; search only the current/next/prev slides first and widen to the rest of
the service only when that fails. Disambiguate repeated content (two identical
choruses) using arrangement position and recent history, and surface the residual
**repetition ambiguity** as a confidence penalty. Emit a slide, a 0–100
confidence, and a per-signal breakdown. Auto-advance only at ≥ 92 **and** when the
target slide's own policy allows it; otherwise recommend or hold.

Full details and rationale: [`docs/MATCHING.md`](docs/MATCHING.md).

## Using it as a library

```ts
import { MatchingEngine, buildSampleService } from "./src/index.js";

const engine = new MatchingEngine(buildSampleService());

const result = engine.pushWord("amazing");
// result.currentSlideId, result.confidence, result.recommendation,
// result.breakdown = { textMatch, position, repetitionAmbiguity }

engine.jumpTo(someSlideId); // operator override; window resets for fast resync
engine.tickSilence();       // no word this tick -> hold current slide
```

## Design guarantees

- **Deterministic.** No wall-clock, no unseeded randomness, no I/O. Same inputs
  ⇒ same outputs (there is a test for it).
- **Safety-biased.** Under 12% dropped + 6% wrong words plus garbage and silence,
  the sample service still reaches ~90%+ of slides with **zero false advances**
  in the test suite.
- **Future-proofed.** `Slide.source` (`manual` | `import` | `ocr`) is carried
  through the model now — always `manual` in MVP 1 — so import/OCR pipelines slot
  in without a schema change.
