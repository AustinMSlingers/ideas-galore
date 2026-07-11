/**
 * Rolling word-window fingerprint of the most recent transcript words.
 *
 * Live speech-to-text arrives one (noisy) word at a time. Matching the entire
 * transcript-so-far against slides would be both slow and wrong: the operator
 * cares about what is being said RIGHT NOW, not what was said three slides ago.
 * So we keep only a bounded window of the most recent words and match against
 * that. The window size is the single most important tuning knob:
 *   - too small  -> not enough context to distinguish similar lines
 *   - too large  -> the window straddles a slide boundary for too long, so the
 *                   engine is slow to advance and slow to recover from noise
 */

import { normalize, tokenize } from "./text.js";

export interface FingerprintTick {
  /** The single normalized word just ingested (empty string for silence). */
  word: string;
  /** How many real (non-silence) words are currently in the window. */
  windowSize: number;
}

export class RollingFingerprint {
  private readonly capacity: number;
  private readonly words: string[] = [];
  /** Count of consecutive silence ticks since the last real word. Used by the
   *  engine to decide when the window is "stale" and should stop driving
   *  advances (long silence => hold). */
  private silenceRun = 0;

  constructor(capacity = 12) {
    if (capacity < 1) throw new Error("fingerprint capacity must be >= 1");
    this.capacity = capacity;
  }

  /**
   * Ingest one raw transcript token. A word may normalize to multiple tokens
   * (or none, if it was pure punctuation); each resulting token occupies a
   * window slot so multi-word captions don't secretly overflow the window.
   */
  push(rawWord: string): FingerprintTick {
    const tokens = tokenize(normalize(rawWord));
    if (tokens.length === 0) {
      // Nothing usable arrived (punctuation-only / empty). Treat as silence so
      // the staleness counter still advances.
      return this.pushSilence();
    }
    this.silenceRun = 0;
    for (const t of tokens) {
      this.words.push(t);
      if (this.words.length > this.capacity) this.words.shift();
    }
    return { word: tokens[tokens.length - 1]!, windowSize: this.words.length };
  }

  /** Record a silence tick without changing the window contents. */
  pushSilence(): FingerprintTick {
    this.silenceRun += 1;
    return { word: "", windowSize: this.words.length };
  }

  /** Current window tokens (most recent last). Returned as a copy is avoided on
   *  the hot path; callers must not mutate. */
  tokens(): readonly string[] {
    return this.words;
  }

  /** Consecutive silence ticks since the last real word. */
  silenceTicks(): number {
    return this.silenceRun;
  }

  /**
   * After a manual jump we want the engine to re-lock quickly onto the new
   * slide rather than fight stale context from wherever we were. Clearing the
   * window makes the next few real words dominate immediately — this is the
   * mechanism behind "fast resync after a manual jump-to-slide".
   */
  reset(): void {
    this.words.length = 0;
    this.silenceRun = 0;
  }
}
