/**
 * Manual generation, for testing an edition without waiting for the cron.
 *
 *   npm run regenerate              # today, saved to Supabase
 *   npm run regenerate -- --dry     # generate and print, save nothing
 *   npm run regenerate -- --date=2026-12-25
 *
 * Reads .env.local, so the same variables Vercel holds work here. Nothing in
 * the imports below touches process.env at import time — every env read is
 * lazy — so loading the file after the imports is safe.
 */
import { config as loadEnv } from "dotenv";

import { runGeneration } from "../lib/runGeneration";
import { validateConfig } from "../lib/validateConfig";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const rule = (label: string) => console.log(`\n${label}\n${"-".repeat(label.length)}`);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const dateArg = args.find((arg) => arg.startsWith("--date="))?.slice("--date=".length);

  if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    console.error(`--date must be YYYY-MM-DD, got "${dateArg}"`);
    process.exit(1);
  }

  console.log(
    `Mounting the edition for ${dateArg ?? "today"}${dry ? " (dry run — nothing will be saved)" : ""}...`,
  );

  const summary = await runGeneration({ date: dateArg, save: !dry });

  rule("Inputs");
  console.log(`date              ${summary.date}`);
  console.log(`holiday           ${summary.holiday ?? "none"}`);
  console.log(`announcements     ${summary.announcementCount}`);
  console.log(
    `weather           ${summary.weatherDegraded ? "FALLBACK (Open-Meteo unreachable)" : "live from Open-Meteo"}`,
  );

  summary.rejected.forEach((failures, index) => {
    rule(`Attempt ${index + 1} rejected`);
    for (const failure of failures) console.log(`  - ${failure}`);
  });

  if (!summary.ok || !summary.config) {
    rule("Missed");
    console.error(summary.reason ?? "Unknown failure.");
    console.error("Yesterday's edition stays up. Nothing was written.");
    process.exit(1);
  }

  const { config } = summary;

  rule(`Edition — accepted on attempt ${summary.attempts}`);
  console.log(`tone              ${config.mood.tone}`);
  console.log(`sky               ${config.mood.skyGradient.join("  ")}`);
  console.log(`accent / text     ${config.mood.accentColor}  /  ${config.mood.textColor}`);
  console.log(
    `weather           ${config.weather.condition}, ${config.weather.tempF}°F, ${config.weather.cloudCoverPct}% cloud`,
  );
  console.log(`\nheroLine          ${config.heroLine}`);
  console.log(`\nwhatWeAre         ${config.sectionCopy.whatWeAre}`);
  console.log(`\nproducts          ${config.sectionCopy.products}`);
  console.log(`\ndailyEntry        ${config.dailyEntry}`);
  console.log(`\nannouncement      ${config.announcement ?? "none"}`);

  rule("Result");
  console.log(`validation        ${validateConfig(config).valid ? "passes" : "FAILS"}`);
  console.log(
    `saved             ${summary.saved ? `yes — living_site.configs, date ${summary.date}` : "no (dry run)"}`,
  );
  if (summary.saved) console.log("\nRun `npm run dev` and reload to see it.");
}

main().catch((cause: unknown) => {
  // Missing env vars and unreachable databases land here, not in the summary.
  console.error(`\nCould not run the generation: ${cause instanceof Error ? cause.message : String(cause)}`);
  console.error("Check .env.local against .env.example.");
  process.exit(1);
});
