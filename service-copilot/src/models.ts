/**
 * Core data models for a service plan.
 *
 * MVP 1 is deterministic and offline: these types describe the *planned*
 * arrangement of a worship service and are the only thing the matching engine
 * reasons over. Everything that could vary at runtime (transcript, timing,
 * noise) lives elsewhere.
 */

/**
 * The kind of section a slide belongs to. This drives default matching policy
 * (see `defaultPolicyFor` in sampleService.ts) because different section types
 * have very different live-service risk profiles:
 *   - song/hymn lyrics are repetitive and fast-moving -> lean toward advancing
 *   - sermon points are spoken loosely and a wrong advance is glaring on screen
 *     -> lean toward holding
 */
export type SectionType =
  | "song"
  | "hymn"
  | "reading"
  | "scripture"
  | "sermon"
  | "announcement";

/**
 * Structural role of a slide within its section. Used to disambiguate repeated
 * content (two `chorus` slides with identical text are NOT interchangeable) and
 * to reason about planned arrangement.
 *
 * The prompt calls out verse1|chorus|bridge|tag|ending as examples; real songs
 * have multiple verses, so we allow verse1..verse6. `null` is used for content
 * with no musical structure (readings, sermon points, announcements).
 */
export type StructureLabel =
  | "verse1"
  | "verse2"
  | "verse3"
  | "verse4"
  | "verse5"
  | "verse6"
  | "chorus"
  | "bridge"
  | "tag"
  | "ending"
  | null;

/**
 * Where a slide's text came from. Always "manual" in MVP 1; "import" and "ocr"
 * are reserved for future ingestion pipelines. It is carried through the model
 * now so downstream code (e.g. confidence policy: OCR text is noisier and may
 * warrant a higher minimumMatchConfidence) does not need a schema migration
 * later.
 */
export type SlideSource = "manual" | "import" | "ocr";

export interface Slide {
  /** Stable unique id. Two slides with identical text (e.g. a repeated chorus)
   *  still get distinct ids — this is what makes them non-interchangeable. */
  slideId: string;
  /** Owning section id. */
  sectionId: string;
  /** 1-based position of this slide within its section (for display/debug). */
  slideNumber: number;
  /** Human-facing title, e.g. "Amazing Grace — Verse 1". */
  title: string;
  /** Verbatim text shown on screen. */
  displayText: string;
  /** Normalized text used for matching. Precomputed so the hot path never
   *  re-normalizes the corpus on every transcript word. */
  normalizedText: string;
  /** Previous/next slide in the *planned arrangement* (not merely section
   *  order). null at the ends. These are the primary inputs to position
   *  weighting and to disambiguating repeated content. */
  prevSlideId: string | null;
  nextSlideId: string | null;
  sectionType: SectionType;
  structureLabel: StructureLabel;
  /** True when this slide's content may legitimately repeat back-to-back
   *  (e.g. a chorus sung twice). Repeatable slides are allowed to "absorb"
   *  extra repetitions without the engine false-advancing off them. */
  repeatable: boolean;
  /** Per-slide floor for *automatic* advancement. The engine will not auto-take
   *  a slide unless confidence >= this value (and >= the global auto-safe
   *  threshold). Lets high-risk slides (sermon points) demand extra certainty
   *  than the global default. Range 0–100. */
  minimumMatchConfidence: number;
  /** When false, the engine may recommend this slide but will NEVER change the
   *  live slide to it automatically — an operator must confirm. Used for
   *  content where an unattended wrong advance is unacceptable. */
  automaticAdvanceAllowed: boolean;
  source: SlideSource;
}

export interface Section {
  sectionId: string;
  title: string;
  type: SectionType;
  /** Slides in this section, in intended presentation order. */
  slides: Slide[];
}

export interface ServicePlan {
  planId: string;
  title: string;
  /** ISO date string (YYYY-MM-DD). Kept as a string to stay deterministic and
   *  serialization-friendly; the engine never reads wall-clock time. */
  date: string;
  sections: Section[];
}

/**
 * A slide with its resolved position in the flattened planned arrangement.
 * `arrangementIndex` is the single source of truth for "how far apart" two
 * slides are, which position weighting and repeat-disambiguation both depend
 * on. A repeated chorus appears here twice, at two different indices.
 */
export interface PlacedSlide {
  slide: Slide;
  arrangementIndex: number;
}

/**
 * Flatten a plan into its arrangement order and index it for O(1) lookup.
 *
 * We derive the arrangement from section order + within-section slide order and
 * cross-check it against the prev/next refs. The refs are authoritative for the
 * chain; section order is a convenience for authoring. Building this once up
 * front keeps the matching hot path allocation-free.
 */
export function buildArrangement(plan: ServicePlan): {
  ordered: PlacedSlide[];
  byId: Map<string, PlacedSlide>;
} {
  const ordered: PlacedSlide[] = [];
  const byId = new Map<string, PlacedSlide>();
  let index = 0;
  for (const section of plan.sections) {
    for (const slide of section.slides) {
      const placed: PlacedSlide = { slide, arrangementIndex: index };
      ordered.push(placed);
      byId.set(slide.slideId, placed);
      index += 1;
    }
  }
  return { ordered, byId };
}
