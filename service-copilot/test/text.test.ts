import { describe, it, expect } from "vitest";
import {
  normalize,
  normalizeToTokens,
  tokenSetRatio,
  ngramOverlap,
  textSimilarity,
} from "../src/text.js";

describe("normalize", () => {
  it("lowercases, strips punctuation and diacritics, folds contractions", () => {
    expect(normalize("Amazing GRACE, how sweet!")).toBe(
      "amazing grace how sweet",
    );
    expect(normalize("don't")).toBe("dont");
    expect(normalize("grâce")).toBe("grace");
    expect(normalize("  multiple   spaces  ")).toBe("multiple spaces");
  });
});

describe("tokenSetRatio", () => {
  it("is 100 for identical token sets regardless of order/dupes", () => {
    expect(
      tokenSetRatio(["a", "b", "c"], ["c", "b", "a", "a"]),
    ).toBe(100);
  });
  it("stays high when the window is a clean subset of the slide", () => {
    const slide = normalizeToTokens(
      "amazing grace how sweet the sound that saved a wretch like me",
    );
    const window = normalizeToTokens("how sweet the sound");
    expect(tokenSetRatio(window, slide)).toBeGreaterThanOrEqual(90);
  });
  it("is low for disjoint text", () => {
    expect(
      tokenSetRatio(
        normalizeToTokens("cough sorry microphone testing"),
        normalizeToTokens("amazing grace how sweet the sound"),
      ),
    ).toBeLessThan(40);
  });
});

describe("ngramOverlap (directional containment)", () => {
  it("is 100 when the query's phrases all appear in the reference", () => {
    const query = normalizeToTokens("how sweet the sound");
    const ref = normalizeToTokens(
      "amazing grace how sweet the sound that saved a wretch",
    );
    expect(ngramOverlap(query, ref)).toBe(100);
  });
  it("penalizes reordered vocabulary (phrasing matters)", () => {
    const a = normalizeToTokens("grace amazing sound the sweet how");
    const ref = normalizeToTokens("amazing grace how sweet the sound");
    // Same words, scrambled order -> few shared bigrams/trigrams.
    expect(ngramOverlap(a, ref)).toBeLessThan(50);
  });
});

describe("textSimilarity", () => {
  it("scores a short slide fully inside a longer window near 100", () => {
    const window = normalizeToTokens(
      "and now point one grace finds us right where we are today",
    );
    const shortSlide = normalizeToTokens(
      "point one grace finds us right where we are",
    );
    expect(textSimilarity(window, shortSlide)).toBeGreaterThanOrEqual(90);
  });
  it("scores a long slide with a matching window near 100", () => {
    const window = normalizeToTokens("that saved a wretch like me");
    const longSlide = normalizeToTokens(
      "amazing grace how sweet the sound that saved a wretch like me i once was lost",
    );
    expect(textSimilarity(window, longSlide)).toBeGreaterThanOrEqual(90);
  });
});
