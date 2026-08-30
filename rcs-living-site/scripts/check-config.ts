/**
 * Asserts the hand-tuned fallback still satisfies every design property.
 * Run with `npm run check:config`.
 */
import { defaultConfig } from "../lib/defaultConfig";
import { validateConfig } from "../lib/validateConfig";

const result = validateConfig(defaultConfig);

if (result.valid) {
  console.log("defaultConfig passes validation.");
  process.exit(0);
}

console.error(`defaultConfig failed validation (${result.failures.length}):`);
for (const failure of result.failures) console.error(`  - ${failure}`);
process.exit(1);
