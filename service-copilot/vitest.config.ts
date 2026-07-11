import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Determinism is the whole point of MVP 1: no timers, no randomness that
    // isn't seeded, no network. Keep the environment plain so tests are
    // reproducible on any machine (and in CI).
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
