import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

/**
 * Vitest runs the specs in a real Chromium supplied by Playwright.
 *
 * Two things this buys over the Karma setup it sits alongside:
 *
 * - Vite serves the repository root, so `examples/DataNFT/**` and
 *   `examples/Data/**` are fetchable by the specs with no proxy configuration.
 * - Specs import `src/` directly. Vite compiles the TypeScript, so the tests
 *   exercise the code that ships as `dist/` without a webpack build in between,
 *   and coverage of `src/` becomes meaningful (see #580).
 *
 * The browser is managed by Playwright rather than installed with apt, which is
 * the flaky step described in #602.
 *
 * Scope: this is the first slice of #579. It covers the default ES6/TypeScript
 * target only. Extending to the full seven-target matrix, and retiring Karma,
 * is tracked as follow-up work.
 */
export default defineConfig({
  test: {
    include: ["tests/vitest/**/*.test.ts"],

    // WASM instantiation and NFT dataset loading are slow; the pinball fset3
    // alone is ~640 kB and the KPM data has to be parsed before a marker
    // resolves.
    testTimeout: 60_000,
    hookTimeout: 90_000,

    browser: {
      enabled: true,
      headless: true,
      screenshotFailures: false,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },

    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Instrumenting the Emscripten glue or the legacy bundle produces a large
      // and meaningless number; only src/ is the library's own code.
      exclude: ["src/**/*.d.ts", "build/**", "dist/**"],
      reporter: ["text", "lcov"],
    },
  },
});
