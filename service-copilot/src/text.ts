/**
 * Deterministic text utilities: normalization, tokenization, and the two fuzzy
 * similarity signals the engine blends (token-set ratio + word n-gram overlap).
 *
 * Everything here is pure and dependency-free. Live captions are messy — case,
 * punctuation, contractions, filler — so the matcher never compares raw text;
 * it compares normalized tokens.
 */

/**
 * Normalize text for matching:
 *   - lowercase
 *   - strip diacritics (so "grâce" == "grace")
 *   - drop punctuation
 *   - collapse whitespace
 *
 * We deliberately do NOT stem or remove stopwords. In worship lyrics the small
 * words ("and", "the", "how") carry melody/line identity and help distinguish
 * near-duplicate lines; dropping them would make repeated content even harder
 * to tell apart.
 */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combining diacritics
    .toLowerCase()
    .replace(/['’]/g, "") // fold contractions: "don't" -> "dont"
    .replace(/[^a-z0-9\s]/g, " ") // all other punctuation -> space
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokenize already-normalized text into words. Empty string -> []. */
export function tokenize(normalized: string): string[] {
  if (normalized.length === 0) return [];
  return normalized.split(" ");
}

/** Convenience: normalize then tokenize. */
export function normalizeToTokens(text: string): string[] {
  return tokenize(normalize(text));
}

/**
 * Levenshtein edit distance between two token strings. Used only as the kernel
 * of the ratio below, on short strings, so the O(n*m) DP is fine.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1, // deletion
        curr[j - 1]! + 1, // insertion
        prev[j - 1]! + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/** Similarity ratio in [0,1] derived from edit distance over two strings. */
function ratio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

/**
 * Token-set ratio, in the spirit of fuzzywuzzy's token_set_ratio.
 *
 * Why this and not a plain ratio: transcripts drop, reorder, and pad words. By
 * splitting both sides into a shared "intersection" plus their leftover
 * "remainders" and comparing the reconstructed strings, we stay high when one
 * side is a noisy superset/subset of the other. This is the signal that keeps
 * a partially-captured lyric line matching its slide.
 *
 * Returns 0–100.
 */
export function tokenSetRatio(aTokens: string[], bTokens: string[]): number {
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);

  const intersection: string[] = [];
  for (const t of aSet) if (bSet.has(t)) intersection.push(t);
  intersection.sort();

  const aOnly = [...aSet].filter((t) => !bSet.has(t)).sort();
  const bOnly = [...bSet].filter((t) => !aSet.has(t)).sort();

  const inter = intersection.join(" ");
  const aCombined = (inter + " " + aOnly.join(" ")).trim();
  const bCombined = (inter + " " + bOnly.join(" ")).trim();

  // The three fuzzywuzzy comparisons; take the best, matching the reference
  // behavior where a strong intersection dominates.
  const r1 = ratio(inter, aCombined);
  const r2 = ratio(inter, bCombined);
  const r3 = ratio(aCombined, bCombined);
  return Math.round(Math.max(r1, r2, r3) * 100);
}

/** Build the set of word n-grams for a token list. */
function wordNGrams(tokens: string[], n: number): Set<string> {
  const grams = new Set<string>();
  if (tokens.length < n) {
    // Fall back to unigrams so very short windows still produce a signal.
    for (const t of tokens) grams.add(t);
    return grams;
  }
  for (let i = 0; i + n <= tokens.length; i++) {
    grams.add(tokens.slice(i, i + n).join(" "));
  }
  return grams;
}

/**
 * Directional word n-gram *containment*: what fraction of the query's n-grams
 * (the rolling window) also occur in the reference (a slide). Blended across
 * bigrams and trigrams.
 *
 * Why containment and NOT a symmetric Dice/Jaccard overlap: the window is a
 * short query (~12 words) matched against a much longer slide (~30 words). A
 * symmetric coefficient punishes that size mismatch, so even a PERFECT partial
 * match tops out around 0.55 and never reaches the auto-safe band. Containment
 * asks the operationally correct question — "is what I just heard part of this
 * slide?" — which is 1.0 when the window lies inside the slide.
 *
 * Why n-grams at all (vs. token-set alone): token-set ignores word ORDER, so
 * two lines built from the same vocabulary in a different order can score
 * falsely high. Contiguous n-grams capture phrasing, which is what separates
 * otherwise-similar lyric lines. Direction matters: `query` is the window,
 * `reference` is the slide.
 *
 * Returns 0–100.
 */
export function ngramOverlap(query: string[], reference: string[]): number {
  if (query.length === 0 || reference.length === 0) return 0;
  const containment = (n: number): number => {
    const Q = wordNGrams(query, n);
    const R = wordNGrams(reference, n);
    if (Q.size === 0 || R.size === 0) return 0;
    let shared = 0;
    for (const g of Q) if (R.has(g)) shared += 1;
    return shared / Q.size; // fraction of the window explained by the slide
  };
  // Weight trigrams a little higher than bigrams: longer contiguous matches are
  // stronger evidence of the same actual line being spoken.
  const bi = containment(2);
  const tri = containment(3);
  return Math.round((bi * 0.45 + tri * 0.55) * 100);
}

/**
 * Combined text-match signal (0–100) used by the engine.
 *
 * token-set ratio is the backbone (robust to drops/reorder); n-gram overlap is
 * the tie-breaker that enforces phrasing. The 0.65/0.35 split favors recall
 * (don't lose a match to noise) while still letting phrasing separate
 * lookalike lines.
 */
export function textSimilarity(windowTokens: string[], slideTokens: string[]): number {
  const tsr = tokenSetRatio(windowTokens, slideTokens);
  // Bidirectional n-gram containment so the signal is length-robust in BOTH
  // regimes: a long slide (window ⊂ slide) and a short slide (slide ⊂ window,
  // e.g. a 9-word sermon point inside a 12-word window). Without the reverse
  // direction a short slide could never reach full confidence and would be
  // skipped. Trigram containment keeps this honest — the slide's actual phrases
  // must appear contiguously in the window, not just its vocabulary.
  const ng = Math.max(
    ngramOverlap(windowTokens, slideTokens),
    ngramOverlap(slideTokens, windowTokens),
  );
  return Math.round(tsr * 0.65 + ng * 0.35);
}
