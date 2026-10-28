import { configDefaults, defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

/**
 * Vitest runs the specs in a real Chromium supplied by Playwright.
 *
 * - Vite serves the repository root, so `examples/DataNFT/**`, `examples/Data/**`
 *   and the committed `build/` and `dist/` artifacts are fetchable by the specs
 *   with no proxy configuration.
 * - Specs import `src/` directly. Vite compiles the TypeScript, so the tests
 *   exercise the code that ships as `dist/` without a bundler build in between,
 *   and coverage of `src/` becomes meaningful (see #580).
 * - Each test file runs in its own iframe. The legacy builds set page globals, so
 *   `tests/vitest/legacy-*.test.ts` rely on this to keep one build per page.
 *
 * The browser is managed by Playwright rather than installed with apt, which is
 * the flaky step described in #602. It is the only browser the suite needs.
 */
/**
 * The spec files that instantiate the threaded (td) WASM build: each such module reserves
 * a 1 GB shared memory (MAXIMUM_MEMORY in tools/makem.js), starts its pthreads as nested
 * workers on demand (no pool), and a same-thread td core is never torn down (#695), so its
 * memory stays until the file's page goes. Run in parallel with each other, these files
 * exhausted the browser's resources and hung the run (#720, 2026-10-27: a threaded worker
 * stopped answering, then the page closed with VITEST_BROWSER_CONNECTION_CLOSED). The
 * "threaded" project below runs them one at a time, after the rest of the suite, which
 * stays parallel. `npm test` still runs both projects.
 */
const THREADED = [
  "tests/vitest/camera-lens.test.ts",
  "tests/vitest/dist-bundle.test.ts",
  "tests/vitest/incremental-markers.test.ts",
  "tests/vitest/kpm-cost.test.ts",
  "tests/vitest/legacy-thread.test.ts",
  "tests/vitest/marker-limit.test.ts",
  "tests/vitest/marker-loading.test.ts",
  "tests/vitest/module-surface.test.ts",
  "tests/vitest/multi-marker.test.ts",
  "tests/vitest/runtime-settings.test.ts",
  "tests/vitest/tracker-worker.test.ts",
  "tests/vitest/tracker.test.ts",
  "tests/vitest/variant-constants.test.ts",
];

export default defineConfig({
  // The threaded build needs SharedArrayBuffer, which browsers only provide to
  // cross-origin isolated pages.
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },

  test: {
    // Copies the built tracker worker bundles and the UMD bundles to tests/vitest/.dist/
    // as .txt, so that tracker-worker.test.ts and dist-bundle.test.ts can load them from
    // Blob URLs untransformed (#720 D15).
    globalSetup: ["tests/vitest/setup/worker-sources.ts"],

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

    projects: [
      {
        extends: true,
        test: {
          name: "parallel",
          // `include` is set per project, not above: `extends` concatenates arrays, so a
          // shared include would put every file in both projects.
          include: ["tests/vitest/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...THREADED],
          sequence: { groupOrder: 0 },
          // Each browser project runs its own API server. Vitest numbers them from its
          // default 63315 up, a range Windows may reserve (EACCES; hence the
          // `--api.port=5199` habit on this project's machines). Fixed low ports instead.
          api: { port: 5200 },
        },
      },
      {
        extends: true,
        test: {
          name: "threaded",
          include: THREADED,
          // One file at a time (see THREADED), in a group after "parallel".
          fileParallelism: false,
          sequence: { groupOrder: 1 },
          api: { port: 5201 },
        },
      },
    ],

    coverage: {
      // istanbul, not v8 (#580). v8 collects coverage inside the JS engine for
      // every script on the page, which made the legacy builds' loading tests
      // (legacy-min, legacy-debug) 15-20x slower and time out. istanbul
      // instruments only the files in `include`, so build/ and dist/ run at
      // full speed.
      provider: "istanbul",
      include: ["src/**/*.ts"],
      // Instrumenting the Emscripten glue or the legacy bundle produces a large
      // and meaningless number; only src/ is the library's own code.
      exclude: ["src/**/*.d.ts", "build/**", "dist/**"],
      reporter: ["text", "lcov"],
    },
  },
});
