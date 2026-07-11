/**
 * Transcript simulator: turns a script into a word-by-word stream at a
 * configurable words-per-minute, with injectable, *deterministic* noise.
 *
 * Real speech-to-text is imperfect and the engine must be robust to it. Rather
 * than depend on a live recognizer, we model the three failure modes that
 * matter for slide matching:
 *   - dropped words   (recognizer misses a word)
 *   - wrong words     (recognizer substitutes a plausible-but-wrong word)
 *   - garbage segments(a burst of unrelated tokens: cough, side conversation,
 *                      a baby crying picked up by the mic)
 * plus silence (nobody speaking).
 *
 * All randomness is seeded so a given (script, config, seed) always yields the
 * exact same stream — essential for reproducible tests.
 */

/** A single tick emitted by the simulator. */
export interface TranscriptTick {
  /** The word for this tick, or "" for a silence tick. */
  word: string;
  /** Simulated wall-clock offset from the start, in milliseconds. Metadata
   *  only — the engine consumes ticks, not time — but useful for realistic
   *  logging and future audio sync. */
  timestampMs: number;
  /** Classification of what this tick represents, for reporting/debugging. */
  kind: "word" | "silence" | "garbage" | "wrong";
  /** The ground-truth source word this tick corresponds to (for accuracy
   *  scoring). null for injected silence/garbage that has no source. */
  sourceWord: string | null;
  /** Ground-truth label for the source word (e.g. the slideId it came from),
   *  supplied via the constructor's `tags`. null for injected garbage/silence.
   *  This is what lets the CLI compute accuracy even when noise perturbs the
   *  actual words. */
  sourceTag: string | null;
}

export interface NoiseConfig {
  /** Probability [0,1] a source word is dropped entirely. */
  dropRate: number;
  /** Probability [0,1] a source word is replaced by a wrong word. */
  wrongRate: number;
  /** Pool of wrong words to substitute in. */
  wrongWordPool: string[];
  /** Garbage bursts keyed by the source-word index they precede. */
  garbageSegments: GarbageSegment[];
  /** Silence gaps keyed by the source-word index they precede. */
  silenceGaps: SilenceGap[];
  /** PRNG seed — same seed => same stream. */
  seed: number;
}

export interface GarbageSegment {
  /** Insert this burst just before emitting the source word at this index. */
  beforeSourceIndex: number;
  words: string[];
}

export interface SilenceGap {
  beforeSourceIndex: number;
  /** Number of silence ticks to emit. */
  ticks: number;
}

export const NO_NOISE: NoiseConfig = {
  dropRate: 0,
  wrongRate: 0,
  wrongWordPool: [],
  garbageSegments: [],
  silenceGaps: [],
  seed: 1,
};

const DEFAULT_WRONG_POOL = [
  "the",
  "and",
  "love",
  "grace",
  "lord",
  "sing",
  "morning",
  "people",
  "again",
  "forever",
];

/**
 * mulberry32 — a tiny, fast, well-distributed seeded PRNG. We implement our own
 * (rather than Math.random) precisely so the stream is deterministic and does
 * not depend on wall clock or platform.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class TranscriptSimulator {
  private readonly words: string[];
  private readonly tags: (string | null)[];
  private readonly wpm: number;
  private readonly noise: NoiseConfig;

  /**
   * @param script The transcript text; split on whitespace into words.
   * @param tags   Optional ground-truth label per word (same length as the
   *               split script), e.g. the slideId each word belongs to. When
   *               provided out of sync with the word count it is ignored slot
   *               by slot (missing => null).
   */
  constructor(
    script: string,
    wpm = 130,
    noise: NoiseConfig = NO_NOISE,
    tags?: (string | null)[],
  ) {
    if (wpm <= 0) throw new Error("wpm must be > 0");
    // Split the raw script into whitespace words. Normalization happens inside
    // the engine, so the simulator can pass words through verbatim (including
    // wrong/garbage words with their own casing/punctuation).
    this.words = script.split(/\s+/).filter((w) => w.length > 0);
    this.tags = this.words.map((_, i) => tags?.[i] ?? null);
    this.wpm = wpm;
    this.noise = { ...NO_NOISE, ...noise };
  }

  /**
   * Produce the full deterministic tick stream. Returning an array (not a lazy
   * generator) keeps callers simple and the whole thing is tiny.
   */
  run(): TranscriptTick[] {
    const rand = mulberry32(this.noise.seed);
    const wrongPool =
      this.noise.wrongWordPool.length > 0
        ? this.noise.wrongWordPool
        : DEFAULT_WRONG_POOL;
    const msPerWord = 60_000 / this.wpm;

    const garbageByIndex = new Map<number, string[]>();
    for (const g of this.noise.garbageSegments) {
      garbageByIndex.set(g.beforeSourceIndex, g.words);
    }
    const silenceByIndex = new Map<number, number>();
    for (const s of this.noise.silenceGaps) {
      silenceByIndex.set(s.beforeSourceIndex, s.ticks);
    }

    const ticks: TranscriptTick[] = [];
    let clock = 0;
    const emit = (t: Omit<TranscriptTick, "timestampMs">) => {
      ticks.push({ ...t, timestampMs: Math.round(clock) });
      clock += msPerWord;
    };

    for (let i = 0; i < this.words.length; i++) {
      // Injected silence/garbage fires *before* the source word at this index.
      const silence = silenceByIndex.get(i);
      if (silence) {
        for (let s = 0; s < silence; s++) {
          emit({ word: "", kind: "silence", sourceWord: null, sourceTag: null });
        }
      }
      const garbage = garbageByIndex.get(i);
      if (garbage) {
        for (const g of garbage) {
          emit({ word: g, kind: "garbage", sourceWord: null, sourceTag: null });
        }
      }

      const source = this.words[i]!;
      const tag = this.tags[i]!;

      // Drop?
      if (rand() < this.noise.dropRate) {
        continue; // recognizer missed this word entirely
      }
      // Wrong?
      if (rand() < this.noise.wrongRate) {
        const wrong = wrongPool[Math.floor(rand() * wrongPool.length)]!;
        // A wrong word still occurred *during* the true slide, so it keeps the
        // ground-truth tag for accuracy scoring — the engine is expected to
        // ride out the noise and stay on the correct slide.
        emit({ word: wrong, kind: "wrong", sourceWord: source, sourceTag: tag });
        continue;
      }
      emit({ word: source, kind: "word", sourceWord: source, sourceTag: tag });
    }

    // Trailing silence/garbage anchored just past the end of the script.
    const tailSilence = silenceByIndex.get(this.words.length);
    if (tailSilence) {
      for (let s = 0; s < tailSilence; s++) {
        emit({ word: "", kind: "silence", sourceWord: null, sourceTag: null });
      }
    }
    const tailGarbage = garbageByIndex.get(this.words.length);
    if (tailGarbage) {
      for (const g of tailGarbage) {
        emit({ word: g, kind: "garbage", sourceWord: null, sourceTag: null });
      }
    }

    return ticks;
  }
}
