/**
 * CLI runner: streams the sample service through the engine and prints, per
 * tick, the detected slide + confidence + recommendation, then a final accuracy
 * report (correct %, average detection delay in words, false-advance count).
 *
 * Usage:
 *   npm run cli                 # clean run at 130 wpm
 *   npm run cli -- --wpm 160 --drop 0.1 --wrong 0.05 --garbage --quiet
 *
 * This is an operator's-eye view: it is how you'd sanity-check a plan and the
 * engine's behavior before trusting it in a live room.
 */

import { MatchingEngine, type MatchResult } from "./matchingEngine.js";
import { buildSampleService } from "./sampleService.js";
import { buildTaggedTranscript } from "./script.js";
import {
  TranscriptSimulator,
  type GarbageSegment,
  type NoiseConfig,
  type SilenceGap,
} from "./simulator.js";

interface CliOptions {
  wpm: number;
  drop: number;
  wrong: number;
  garbage: boolean;
  quiet: boolean;
  seed: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    wpm: 130,
    drop: 0,
    wrong: 0,
    garbage: false,
    quiet: false,
    seed: 42,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--wpm":
        opts.wpm = Number(argv[++i]);
        break;
      case "--drop":
        opts.drop = Number(argv[++i]);
        break;
      case "--wrong":
        opts.wrong = Number(argv[++i]);
        break;
      case "--seed":
        opts.seed = Number(argv[++i]);
        break;
      case "--garbage":
        opts.garbage = true;
        break;
      case "--quiet":
        opts.quiet = true;
        break;
      default:
        if (a && a.startsWith("--")) {
          console.error(`unknown flag: ${a}`);
          process.exit(2);
        }
    }
  }
  return opts;
}

const BANDS: Record<MatchResult["recommendation"], string> = {
  "auto-advance": "AUTO ",
  recommend: "REC  ",
  hold: "HOLD ",
};

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const plan = buildSampleService();
  const engine = new MatchingEngine(plan);

  const { text, tags, slideOrder } = buildTaggedTranscript(plan);

  // Optional garbage burst + a silence gap dropped into the middle of the
  // service so the report reflects real-world messiness when asked for.
  const garbageSegments: GarbageSegment[] = [];
  const silenceGaps: SilenceGap[] = [];
  if (opts.garbage) {
    const mid = Math.floor(tags.length / 2);
    garbageSegments.push({
      beforeSourceIndex: mid,
      words: "uh sorry can everyone hear the microphone okay".split(" "),
    });
    silenceGaps.push({ beforeSourceIndex: mid + 5, ticks: 8 });
  }

  const noise: NoiseConfig = {
    dropRate: opts.drop,
    wrongRate: opts.wrong,
    wrongWordPool: [],
    garbageSegments,
    silenceGaps,
    seed: opts.seed,
  };

  const sim = new TranscriptSimulator(text, opts.wpm, noise, tags);
  const ticks = sim.run();

  // Title lookup for readable output.
  const titleById = new Map<string, string>();
  for (const section of plan.sections) {
    for (const s of section.slides) titleById.set(s.slideId, s.title);
  }

  // --- accuracy accounting ---
  let correct = 0;
  let scored = 0;
  let falseAdvances = 0;
  // Detection delay: for each true slide (in order), how many tagged words
  // elapsed before the engine's live slide first matched it.
  const firstSeenDelay = new Map<string, number>();
  const wordsIntoSlide = new Map<string, number>();

  console.log(
    `\nservice: ${plan.title}  |  ${slideOrder.length} slides  |  ` +
      `${opts.wpm} wpm  drop=${opts.drop} wrong=${opts.wrong} garbage=${opts.garbage}\n`,
  );

  for (const tick of ticks) {
    const result =
      tick.word === "" ? engine.tickSilence() : engine.pushWord(tick.word);

    if (!opts.quiet) {
      const conf = String(result.confidence).padStart(3, " ");
      const kindMark =
        tick.kind === "word" ? "" : `  [${tick.kind}]`;
      console.log(
        `${BANDS[result.recommendation]} ${conf}  ` +
          `${result.advanced ? "→" : " "} ${titleById.get(result.currentSlideId) ?? result.currentSlideId}` +
          `   (t:${result.breakdown.textMatch} p:${result.breakdown.position} rep:${result.breakdown.repetitionAmbiguity})` +
          kindMark,
      );
    }

    // Score only ticks that have ground truth (skip garbage/silence).
    if (tick.sourceTag) {
      scored++;
      wordsIntoSlide.set(
        tick.sourceTag,
        (wordsIntoSlide.get(tick.sourceTag) ?? 0) + 1,
      );
      if (result.currentSlideId === tick.sourceTag) {
        correct++;
        if (!firstSeenDelay.has(tick.sourceTag)) {
          // Delay = words into this slide before the engine locked on.
          firstSeenDelay.set(
            tick.sourceTag,
            (wordsIntoSlide.get(tick.sourceTag) ?? 1) - 1,
          );
        }
      } else if (result.advanced) {
        // The engine actively moved the live slide to something other than the
        // ground truth on this tick — the error we care most about.
        falseAdvances++;
      }
    }
  }

  const delays = [...firstSeenDelay.values()];
  const avgDelay =
    delays.length > 0
      ? delays.reduce((a, b) => a + b, 0) / delays.length
      : 0;
  const detected = firstSeenDelay.size;

  console.log("\n──────── accuracy report ────────");
  console.log(`ticks scored:        ${scored}`);
  console.log(
    `correct slide:       ${correct}/${scored}  (${pct(correct, scored)}%)`,
  );
  console.log(
    `slides detected:     ${detected}/${slideOrder.length}  ` +
      `(${pct(detected, slideOrder.length)}%)`,
  );
  console.log(`avg detection delay: ${avgDelay.toFixed(1)} words`);
  console.log(`false advances:      ${falseAdvances}`);
  console.log("─────────────────────────────────\n");
}

function pct(n: number, d: number): string {
  return d === 0 ? "0.0" : ((100 * n) / d).toFixed(1);
}

main();
