# The Matching Algorithm

This document explains how Service Copilot decides which slide a live service is
on, given a noisy transcript arriving one word at a time. It is written to be
read alongside the code in `src/` — every design choice here maps to a commented
decision there.

## The problem, and why it's not just "find the closest text"

A worship service is a linear-ish sequence of slides (lyrics, readings, sermon
points). A speech-to-text feed gives us words, late and imperfect. We want to
keep the projected slide in sync **without a human clicking through it**, and —
far more importantly — **without ever jumping to the wrong slide in front of the
congregation.**

Naive "pick the slide with the highest text similarity" fails badly here:

- **Repetition.** A chorus sung twice is two *different* slides with *identical*
  text. Text alone cannot tell them apart.
- **Noise.** Dropped, wrong, and garbage words make raw similarity jittery.
- **Loose speech.** Sermons are paraphrased, not read. A high-similarity match
  is not the same as "the speaker is definitely on this point."
- **Asymmetry of errors.** A *missed* advance is a minor annoyance (an operator
  nudges the slide). A *wrong* advance is a glaring, public failure. The whole
  system is tuned around that asymmetry.

So matching combines three signals, applies a strict advancement policy on top,
and defaults to holding whenever the evidence is weak or ambiguous.

## Inputs

The engine reasons only over a **planned arrangement** (`ServicePlan` →
`Section` → `Slide`, see `src/models.ts`). The plan is flattened once into an
ordered list; each slide gets an `arrangementIndex`. A repeated chorus appears
in this list **twice**, at two indices, with two distinct `slideId`s and
identical `normalizedText`. That duality is the crux of the repetition problem.

Slides carry per-slide policy that encodes live-service risk tolerance:

- `minimumMatchConfidence` — floor to auto-advance *onto* this slide.
- `automaticAdvanceAllowed` — if false, the engine may only recommend.
- `repeatable` — may legitimately repeat back-to-back (a chorus).

## Signal 1 — Rolling window fingerprint

Only the most recent words matter for "where are we *now*". `RollingFingerprint`
(`src/fingerprint.ts`) keeps a bounded window (default **6 words**) of the latest
normalized tokens.

Window size is the single most important knob:

- Too small → not enough context to tell similar lines apart.
- Too large → the window straddles a slide boundary for many words, so the
  engine is **slow to advance** and **slow to shake off noise**.

Six words was chosen empirically (see the sweep in the CLI): it is 4 trigrams of
context — enough to phrase-match a line — while clearing quickly at a boundary
(fast detection) and aging out a corrupted word within a few ticks (fast
recovery). Larger windows were measurably both slower to lock on and slower to
recover on real service data.

The window is **reset on a manual jump** so the next few words re-lock from the
new location instead of fighting stale context. This is the mechanism behind
"fast resync after a jump-to-slide."

## Signal 2 — Text match (fuzzy, length-robust)

`textSimilarity` (`src/text.ts`) blends two sub-signals, each 0–100:

### Token-set ratio (65% weight)

In the spirit of fuzzywuzzy's `token_set_ratio`. Both sides are split into a
shared intersection plus their leftover remainders; the reconstructed strings
are compared via an edit-distance ratio. This stays high when one side is a
noisy subset/superset of the other — exactly the case for a partial lyric line
captured mid-window. Stopwords are **kept** (not stripped): in lyrics the small
words carry line identity and help separate near-duplicate lines.

### N-gram containment (35% weight)

Word bigram/trigram overlap, but measured as **directional containment**, not a
symmetric Dice/Jaccard coefficient — and evaluated in **both directions**, taking
the max:

- `containment(window → slide)` handles the **long-slide** regime (the window
  lies inside a longer slide).
- `containment(slide → window)` handles the **short-slide** regime (e.g. a
  9-word sermon point sitting inside the window).

Why this matters: a symmetric coefficient punishes the length mismatch between a
6–12 word window and a 30-word slide, so even a *perfect* partial match tops out
around 0.55 and never reaches the auto-safe band — the engine would silently
refuse to advance. Containment asks the operationally correct question: "is what
I just heard part of this slide?" Trigrams keep it honest — the slide's actual
*phrases* must appear contiguously, so scrambled-but-same vocabulary does **not**
score as a match. This is what enforces phrasing/word-order on top of the
order-blind token-set ratio.

## Signal 3 — Position weighting (tiered search)

Text alone would let a distant look-alike steal a match. Position weighting
encodes "services move forward, one slide at a time, most of the time."

`positionPrior(d)` maps the arrangement distance `d = candidateIndex −
currentIndex` to a 0–100 prior:

- `d = 0` (stay) → 100 — the default expectation.
- `d = +1` (next) → 95 — the overwhelmingly common transition.
- `d < 0` (back) → discounted vs. forward (repeats/scroll-backs happen, but are
  rarer).
- far jumps → a low floor, so they only win on overwhelming text evidence.

Search is **tiered**, and we only pay for a wider tier when the narrower one
fails to explain the transcript ("full-service search only on failure"):

1. **Tier 1** — current, next, prev. The ~99% case.
2. **Tier 2** — everything within `nearbyRadius` (±4). Skips and small jumps.
3. **Tier 3** — the whole service. Recovery only.

Expansion is triggered when the best raw text match in a tier is below
`tierExpandTextThreshold` (60). This keeps normal operation cheap and, crucially,
keeps a far-away slide with a coincidentally-high text score from being
considered at all during normal flow.

The positive score for a candidate is:

```
combined = textMatch · textWeight + position · positionWeight   (0.72 / 0.28)
```

Text dominates; position breaks ties and suppresses distant look-alikes.

## Repetition / structural context

When the winning slide's normalized text appears elsewhere in the plan (the two
choruses), text cannot distinguish the instances — they are byte-identical. We
disambiguate with **arrangement position + recent history** (`resolveRepetition`
in `src/matchingEngine.ts`):

- Each instance's preference starts from its position prior.
- An instance we have **already been live on** and are now *ahead of* is
  discounted (you don't normally jump back to a chorus you just finished).
- The instance we are currently *on* gets a small boost, so an actively-sung
  repeatable chorus "absorbs" an extra repetition instead of flipping to its
  twin.

The **repetition-ambiguity** signal (0–100) is the *residual* uncertainty after
that reasoning: it is derived from the preference gap between the best instance
and the runner-up. A clear positional winner (next instance is `d+1`, its twin is
several steps away or already sung) collapses to near-zero. A genuine near-tie
(two choruses equidistant from where we are) stays high. Ambiguity is a
**penalty** — it is subtracted from confidence, so in a genuinely confusing
moment the engine holds rather than guessing which chorus is live.

## Confidence and the output breakdown

```
base       = textMatch · 0.72 + position · 0.28
confidence = clamp( round( base − repetitionAmbiguity · 0.24 ), 0, 100 )
```

Every tick returns a per-signal breakdown so an operator (and the CLI) can see
*why*:

- `textMatch` — how well the window matches the winning slide.
- `position` — how "expected" that slide is from where we are.
- `repetitionAmbiguity` — how confusable the winner is with a duplicate.

## Recommendation bands vs. the advance action

These are deliberately **separate**.

The **recommendation band** is advisory and comes purely from global confidence
thresholds:

| Confidence | Band          | Meaning                        |
| ---------- | ------------- | ------------------------------ |
| ≥ 92       | auto-advance  | auto-safe                      |
| 75–91      | recommend     | show operator, needs confirm   |
| < 75       | hold          | not enough evidence            |

The **advance action** (actually moving the live slide unattended) is stricter.
The engine auto-takes a *different* slide only when **all** of these hold:

1. confidence is in the auto-safe band (≥ 92), **and**
2. confidence clears that slide's own `minimumMatchConfidence` floor, **and**
3. the slide's `automaticAdvanceAllowed` is true.

Anything short of that stays a recommendation for a human. This is why a **sermon
point** (floor **93**, the highest) does not auto-advance on a paraphrase: a
loose restatement does not clear 93, so it is recommended, not taken — while the
exact trigger phrase does clear it and advances. A wrong sermon advance is the
most visible failure mode, so sermon slides demand the most certainty.

## Degenerate cases (all deliberate holds)

- **Tiny window** (< 2 words): hold and gather context rather than lurch on one
  word.
- **Silence**: `tickSilence()` holds the current slide; `staleAfterSilenceTicks`
  marks the window stale after prolonged silence. Long silence keeps us put by
  design.
- **Garbage**: unrelated tokens drive text match down, confidence falls out of
  the auto band, and nothing advances.

## Determinism

Everything is pure and offline: no wall-clock reads, no unseeded randomness, no
network. The simulator's noise uses a seeded PRNG (mulberry32). Same plan + same
word sequence ⇒ identical outputs, which is what makes the behavior testable and
trustworthy. A dedicated test asserts this.

## Tuning summary

All knobs live in `EngineConfig` / `DEFAULT_CONFIG` (`src/matchingEngine.ts`):

| Knob                      | Default   | Effect                                        |
| ------------------------- | --------- | --------------------------------------------- |
| `windowSize`              | 6         | context vs. detection latency & noise recovery|
| `autoSafeThreshold`       | 92        | auto-advance band floor                       |
| `recommendThreshold`      | 75        | recommend band floor                          |
| `textWeight`/`positionWeight` | 0.72/0.28 | text vs. position balance                 |
| `ambiguityWeight`         | 0.24      | how hard repetition ambiguity cuts confidence |
| `tierExpandTextThreshold` | 60        | when to widen the search                       |
| `nearbyRadius`            | 4         | size of the "nearby" tier                      |
| `staleAfterSilenceTicks`  | 6         | when a silent window is considered stale       |

Per-slide overrides (`minimumMatchConfidence`, `automaticAdvanceAllowed`,
`repeatable`) let individual slides be stricter than the global defaults.
