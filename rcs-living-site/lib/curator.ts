import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { baseInfo, products } from "@/lib/baseInfo";
import { requireAnthropicKey } from "@/lib/env";
import type { AnnouncementRow } from "@/lib/supabase";
import { COPY_LIMITS, describeDesignRules, validateConfig } from "@/lib/validateConfig";
import type { HexColor, SiteConfig, Weather } from "@/types/siteConfig";

export const CURATOR_MODEL = "claude-sonnet-5";
export const MAX_ATTEMPTS = 3;

export const CURATOR_SYSTEM_PROMPT = `You are the curator of Rustic Clouds Studio's living site. Mount today's edition — one cohesive concept from today's sky, season, holiday, and studio news. Gallery discipline: one idea, quiet over loud, festive means elegant. Respond ONLY with JSON matching SiteConfig.

THE CONCEPT
Everything in the edition — the sky, the accent, the hero line, the entry — serves one idea drawn from today's facts. Not four ideas politely arranged. If the sky is low and grey and there is nothing else, the edition is about that.

VOICE
Plain, specific, unhurried. Concrete nouns over adjectives. Never markety, never twee, no exclamation marks, no rhetorical questions. A holiday is a change of light, not a theme party: "festive" means one considered gesture, not decoration.

THE FIELDS
- heroLine: the concept in one line. It is the largest text on the page.
- sectionCopy.whatWeAre: the day's angle on the studio. The locked definition is printed above this line on the page — do not restate, summarise or rewrite it. Add the view from today instead.
- sectionCopy.products: an introduction to the product list. You may name products, but only exactly as they are written below.
- dailyEntry: the day's short entry — what the weather is doing and what that makes today good for.
- announcement: only when there is studio news below. Compose one line from it; keep every fact intact, and never invent news.
- mood: the palette. Read the design rules as hard constraints, not suggestions.

READ-ONLY STUDIO DATA
The studio block in the brief — the definition, the product names, their
domains and statuses, the closing line, the founder — is locked. It is context
for you to write around, and the page renders it verbatim from its own source.
You may refer to any of it. You may not restate the definition, rename a
product, alter or invent a status, or put any URL or domain in your copy: every
link on the page is rendered from the locked data, so a link in generated copy
is always wrong.

DESIGN RULES — an edition that breaks one is rejected and sent back to you:
${describeDesignRules()}`;

/**
 * Structural schema only. Character limits, hex patterns and stop counts are
 * deliberately left out: `validateConfig` already enforces them with specific
 * feedback, and keeping the schema to types and enums avoids depending on which
 * JSON Schema keywords the structured-output endpoint accepts.
 */
const SiteConfigSchema = z.object({
  date: z.string(),
  weather: z.object({
    condition: z.enum([
      "clear",
      "partly-cloudy",
      "cloudy",
      "overcast",
      "fog",
      "drizzle",
      "rain",
      "storm",
      "snow",
      "wind",
    ]),
    cloudCoverPct: z.number(),
    tempF: z.number(),
  }),
  holiday: z.string().nullable(),
  mood: z.object({
    skyGradient: z.array(z.string()),
    accentColor: z.string(),
    textColor: z.string(),
    tone: z.enum(["calm", "bright", "moody", "stormy", "festive"]),
  }),
  heroLine: z.string(),
  sectionCopy: z.object({ whatWeAre: z.string(), products: z.string() }),
  dailyEntry: z.string(),
  announcement: z.string().nullable(),
});

export interface CuratorContext {
  date: string;
  weather: Weather;
  /** True when the sky came from the fallback rather than Open-Meteo. */
  weatherDegraded: boolean;
  holiday: string | null;
  announcements: AnnouncementRow[];
  /** The last edition, so today's does not repeat it. */
  previous: SiteConfig | null;
}

export class CuratorError extends Error {
  constructor(
    message: string,
    readonly failures: string[],
    readonly attempts: number,
  ) {
    super(message);
    this.name = "CuratorError";
  }
}

function buildBrief(context: CuratorContext): string {
  const { date, weather, holiday, announcements, previous } = context;

  const lines = [
    `TODAY: ${date} in ${baseInfo.location}.`,
    `SKY: ${weather.condition}, ${weather.tempF}°F, ${weather.cloudCoverPct}% cloud cover.${
      context.weatherDegraded ? " (Live weather was unavailable; treat this as approximate.)" : ""
    }`,
    `HOLIDAY: ${holiday ?? "none"}.`,
    "",
    "THE STUDIO — READ-ONLY. Reference it; never alter it.",
    `  ${baseInfo.name}, ${baseInfo.location}.`,
    `  Definition (printed verbatim on the page): ${baseInfo.definition}`,
    `  Founder: ${baseInfo.founder.name}.`,
    "",
    "THE PRODUCTS — READ-ONLY. Names and statuses exactly as written:",
    ...products.map(
      (product) =>
        `  ${product.name} [${product.status}]${product.description ? ` — ${product.description}` : ""}`,
    ),
    `  The grid closes with: "${baseInfo.productsClosingLine}"`,
    "",
  ];

  if (announcements.length > 0) {
    lines.push(
      "STUDIO NEWS — compose the announcement line from this, keeping every fact intact:",
      ...announcements.map((a) => `- ${a.text}`),
      "",
    );
  } else {
    lines.push("STUDIO NEWS: none today. Set announcement to null.", "");
  }

  if (previous) {
    lines.push(
      "YESTERDAY'S EDITION — today's must not repeat its concept, its palette, or its opening words:",
      `- heroLine: ${previous.heroLine}`,
      `- tone: ${previous.mood.tone}, sky: ${previous.mood.skyGradient.join(" → ")}`,
      `- entry: ${previous.dailyEntry}`,
      "",
    );
  }

  lines.push(
    `Set date to "${date}", and copy the weather and holiday facts above into their fields verbatim.`,
    "Mount today's edition.",
  );

  return lines.join("\n");
}

/**
 * Editorial checks that sit alongside the design rules: the curator does not
 * get to invent studio news, or to silently drop it.
 */
function editorialFailures(config: SiteConfig, context: CuratorContext): string[] {
  const failures: string[] = [];
  const hasNews = context.announcements.length > 0;

  // Every link on the page is rendered from baseInfo, so a URL in generated
  // copy is either invented or a mangled copy of a real one. The announcement
  // is exempt: it is composed from studio news the user wrote, which may
  // legitimately carry a link.
  const linkPattern = /(https?:\/\/|\b[a-z0-9-]+\.(?:com|net|org|io|co|app|dev|studio)\b)/i;
  const authored: Array<[string, string]> = [
    ["heroLine", config.heroLine],
    ["sectionCopy.whatWeAre", config.sectionCopy.whatWeAre],
    ["sectionCopy.products", config.sectionCopy.products],
    ["dailyEntry", config.dailyEntry],
  ];

  for (const [field, value] of authored) {
    const match = linkPattern.exec(value ?? "");
    if (match) {
      failures.push(
        `${field} contains "${match[0]}". Generated copy must not contain URLs or domains — ` +
          `every link on the page is rendered from the locked studio data. Remove it.`,
      );
    }
  }

  if (hasNews && config.announcement === null) {
    failures.push(
      `There is active studio news today, so announcement must not be null. Compose one line (max ${COPY_LIMITS.announcement} characters) from: ${context.announcements
        .map((a) => a.text)
        .join(" | ")}`,
    );
  }

  if (!hasNews && config.announcement !== null) {
    failures.push("There is no studio news today, so announcement must be null. Do not invent an announcement.");
  }

  return failures;
}

/** Facts are ours, not the model's — it may only phrase them. */
function withKnownFacts(config: SiteConfig, context: CuratorContext): SiteConfig {
  return {
    ...config,
    date: context.date,
    weather: context.weather,
    holiday: context.holiday,
    mood: {
      ...config.mood,
      skyGradient: config.mood.skyGradient.map((stop) => stop.trim() as HexColor),
      accentColor: config.mood.accentColor.trim() as HexColor,
      textColor: config.mood.textColor.trim() as HexColor,
    },
    announcement: context.announcements.length === 0 ? null : config.announcement,
  };
}

export interface GenerationResult {
  config: SiteConfig;
  attempts: number;
  /** Failures from the attempts that were rejected before this one succeeded. */
  rejected: string[][];
}

/**
 * Asks the curator for today's edition, and keeps asking — with the specific
 * design failures quoted back — until it passes or the attempts run out.
 */
export async function generateEdition(context: CuratorContext): Promise<GenerationResult> {
  const client = new Anthropic({ apiKey: requireAnthropicKey() });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildBrief(context) }];
  const rejected: string[][] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await client.messages.parse({
      model: CURATOR_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: CURATOR_SYSTEM_PROMPT,
      messages,
      output_config: { format: zodOutputFormat(SiteConfigSchema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new CuratorError(
        `Curator returned no parseable JSON on attempt ${attempt} (stop_reason: ${response.stop_reason}).`,
        [],
        attempt,
      );
    }

    const candidate = withKnownFacts(parsed as SiteConfig, context);
    const failures = [...validateConfig(candidate).failures, ...editorialFailures(candidate, context)];

    if (failures.length === 0) {
      return { config: candidate, attempts: attempt, rejected };
    }

    rejected.push(failures);

    if (attempt === MAX_ATTEMPTS) {
      throw new CuratorError(
        `Curator could not produce a valid edition in ${MAX_ATTEMPTS} attempts.`,
        failures,
        attempt,
      );
    }

    messages.push(
      { role: "assistant", content: JSON.stringify(candidate) },
      {
        role: "user",
        content: [
          "That edition was rejected. Each line below names what failed, the measurement, and the fix:",
          ...failures.map((failure) => `- ${failure}`),
          "",
          "Return the complete JSON again. Keep the concept and the copy that passed; change only what these failures require.",
        ].join("\n"),
      },
    );
  }

  // Unreachable: the loop either returns or throws on the final attempt.
  throw new CuratorError("Curator loop exited unexpectedly.", [], MAX_ATTEMPTS);
}
