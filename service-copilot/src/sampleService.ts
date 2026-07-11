/**
 * A representative Sunday service used by the CLI and the test suite.
 *
 * It exercises every hard case the engine must handle: a hymn with a chorus
 * that is sung TWICE (two identical slides that must not be confused), a
 * leader/congregation responsive reading, a scripture passage, a 3-point sermon
 * with distinct trigger phrases, a closing song, and a benediction.
 */

import { normalize } from "./text.js";
import type {
  Section,
  SectionType,
  ServicePlan,
  Slide,
  SlideSource,
  StructureLabel,
} from "./models.js";

/**
 * Default matching policy per section type. This is where live-service risk
 * tolerance is encoded:
 *   - sermon points demand the highest floor (93) because a wrong sermon
 *     advance is the most visible, most disruptive error and sermon speech is
 *     the loosest (paraphrased, not read verbatim).
 *   - songs/hymns get a moderate floor and their choruses are repeatable.
 *   - readings/scripture sit in between; they're read closely to the text so a
 *     slightly lower floor is safe.
 */
interface Policy {
  minimumMatchConfidence: number;
  automaticAdvanceAllowed: boolean;
}

function defaultPolicyFor(type: SectionType, label: StructureLabel): Policy {
  switch (type) {
    case "sermon":
      // High floor + still auto-advanceable ONLY on a strong trigger-phrase
      // match. Paraphrase won't clear 93, so it stays a recommendation.
      return { minimumMatchConfidence: 93, automaticAdvanceAllowed: true };
    case "announcement":
      return { minimumMatchConfidence: 80, automaticAdvanceAllowed: true };
    case "reading":
    case "scripture":
      return { minimumMatchConfidence: 82, automaticAdvanceAllowed: true };
    case "song":
    case "hymn":
    default:
      // Choruses can repeat, so give them a touch more headroom to re-take.
      return {
        minimumMatchConfidence: label === "chorus" ? 84 : 85,
        automaticAdvanceAllowed: true,
      };
  }
}

interface SlideSpec {
  title: string;
  text: string;
  structureLabel?: StructureLabel;
  repeatable?: boolean;
  /** Per-slide overrides on top of the section-type default policy. */
  minimumMatchConfidence?: number;
  automaticAdvanceAllowed?: boolean;
}

interface SectionSpec {
  title: string;
  type: SectionType;
  slides: SlideSpec[];
}

/**
 * Build a full ServicePlan from a compact spec, wiring up ids, slide numbers,
 * normalized text, prev/next arrangement refs, and default policy. Keeping this
 * in one place means the sample data stays readable while every derived field
 * (the parts the engine actually reads) is computed consistently.
 */
function buildPlan(
  planId: string,
  title: string,
  date: string,
  specs: SectionSpec[],
): ServicePlan {
  const sections: Section[] = [];
  // First pass: create slides with ids so we can then link prev/next across
  // the whole flattened arrangement (links cross section boundaries).
  const flat: Slide[] = [];

  specs.forEach((sectionSpec, sIdx) => {
    const sectionId = `sec-${sIdx + 1}-${slug(sectionSpec.title)}`;
    const slides: Slide[] = sectionSpec.slides.map((spec, i) => {
      const label = spec.structureLabel ?? null;
      const policy = defaultPolicyFor(sectionSpec.type, label);
      const source: SlideSource = "manual"; // MVP 1 is always manual.
      const slide: Slide = {
        slideId: `${sectionId}-s${i + 1}`,
        sectionId,
        slideNumber: i + 1,
        title: spec.title,
        displayText: spec.text,
        normalizedText: normalize(spec.text),
        prevSlideId: null, // linked in second pass
        nextSlideId: null,
        sectionType: sectionSpec.type,
        structureLabel: label,
        repeatable: spec.repeatable ?? false,
        minimumMatchConfidence:
          spec.minimumMatchConfidence ?? policy.minimumMatchConfidence,
        automaticAdvanceAllowed:
          spec.automaticAdvanceAllowed ?? policy.automaticAdvanceAllowed,
        source,
      };
      flat.push(slide);
      return slide;
    });
    sections.push({ sectionId, title: sectionSpec.title, type: sectionSpec.type, slides });
  });

  // Second pass: link the flattened arrangement.
  for (let i = 0; i < flat.length; i++) {
    flat[i]!.prevSlideId = i > 0 ? flat[i - 1]!.slideId : null;
    flat[i]!.nextSlideId = i < flat.length - 1 ? flat[i + 1]!.slideId : null;
  }

  return { planId, title, date, sections };
}

function slug(s: string): string {
  return normalize(s).replace(/\s+/g, "-");
}

// The chorus text is defined once and used for BOTH chorus slides so they are
// byte-for-byte identical after normalization — this is the crux of the
// "repeated chorus" disambiguation problem.
const CHORUS_TEXT =
  "My chains are gone I've been set free\n" +
  "My God my Savior has ransomed me\n" +
  "And like a flood His mercy reigns\n" +
  "Unending love amazing grace";

export function buildSampleService(): ServicePlan {
  return buildPlan(
    "sample-service-2026-07-12",
    "Sunday Morning Worship",
    "2026-07-12",
    [
      {
        title: "Welcome",
        type: "announcement",
        slides: [
          {
            title: "Welcome & Announcements",
            text:
              "Good morning and welcome to worship. " +
              "We're so glad you're here with us today. " +
              "Please take a moment to greet those around you.",
          },
        ],
      },
      {
        title: "Amazing Grace (My Chains Are Gone)",
        type: "hymn",
        slides: [
          {
            title: "Verse 1",
            structureLabel: "verse1",
            text:
              "Amazing grace how sweet the sound " +
              "that saved a wretch like me. " +
              "I once was lost but now am found " +
              "was blind but now I see.",
          },
          {
            title: "Verse 2",
            structureLabel: "verse2",
            text:
              "Twas grace that taught my heart to fear " +
              "and grace my fears relieved. " +
              "How precious did that grace appear " +
              "the hour I first believed.",
          },
          {
            // Chorus instance #1 — repeatable, identical text to instance #2.
            title: "Chorus (1st time)",
            structureLabel: "chorus",
            repeatable: true,
            text: CHORUS_TEXT,
          },
          {
            title: "Verse 3",
            structureLabel: "verse3",
            text:
              "The Lord has promised good to me " +
              "his word my hope secures. " +
              "He will my shield and portion be " +
              "as long as life endures.",
          },
          {
            // Chorus instance #2 — SAME text, different slide, later position.
            title: "Chorus (2nd time)",
            structureLabel: "chorus",
            repeatable: true,
            text: CHORUS_TEXT,
          },
          {
            title: "Ending",
            structureLabel: "ending",
            text:
              "Amazing grace how sweet the sound " +
              "that saved a wretch like me.",
          },
        ],
      },
      {
        title: "Responsive Reading — Psalm 100",
        type: "reading",
        slides: [
          {
            title: "Leader",
            text: "Leader: Make a joyful noise to the Lord all the earth.",
          },
          {
            title: "Congregation",
            text:
              "Congregation: Serve the Lord with gladness; " +
              "come into his presence with singing.",
          },
          {
            title: "Leader",
            text:
              "Leader: Know that the Lord he is God. " +
              "It is he who made us and we are his.",
          },
          {
            title: "Congregation",
            text:
              "Congregation: We are his people " +
              "and the sheep of his pasture.",
          },
          {
            title: "Leader",
            text:
              "Leader: Enter his gates with thanksgiving " +
              "and his courts with praise.",
          },
          {
            title: "Congregation",
            text:
              "Congregation: For the Lord is good; " +
              "his steadfast love endures forever.",
          },
        ],
      },
      {
        title: "Scripture Reading — Ephesians 2",
        type: "scripture",
        slides: [
          {
            title: "Ephesians 2:8-9",
            text:
              "For by grace you have been saved through faith. " +
              "And this is not your own doing; it is the gift of God, " +
              "not a result of works so that no one may boast.",
          },
          {
            title: "Ephesians 2:10",
            text:
              "For we are his workmanship created in Christ Jesus " +
              "for good works which God prepared beforehand " +
              "that we should walk in them.",
          },
        ],
      },
      {
        title: "Sermon — Grace That Changes Everything",
        type: "sermon",
        slides: [
          {
            // Trigger phrases are distinctive so an exact match scores very
            // high while a loose paraphrase does not clear the 93 floor.
            title: "Point 1",
            text: "Point one: Grace finds us right where we are.",
          },
          {
            title: "Point 2",
            text: "Point two: Grace sets us free from the weight of sin.",
          },
          {
            title: "Point 3",
            text: "Point three: Grace sends us out to love our neighbor.",
          },
        ],
      },
      {
        title: "Closing Song — Doxology",
        type: "song",
        slides: [
          {
            title: "Doxology",
            structureLabel: "verse1",
            text:
              "Praise God from whom all blessings flow. " +
              "Praise him all creatures here below. " +
              "Praise him above ye heavenly host. " +
              "Praise Father Son and Holy Ghost. Amen.",
          },
        ],
      },
      {
        title: "Benediction",
        type: "reading",
        slides: [
          {
            title: "Benediction",
            text:
              "Now may the grace of our Lord Jesus Christ " +
              "and the love of God and the fellowship of the Holy Spirit " +
              "be with you all. Go in peace.",
          },
        ],
      },
    ],
  );
}

/** Convenience id lookups the tests use to reference specific slides. */
export function slideIdByTitle(plan: ServicePlan, title: string): string {
  for (const section of plan.sections) {
    for (const slide of section.slides) {
      if (slide.title === title) return slide.slideId;
    }
  }
  throw new Error(`no slide titled "${title}"`);
}
