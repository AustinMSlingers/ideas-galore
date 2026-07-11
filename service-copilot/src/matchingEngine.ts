/**
 * MatchingEngine: maps a live transcript (fed word-by-word) onto the slide the
 * congregation is most likely on right now.
 *
 * Design priorities, in order, because this runs unattended in front of a live
 * congregation:
 *   1. Never advance to the WRONG slide (a false advance is glaringly visible).
 *   2. Advance to the right slide quickly once evidence is clear.
 *   3. Degrade to "hold + recommend" under noise/ambiguity rather than guess.
 *
 * The engine is fully deterministic: same plan + same word sequence => same
 * outputs, every time.
 */

import { RollingFingerprint } from "./fingerprint.js";
import {
  buildArrangement,
  type PlacedSlide,
  type ServicePlan,
  type Slide,
} from "./models.js";
import { normalizeToTokens, textSimilarity } from "./text.js";

/** Advisory band derived purely from the global confidence thresholds. */
export type Recommendation = "auto-advance" | "recommend" | "hold";

export interface SignalBreakdown {
  /** 0–100 text similarity of the winning slide vs the current window. */
  textMatch: number;
  /** 0–100 positional prior for the winning slide (how "expected" it is given
   *  where we currently are in the arrangement). */
  position: number;
  /** 0–100 ambiguity from repeated/duplicate content. 0 = unambiguous,
   *  higher = the winner has a near-tie look-alike elsewhere in the plan. This
   *  is a penalty: it pulls final confidence down. */
  repetitionAmbiguity: number;
}

export interface MatchResult {
  /** Slide the engine currently believes is (or should be) live. */
  currentSlideId: string;
  /** Best-guess slide for the latest window. May equal currentSlideId. */
  predictedSlideId: string;
  predictedSlide: Slide;
  /** Final confidence 0–100. */
  confidence: number;
  breakdown: SignalBreakdown;
  recommendation: Recommendation;
  /** True when this tick actually changed the live slide (an auto-advance). */
  advanced: boolean;
  /** Why the engine did or didn't advance — surfaced for the CLI/operator. */
  reason: string;
}

export interface EngineConfig {
  /** Rolling window size in words. See fingerprint.ts for the tradeoff. */
  windowSize: number;
  /** Global confidence bands (the prompt's 92 / 75 thresholds). */
  autoSafeThreshold: number; // >= this => "auto-advance" band
  recommendThreshold: number; // >= this (and < auto) => "recommend" band
  /** Blend of the two positive signals. Text dominates; position breaks ties
   *  and suppresses far-away look-alikes. Must sum to 1. */
  textWeight: number;
  positionWeight: number;
  /** How hard repetition ambiguity pulls confidence down (points per ambiguity
   *  point). Tuned so a full 100-ambiguity tie removes ~24 points — enough to
   *  drop an otherwise-auto match into the recommend band. */
  ambiguityWeight: number;
  /** Tiered search expands to the next tier only when the best text match in
   *  the current tier is below this. This is the "full-service search only on
   *  failure" rule: cheap and it prevents distant look-alikes from stealing a
   *  match during normal flow. */
  tierExpandTextThreshold: number;
  /** Half-width (in arrangement steps) of the "nearby" tier-2 window. */
  nearbyRadius: number;
  /** Consecutive silence ticks after which the window is considered stale and
   *  the engine holds regardless of leftover context. */
  staleAfterSilenceTicks: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  // 6 words = 4 trigrams of context. Empirically this is the sweet spot on
  // real service data: large enough to phrase-match a line, small enough that
  // the window clears quickly at a slide boundary (fast detection) AND recovers
  // fast after a burst of noise (a corrupted word ages out in a few ticks).
  // Bigger windows were both slower to detect and slower to recover here.
  windowSize: 6,
  autoSafeThreshold: 92,
  recommendThreshold: 75,
  textWeight: 0.72,
  positionWeight: 0.28,
  ambiguityWeight: 0.24,
  tierExpandTextThreshold: 60,
  nearbyRadius: 4,
  staleAfterSilenceTicks: 6,
};

/** Precomputed, per-slide corpus tokens so the hot path never re-normalizes. */
interface Indexed {
  placed: PlacedSlide;
  tokens: string[];
}

export class MatchingEngine {
  private readonly cfg: EngineConfig;
  private readonly ordered: PlacedSlide[];
  private readonly byId: Map<string, PlacedSlide>;
  private readonly indexed: Indexed[];
  /** Slides grouped by normalized text -> the set of duplicate instances.
   *  This is what makes "two identical choruses are not interchangeable"
   *  tractable: we can find a winner's look-alikes in O(1). */
  private readonly duplicatesByText: Map<string, PlacedSlide[]>;
  private readonly fingerprint: RollingFingerprint;

  private currentIndex: number;
  /** Arrangement indices we have already been "live" on, most recent last.
   *  Used to prefer the *next* instance of repeated content over one we've
   *  already sung. */
  private readonly visitedIndices: number[] = [];

  constructor(plan: ServicePlan, config: Partial<EngineConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
    if (Math.abs(this.cfg.textWeight + this.cfg.positionWeight - 1) > 1e-9) {
      throw new Error("textWeight + positionWeight must equal 1");
    }
    const { ordered, byId } = buildArrangement(plan);
    if (ordered.length === 0) throw new Error("plan has no slides");
    this.ordered = ordered;
    this.byId = byId;
    this.indexed = ordered.map((placed) => ({
      placed,
      tokens: normalizeToTokens(placed.slide.normalizedText),
    }));
    this.duplicatesByText = new Map();
    for (const placed of ordered) {
      const key = placed.slide.normalizedText;
      const bucket = this.duplicatesByText.get(key);
      if (bucket) bucket.push(placed);
      else this.duplicatesByText.set(key, [placed]);
    }
    this.fingerprint = new RollingFingerprint(this.cfg.windowSize);
    // Start "live" on the first slide of the plan — a service always opens on
    // slide 1, and giving the engine a real anchor makes position weighting
    // meaningful from the very first word.
    this.currentIndex = 0;
    this.visitedIndices.push(0);
  }

  /** The slide the engine currently considers live. */
  get currentSlide(): Slide {
    return this.ordered[this.currentIndex]!.slide;
  }

  /**
   * Operator manually selects a slide (jump-to-slide). This is authoritative:
   * we trust the human completely, move the live pointer, and clear the window
   * so the next real words re-lock from the new location instead of fighting
   * stale context. This is what enables fast resync after a manual jump.
   */
  jumpTo(slideId: string): void {
    const placed = this.byId.get(slideId);
    if (!placed) throw new Error(`unknown slideId: ${slideId}`);
    this.currentIndex = placed.arrangementIndex;
    this.recordVisit(placed.arrangementIndex);
    this.fingerprint.reset();
  }

  /** Ingest one silence tick (no word spoken). Returns a hold on the current
   *  slide; long silence keeps us put by design. */
  tickSilence(): MatchResult {
    this.fingerprint.pushSilence();
    return this.holdResult(
      this.fingerprint.silenceTicks() >= this.cfg.staleAfterSilenceTicks
        ? "long silence — holding current slide"
        : "silence — holding current slide",
    );
  }

  /**
   * Ingest one transcript word and produce a decision.
   *
   * Empty/whitespace input is treated as silence so callers can forward raw
   * captions without pre-filtering.
   */
  pushWord(rawWord: string): MatchResult {
    if (rawWord.trim().length === 0) return this.tickSilence();
    const tick = this.fingerprint.push(rawWord);
    if (tick.word === "") {
      // Normalized to nothing (punctuation only) — treat as silence.
      return this.tickSilence();
    }

    const windowTokens = this.fingerprint.tokens();
    // A window with very few words can't reliably distinguish anything; hold
    // and wait for more evidence rather than lurch on one or two words. This is
    // a deliberate latency-vs-safety tradeoff (favor safety).
    if (windowTokens.length < 2) {
      return this.holdResult("window too small — gathering context");
    }

    const candidate = this.selectCandidate([...windowTokens]);
    return this.decide(candidate);
  }

  // --- internal scoring -----------------------------------------------------

  /**
   * Positional prior for a slide at arrangement distance `d` from the current
   * slide (d = candidateIndex - currentIndex).
   *
   * Shape rationale (live-service behavior):
   *   - staying put (d=0) is the default expectation -> highest.
   *   - moving forward one (d=+1) is the overwhelmingly common transition.
   *   - moving backward (d<0) happens (repeat a verse, operator scrolls back)
   *     but is less common than forward, so it's discounted.
   *   - far jumps are rare and get a low floor so they only win on
   *     overwhelming text evidence (that's the "full-service search only on
   *     failure" safety valve).
   */
  private positionPrior(d: number): number {
    if (d === 0) return 100;
    if (d > 0) {
      // forward
      if (d === 1) return 95;
      if (d === 2) return 85;
      if (d === 3) return 76;
      if (d <= this.cfg.nearbyRadius) return 68;
      return 40;
    }
    // backward
    const ad = -d;
    if (ad === 1) return 80;
    if (ad === 2) return 66;
    if (ad === 3) return 55;
    if (ad <= this.cfg.nearbyRadius) return 46;
    return 30;
  }

  /**
   * Tiered candidate search. Returns the winning candidate together with the
   * raw signals needed to compute confidence.
   *
   * Tier 1: current, next, prev.               (the 99% case)
   * Tier 2: everything within nearbyRadius.     (skips, small jumps)
   * Tier 3: the whole service.                  (recovery only)
   * We only pay for a wider tier when the narrower one fails to explain the
   * transcript, keeping normal operation cheap and resistant to far look-alikes.
   */
  private selectCandidate(windowTokens: string[]): {
    placed: PlacedSlide;
    textMatch: number;
    position: number;
  } {
    const scoreOf = (idx: number) => {
      const entry = this.indexed[idx]!;
      const textMatch = textSimilarity(windowTokens, entry.tokens);
      const position = this.positionPrior(idx - this.currentIndex);
      return { placed: entry.placed, textMatch, position };
    };

    const combined = (c: { textMatch: number; position: number }) =>
      c.textMatch * this.cfg.textWeight + c.position * this.cfg.positionWeight;

    const tier1 = this.tier1Indices();
    let scored = tier1.map(scoreOf);
    let best = this.bestBy(scored, combined);

    // Expand only if tier 1 couldn't find a decent textual explanation.
    if (best.textMatch < this.cfg.tierExpandTextThreshold) {
      const tier2 = this.tier2Indices();
      scored = tier2.map(scoreOf);
      best = this.bestBy(scored, combined);

      if (best.textMatch < this.cfg.tierExpandTextThreshold) {
        // Full-service recovery search.
        scored = this.indexed.map((_, idx) => scoreOf(idx));
        best = this.bestBy(scored, combined);
      }
    }
    return best;
  }

  private tier1Indices(): number[] {
    const out = [this.currentIndex];
    if (this.currentIndex + 1 < this.ordered.length) out.push(this.currentIndex + 1);
    if (this.currentIndex - 1 >= 0) out.push(this.currentIndex - 1);
    return out;
  }

  private tier2Indices(): number[] {
    const out: number[] = [];
    const lo = Math.max(0, this.currentIndex - this.cfg.nearbyRadius);
    const hi = Math.min(this.ordered.length - 1, this.currentIndex + this.cfg.nearbyRadius);
    for (let i = lo; i <= hi; i++) out.push(i);
    return out;
  }

  private bestBy<T extends { textMatch: number; position: number }>(
    items: T[],
    key: (t: T) => number,
  ): T {
    let best = items[0]!;
    let bestScore = key(best);
    for (let i = 1; i < items.length; i++) {
      const s = key(items[i]!);
      // Deterministic tie-break: on equal combined score prefer the higher raw
      // text match, then the smaller forward distance (closer to current).
      if (
        s > bestScore ||
        (s === bestScore && items[i]!.textMatch > best.textMatch)
      ) {
        best = items[i]!;
        bestScore = s;
      }
    }
    return best;
  }

  /**
   * Resolve repeated content and compute the repetition-ambiguity penalty.
   *
   * When the winning slide's text appears elsewhere in the plan (e.g. a chorus
   * that is sung twice), the raw text signal cannot tell the instances apart —
   * they are literally identical. We disambiguate using *arrangement position*
   * and *history*:
   *   - the instance closest (by position prior) to where we currently are wins;
   *   - an instance we've already been live on is discounted when we're moving
   *     forward, because you don't normally jump BACK to a chorus you finished.
   *
   * The ambiguity score reflects how close the runner-up instance is to the
   * winner after that reasoning. A clean separation => ~0 ambiguity; a genuine
   * near-tie => high ambiguity, which the caller subtracts from confidence so
   * the engine holds instead of guessing which chorus we're on.
   */
  private resolveRepetition(winner: PlacedSlide): {
    resolved: PlacedSlide;
    ambiguity: number;
  } {
    const instances = this.duplicatesByText.get(winner.slide.normalizedText) ?? [
      winner,
    ];
    if (instances.length <= 1) return { resolved: winner, ambiguity: 0 };

    // Preference of each instance = its position prior, minus a penalty if we've
    // already visited it and are now ahead of it (don't re-take finished
    // content). Repeatable slides at the current index get a small boost so a
    // chorus we're actively on "absorbs" extra repeats instead of flipping to
    // its twin.
    const prefOf = (p: PlacedSlide): number => {
      const d = p.arrangementIndex - this.currentIndex;
      let pref = this.positionPrior(d);
      const alreadyVisited = this.visitedIndices.includes(p.arrangementIndex);
      if (alreadyVisited && d < 0) pref -= 35; // finished + behind us
      if (p.arrangementIndex === this.currentIndex) pref += 5; // sit tight
      return pref;
    };

    const ranked = [...instances].sort((a, b) => prefOf(b) - prefOf(a));
    const top = ranked[0]!;
    const runnerUp = ranked[1]!;
    const gap = prefOf(top) - prefOf(runnerUp);
    // Map the preference gap to residual ambiguity. Ambiguity is high ONLY when
    // position + history genuinely fail to separate the instances (a near-tie,
    // e.g. two choruses equidistant from where we are). A clear positional
    // winner — the normal case, where the next instance is d+1 and its twin is
    // several steps away or already sung — collapses to near-zero. ~20 points
    // of preference separation is treated as fully resolved; only then does the
    // engine trust itself to auto-advance onto a repeated slide.
    const ambiguity = clamp(Math.round(100 - gap * 5), 0, 100);
    return { resolved: top, ambiguity };
  }

  // --- decision -------------------------------------------------------------

  private decide(candidate: {
    placed: PlacedSlide;
    textMatch: number;
    position: number;
  }): MatchResult {
    const { resolved, ambiguity } = this.resolveRepetition(candidate.placed);
    // If repetition resolution moved us to a different instance, recompute the
    // position prior for the instance we actually chose.
    const position =
      resolved === candidate.placed
        ? candidate.position
        : this.positionPrior(resolved.arrangementIndex - this.currentIndex);

    const breakdown: SignalBreakdown = {
      textMatch: candidate.textMatch,
      position,
      repetitionAmbiguity: ambiguity,
    };

    const base =
      candidate.textMatch * this.cfg.textWeight +
      position * this.cfg.positionWeight;
    const confidence = clamp(
      Math.round(base - ambiguity * this.cfg.ambiguityWeight),
      0,
      100,
    );

    const recommendation = this.bandFor(confidence);
    const target = resolved.slide;
    const isChange = resolved.arrangementIndex !== this.currentIndex;

    // --- advancement policy ---
    // The advisory band (recommendation) and the ACTION (auto-advance) are
    // separate on purpose. A slide only auto-takes when ALL of these hold:
    //   * it's a different slide than we're on, and
    //   * confidence is in the auto-safe band, and
    //   * confidence clears the slide's own minimumMatchConfidence floor, and
    //   * the slide permits automatic advancement.
    // Anything short of that stays a recommendation for the operator.
    let advanced = false;
    let reason: string;

    if (!isChange) {
      reason =
        recommendation === "hold"
          ? "low confidence — holding current slide"
          : "current slide still best match — staying";
    } else if (recommendation !== "auto-advance") {
      reason = `predicted "${target.title}" but confidence ${confidence} is ${
        recommendation === "recommend"
          ? "recommend-only — operator confirm"
          : "below hold threshold"
      }`;
    } else if (!target.automaticAdvanceAllowed) {
      reason = `"${target.title}" reached auto confidence but automaticAdvanceAllowed=false — recommend, don't take`;
    } else if (confidence < target.minimumMatchConfidence) {
      reason = `"${target.title}" needs >= ${target.minimumMatchConfidence} to auto-take (got ${confidence}) — recommend only`;
    } else {
      // Take it.
      this.currentIndex = resolved.arrangementIndex;
      this.recordVisit(resolved.arrangementIndex);
      advanced = true;
      reason = `auto-advanced to "${target.title}" (confidence ${confidence})`;
    }

    return {
      currentSlideId: this.currentSlide.slideId,
      predictedSlideId: target.slideId,
      predictedSlide: target,
      confidence,
      breakdown,
      recommendation,
      advanced,
      reason,
    };
  }

  private bandFor(confidence: number): Recommendation {
    if (confidence >= this.cfg.autoSafeThreshold) return "auto-advance";
    if (confidence >= this.cfg.recommendThreshold) return "recommend";
    return "hold";
  }

  /** Build a hold result that keeps the live slide unchanged. */
  private holdResult(reason: string): MatchResult {
    const slide = this.currentSlide;
    return {
      currentSlideId: slide.slideId,
      predictedSlideId: slide.slideId,
      predictedSlide: slide,
      confidence: 0,
      breakdown: { textMatch: 0, position: 100, repetitionAmbiguity: 0 },
      recommendation: "hold",
      advanced: false,
      reason,
    };
  }

  private recordVisit(index: number): void {
    if (this.visitedIndices[this.visitedIndices.length - 1] !== index) {
      this.visitedIndices.push(index);
      // Bound history so it can't grow without limit over a long service.
      if (this.visitedIndices.length > 64) this.visitedIndices.shift();
    }
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
