# Retiring Karma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every browser build artifact a Vitest test that detects a real NFT marker, then remove Karma and everything that exists only for it.

**Architecture:**
- One shared helper, `tests/vitest/legacy.ts`, defines a three-test suite (initialise, detect pinball, projection planes) for any build that exposes the legacy `ARControllerNFT` API.
- Five one-line files run it on the global builds, injected by script tag. Vitest's browser mode gives each file its own iframe, so their globals never meet. A sixth file runs it on the embed ES6 module.
- `module-surface.test.ts` loops its runtime-export checks over all four ES6 module builds.
- The removal then deletes Karma's configs, specs, dependencies, scripts and CI steps, and rewrites the docs.

**Tech Stack:** Vitest 5 browser mode (`@vitest/browser-playwright`, Chromium), TypeScript specs, Emscripten build artifacts (committed), GitHub Actions.

**Spec:** [specs/2026-09-24-retire-karma-design.md](2026-09-24-retire-karma-design.md)

## Global Constraints

- **No product changes:** no change to `build/`, `dist/`, `emscripten/`, `src/` or `js/`. This is test and tooling work; no Docker rebuild.
- **`specs/*.md` are dated records:** do not edit them, apart from this plan.
- **The Node suite stays:** after this work, `"test": "npm run test:vitest && npm run test:node"`.
- **Commits:** Conventional Commits, types limited to `feat fix perf doc refactor test style chore`. Commits are GPG-signed; never pass `--no-verify` or `--no-gpg-sign`. End each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Exactly two implementation commits,** so the replacement and the removal can be reviewed side by side:
  - `test: cover every build target in Vitest` (Tasks 1–5);
  - `chore: remove Karma` (Tasks 6–7).
- **Issue references:** `Refs #579` and `Refs #602`. Never `Fixes` or `Closes`; the maintainer closes issues.
- **The PR targets `dev`,** titled `test: retire Karma in favour of Vitest`.
- **Environment (this Windows machine):**
  - run npm through `node --use-system-ca "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js"` (TLS);
  - run Vitest as `node node_modules/vitest/vitest.mjs run <files>`;
  - push with `git -c http.sslBackend=schannel push`.
- **Working directory:** the worktree `C:\Users\perda\kalwalt-github\webarkit-org\jsartoolkitNFT\.claude\worktrees\retire-karma`, branch `test/retire-karma`.

## Measured baseline

Measured on 2026-09-24 in desktop Chromium against the committed `dev` artifacts, on the full 2000×1500 `examples/node/pinball-demo.jpg`. The first three columns are milliseconds.

| Build | `artoolkitNFT-loaded` | Load pinball | First `process()` | Frames to detect |
|---|---|---|---|---|
| `artoolkitNFT_wasm.js` | 51 | 652 | 493 | 1 |
| `artoolkitNFT_wasm.simd.js` | 299 | 349 | 485 | 1 |
| `artoolkitNFT.min.js` (asm.js) | 77 | 3901 | 5541 | 1 |
| `artoolkitNFT.debug.js` (asm.js) | 153 | 4006 | 5705 | 1 |
| `artoolkitNFT_thread.js` | 182 | 632 | 19 (worker) | 28 |
| `artoolkitNFT_embed_ES6_wasm.js` | n/a (import) | not timed | not timed | 1 |

The spec's frame-scale rule reduces `min` and `debug` to 0.5 only if a file takes over 30 s. At about 10 s they stay at scale 1. The timeouts below leave room for CI runners two to three times slower.

Also confirmed:
- all five global builds fire `artoolkitNFT-loaded` on `window`, and expose `window.ARControllerNFT` and `window.artoolkitNFT.setup`;
- the embed module exposes `ARControllerNFT`, `ARCameraParamNFT`, `HEAPU8`, `FS`, `_malloc` and `_free`, but **not** `ARToolKitNFT`.

## Review Focus

1. **Two builds in one page:** a legacy build loading into a page where another build already set the globals (file isolation off, or `dist-bundle.test.ts` sharing the page). This should fail with an explicit "isolation" error, not a confusing mixed state. `injectLegacyBuild` guards it (Task 1). Task 2 runs all legacy files in one invocation.
2. **A build that never initialises:** the script loads but never fires `artoolkitNFT-loaded`. The failure should name the file within 30 s, not hit the generic hook timeout. Task 1, step 7.
3. **Missing camera parameters:** the camera parameter file fails to load. The legacy API reports this by calling `onload(err)`, so an `onload` that ignores its argument would wrongly treat it as success. `createController` rejects with a message instead. Task 1, step 7.
4. **The threaded build's detection is asynchronous:** it is found only after the worker finishes (28 frames in the baseline). A single `process()` call would falsely fail, so the detect loop yields between frames. Task 2 runs `legacy-thread`.
5. **Slow CI runners on asm.js:** the detect test's timeout is 120 s against a ~10 s desktop run, so a slow runner does not flake. Task 2 records the per-file times.

---

### Task 1: The legacy suite helper, proven on `artoolkitNFT_wasm.js`

**Files:**
- Create: `tests/vitest/legacy.ts`
- Create: `tests/vitest/legacy-wasm.test.ts`

**Interfaces:**
- Consumes (existing):
  - `CAMERA_PARAM`, `MARKER_PINBALL` and `loadMarker(controller, url, timeoutMs?) => Promise<number>` from `tests/vitest/helpers.ts`;
  - `loadCompositeFrames(scale?) => Promise<{ both: ImageData; pinballOnly: ImageData; width: number; height: number }>` from `tests/vitest/frames.ts`.
- Produces:
  - `interface LegacyApi { ARControllerNFT: new (width: number, height: number, cameraParam: string) => any }`
  - `interface SuiteOptions { frameScale?: number; maxFrames?: number }`
  - `injectLegacyBuild(buildFile: string): Promise<LegacyApi>`
  - `controllerDetectionSuite(label: string, loadApi: () => Promise<LegacyApi>, options?: SuiteOptions): void`
  - `legacyDetectionSuite(buildFile: string, options?: SuiteOptions): void`

- [ ] **Step 1: Install dependencies in the worktree**

```bash
node --use-system-ca "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" ci --no-audit --no-fund
node --use-system-ca node_modules/playwright/cli.js install chromium
```

Expected: `added N packages`, and Chromium installed or already present.

- [ ] **Step 2: Write the test file first**

`tests/vitest/legacy-wasm.test.ts`:

```ts
import { legacyDetectionSuite } from "./legacy";

legacyDetectionSuite("artoolkitNFT_wasm.js");
```

- [ ] **Step 3: Run it to see it fail**

Run: `node node_modules/vitest/vitest.mjs run tests/vitest/legacy-wasm.test.ts`
Expected: FAIL, with an error that `./legacy` cannot be resolved.

- [ ] **Step 4: Write the helper**

`tests/vitest/legacy.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CAMERA_PARAM, MARKER_PINBALL, loadMarker } from "./helpers";
import { loadCompositeFrames } from "./frames";

/**
 * One detection suite for every build that exposes the legacy controller API:
 * the global builds (`js/artoolkitNFT.api.js`, injected with a script tag) and
 * the embed ES6 build (`js/artoolkitNFT_ES6.api.js`, imported).
 *
 * Each suite detects the pinball print in `examples/node/pinball-demo.jpg`, so a
 * build that loads but no longer tracks (a bad SIMD flag, a missing runtime
 * export) fails here rather than in a user's camera. It replaces Karma, whose
 * specs only checked that methods existed (#579).
 *
 * The global builds set page globals (`Module`, `artoolkitNFT`,
 * `ARControllerNFT`), so two cannot share a page. Vitest's browser mode runs each
 * test file in its own iframe, which is why there is one `legacy-*.test.ts` file
 * per build.
 */

/** What a suite needs from a build: the legacy controller class. */
export interface LegacyApi {
  ARControllerNFT: new (width: number, height: number, cameraParam: string) => any;
}

export interface SuiteOptions {
  /** Scale for the 2000x1500 photo. The spec allows 0.5 only for a file over 30 s. */
  frameScale?: number;
  /** Frames to push before giving up on detection. The threaded build needed 28. */
  maxFrames?: number;
}

/** Longest a build or its camera parameters may take to become ready. */
const READY_TIMEOUT_MS = 30_000;

/**
 * The asm.js builds (`min`, `debug`) took about 4 s to load pinball and 5.5 s for
 * one detection pass at 2000x1500 on a desktop; CI runners are slower.
 */
const DETECT_TIMEOUT_MS = 120_000;

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Load a global build from `build/` and resolve once its runtime is ready. */
export function injectLegacyBuild(buildFile: string): Promise<LegacyApi> {
  const w = window as any;
  if (w.artoolkitNFT || w.ARControllerNFT) {
    return Promise.reject(
      new Error(
        `legacy globals are already defined before loading ${buildFile}: ` +
          "another build ran in this page, so test-file isolation is off",
      ),
    );
  }
  return new Promise<LegacyApi>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(`${buildFile} loaded but never fired artoolkitNFT-loaded within ${READY_TIMEOUT_MS} ms`),
        ),
      READY_TIMEOUT_MS,
    );
    // Listen before injecting: a cached script can initialise before a listener
    // attached afterwards would exist.
    window.addEventListener(
      "artoolkitNFT-loaded",
      () => {
        clearTimeout(timer);
        resolve({ ARControllerNFT: w.ARControllerNFT });
      },
      { once: true },
    );
    const script = document.createElement("script");
    script.src = `/build/${buildFile}`;
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`could not load /build/${buildFile}`));
    };
    document.head.appendChild(script);
  });
}

/**
 * Construct a controller and wait for it. The legacy API reports readiness by
 * calling `onload` from a `setTimeout`, so assigning it after construction is in
 * time. A failed camera load also calls `onload`, with the error as argument.
 */
function createController(api: LegacyApi, width: number, height: number): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    const ar = new api.ARControllerNFT(width, height, CAMERA_PARAM);
    const timer = setTimeout(
      () => reject(new Error(`controller never called onload within ${READY_TIMEOUT_MS} ms`)),
      READY_TIMEOUT_MS,
    );
    ar.onload = (err?: unknown) => {
      clearTimeout(timer);
      if (err !== undefined) {
        reject(new Error(`camera parameters failed to load (${CAMERA_PARAM}): ${err}`));
      } else {
        resolve(ar);
      }
    };
  });
}

/** A pose from a real detection: 16 finite values, and not the identity. */
function expectRealPose(matrix: ArrayLike<number>): void {
  const values = Array.from(matrix);
  expect(values).toHaveLength(16);
  expect(values.every(Number.isFinite)).toBe(true);
  expect(values).not.toEqual(IDENTITY);
}

export function controllerDetectionSuite(
  label: string,
  loadApi: () => Promise<LegacyApi>,
  options: SuiteOptions = {},
): void {
  const maxFrames = options.maxFrames ?? 200;

  describe(`legacy controller API (${label})`, () => {
    let ar: any;
    let frame: ImageData;

    beforeAll(async () => {
      const api = await loadApi();
      const frames = await loadCompositeFrames(options.frameScale ?? 1);
      frame = frames.pinballOnly;
      ar = await createController(api, frames.width, frames.height);
    }, 90_000);

    afterAll(() => {
      ar?.dispose?.();
    });

    it("initialises a controller", () => {
      expect(ar.id).toBeGreaterThanOrEqual(0);
      const camera = Array.from(ar.getCameraMatrix() as ArrayLike<number>);
      expect(camera).toHaveLength(16);
      expect(camera.every(Number.isFinite)).toBe(true);
    });

    it(
      "detects the pinball marker",
      async () => {
        const id = await loadMarker(ar, MARKER_PINBALL, 60_000);
        ar.trackNFTMarkerId(id);

        const found: { pose?: number[] } = {};
        const onFound = (ev: any) => {
          if (ev.data.index === id) found.pose = Array.from(ev.data.matrixGL_RH as ArrayLike<number>);
        };
        ar.addEventListener("getNFTMarker", onFound);
        try {
          // Yield between frames: the threaded build detects on a worker, so a
          // frame only reports the marker once that worker has finished.
          for (let i = 0; i < maxFrames && !found.pose; i++) {
            ar.process(frame);
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        } finally {
          ar.removeEventListener("getNFTMarker", onFound);
        }

        if (!found.pose) throw new Error(`pinball was not detected in ${maxFrames} frames`);
        expectRealPose(found.pose);
      },
      DETECT_TIMEOUT_MS,
    );

    it("sets and reads the projection planes", () => {
      ar.setProjectionNearPlane(1);
      expect(ar.getProjectionNearPlane()).toBeCloseTo(1, 5);
      ar.setProjectionFarPlane(2000);
      expect(ar.getProjectionFarPlane()).toBeCloseTo(2000, 5);
    });
  });
}

/** The suite for one global build in `build/`, loaded with a script tag. */
export function legacyDetectionSuite(buildFile: string, options?: SuiteOptions): void {
  controllerDetectionSuite(buildFile, () => injectLegacyBuild(buildFile), options);
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `node node_modules/vitest/vitest.mjs run tests/vitest/legacy-wasm.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Break it on purpose (a): no detection**

Temporarily change `frame = frames.pinballOnly;` to `frame = new ImageData(frames.width, frames.height);` in `legacy.ts`, then run step 5's command.
Expected: FAIL in "detects the pinball marker", with `pinball was not detected in 200 frames`. Revert the change, and write down the result for the PR description.

- [ ] **Step 7: Break it on purpose (b): missing build, never-initialising build, missing camera parameters**

Run step 5's command once after each temporary change, reverting it before the next:
1. In `legacy-wasm.test.ts`, use `"artoolkitNFT_missing.js"`. Expected: FAIL in `beforeAll` with `could not load /build/artoolkitNFT_missing.js`, in well under a second.
2. In `legacy.ts`, change `script.src = \`/build/${buildFile}\`;` to `script.src = "/js/OneEuroFilter.js";`. Expected: FAIL after about 30 s with `artoolkitNFT_wasm.js loaded but never fired artoolkitNFT-loaded within 30000 ms`.
3. In `legacy.ts` `createController`, change `CAMERA_PARAM` in the constructor call to `"/examples/Data/missing.dat"`. Expected: FAIL with `camera parameters failed to load`.

Revert all three, run step 5 again (expected: PASS), and write down the three results for the PR description.

- [ ] **Step 8: No commit yet**

Tasks 1–5 land as one commit in Task 5. Leave the files uncommitted; `git status` should show the two new files.

---

### Task 2: The other four global builds

**Files:**
- Create: `tests/vitest/legacy-min.test.ts`
- Create: `tests/vitest/legacy-debug.test.ts`
- Create: `tests/vitest/legacy-simd.test.ts`
- Create: `tests/vitest/legacy-thread.test.ts`

**Interfaces:**
- Consumes: `legacyDetectionSuite(buildFile: string, options?: SuiteOptions)` from `tests/vitest/legacy.ts` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Write the four files**

`tests/vitest/legacy-min.test.ts`:

```ts
import { legacyDetectionSuite } from "./legacy";

legacyDetectionSuite("artoolkitNFT.min.js");
```

`tests/vitest/legacy-debug.test.ts`:

```ts
import { legacyDetectionSuite } from "./legacy";

legacyDetectionSuite("artoolkitNFT.debug.js");
```

`tests/vitest/legacy-simd.test.ts`:

```ts
import { legacyDetectionSuite } from "./legacy";

legacyDetectionSuite("artoolkitNFT_wasm.simd.js");
```

`tests/vitest/legacy-thread.test.ts`:

```ts
import { legacyDetectionSuite } from "./legacy";

// Uses SharedArrayBuffer; vitest.config.ts serves the COOP/COEP headers it needs.
legacyDetectionSuite("artoolkitNFT_thread.js");
```

- [ ] **Step 2: Run all five legacy files in one invocation**

Running them together is what exercises file isolation (Review Focus 1).

Run: `node node_modules/vitest/vitest.mjs run tests/vitest/legacy-min.test.ts tests/vitest/legacy-debug.test.ts tests/vitest/legacy-wasm.test.ts tests/vitest/legacy-simd.test.ts tests/vitest/legacy-thread.test.ts --reporter=verbose`
Expected: PASS, 15 tests (3 per file), with no "isolation is off" error.

- [ ] **Step 3: Record the time per file**

From step 2's output, note each file's duration. Expected: `min` and `debug` around 10–15 s each, the rest under 3 s.
- **If `min` or `debug` exceeds 30 s:** apply the spec's rule, changing that file's call to `legacyDetectionSuite("<file>", { frameScale: 0.5 });`, and re-run step 2.
- **Otherwise:** leave every file at scale 1.

Record the durations for the PR description either way.

---

### Task 3: The embed ES6 build

**Files:**
- Create: `tests/vitest/embed-es6.test.ts`

**Interfaces:**
- Consumes: `controllerDetectionSuite(label, loadApi, options?)` and `LegacyApi` from `tests/vitest/legacy.ts` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Write the file**

`tests/vitest/embed-es6.test.ts`:

```ts
// @ts-ignore - Emscripten output has no useful types
import ARToolkitNFTEmbed from "../../build/artoolkitNFT_embed_ES6_wasm.js";
import { controllerDetectionSuite } from "./legacy";

// The embed build is an ES6 module whose factory resolves to a module carrying
// the legacy controller API (js/artoolkitNFT_ES6.api.js): the same suite as the
// global builds, loaded by import instead of a script tag.
controllerDetectionSuite("artoolkitNFT_embed_ES6_wasm.js", () => ARToolkitNFTEmbed());
```

- [ ] **Step 2: Run it**

Run: `node node_modules/vitest/vitest.mjs run tests/vitest/embed-es6.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 3: Break it on purpose**

Temporarily replace the loader with `() => ARToolkitNFTEmbed().then(() => ({ ARControllerNFT: undefined as any }))` and run step 2's command.
Expected: FAIL in `beforeAll` with a `TypeError` (`api.ARControllerNFT is not a constructor`). Revert, and confirm step 2 passes again.

---

### Task 4: The module surface on every ES6 build

**Files:**
- Modify: `tests/vitest/module-surface.test.ts`. Replace the import on lines 2–3 and the whole `describe("Emscripten module surface", …)` block (lines 5–45 on `dev`). Leave the `describe("public package surface", …)` block unchanged.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing new.

- [ ] **Step 1: Replace the import and the first `describe` block**

The top of the file becomes:

```ts
import { describe, it, expect, beforeAll } from "vitest";
// @ts-ignore - Emscripten output has no useful types
import es6Factory from "../../build/artoolkitNFT_ES6_wasm.js";
// @ts-ignore - Emscripten output has no useful types
import es6SimdFactory from "../../build/artoolkitNFT_ES6_wasm.simd.js";
// @ts-ignore - Emscripten output has no useful types
import es6ThreadedFactory from "../../build/artoolkitNFT_ES6_wasm_td.js";
// @ts-ignore - Emscripten output has no useful types
import embedFactory from "../../build/artoolkitNFT_embed_ES6_wasm.js";

/**
 * What each Emscripten module exports.
 *
 * These assertions look trivial, and that is the point: the 1.10.1 regression
 * (#614) was nothing more than `HEAPU8` missing from EXPORTED_RUNTIME_METHODS in
 * tools/makem.js. `Module.HEAPU8` was `undefined`, so every `process()` call
 * threw, and nothing in the test suite noticed because nothing pushed a frame.
 *
 * A flag change in makem.js can silently remove any of these from any one
 * target, so every ES6 module build is checked, not just the default one.
 * Asserting the surface here fails fast and points straight at the build
 * configuration rather than at whichever call site dereferences it first.
 *
 * `api` is the class each build exposes: the binding class `ARToolKitNFT` for
 * the builds `src/` wraps, the legacy `ARControllerNFT` for the embed build.
 */
const MODULE_BUILDS: { file: string; factory: () => Promise<any>; api: string }[] = [
  { file: "artoolkitNFT_ES6_wasm.js", factory: es6Factory, api: "ARToolKitNFT" },
  { file: "artoolkitNFT_ES6_wasm.simd.js", factory: es6SimdFactory, api: "ARToolKitNFT" },
  { file: "artoolkitNFT_ES6_wasm_td.js", factory: es6ThreadedFactory, api: "ARToolKitNFT" },
  { file: "artoolkitNFT_embed_ES6_wasm.js", factory: embedFactory, api: "ARControllerNFT" },
];

for (const build of MODULE_BUILDS) {
  describe(`Emscripten module surface (${build.file})`, () => {
    let module: any;

    beforeAll(async () => {
      module = await build.factory();
    });

    it("instantiates", () => {
      expect(module).toBeDefined();
    });

    it("exports HEAPU8 (regression guard for #614)", () => {
      expect(typeof module.HEAPU8).toBe("object");
      expect(module.HEAPU8.byteLength).toBeGreaterThan(0);
    });

    it("exports the allocator used for manual video buffers", () => {
      expect(typeof module._malloc).toBe("function");
      expect(typeof module._free).toBe("function");
    });

    it("exports FS, used to stage camera and marker data", () => {
      expect(typeof module.FS).toBe("object");
    });

    it(`exposes the ${build.api} class`, () => {
      expect(typeof module[build.api]).toBe("function");
    });
  });
}
```

- [ ] **Step 2: Run it**

Run: `node node_modules/vitest/vitest.mjs run tests/vitest/module-surface.test.ts --reporter=verbose`
Expected: PASS. There are 20 surface tests (5 per build × 4 builds) plus the unchanged "public package surface" tests.

- [ ] **Step 3: Break it on purpose**

Temporarily add `if (build.file.includes("simd")) delete module.HEAPU8;` after `module = await build.factory();` and run step 2's command.
Expected: exactly one failure, `Emscripten module surface (artoolkitNFT_ES6_wasm.simd.js) > exports HEAPU8`. Revert, confirm step 2 passes, and write down the result for the PR description.

---

### Task 5: Full Vitest run and the first commit

**Files:** none new. This commits Tasks 1–4.

- [ ] **Step 1: Run the whole Vitest suite**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: every file passes. The pre-existing skips (the #612 `incremental-markers` suite and `kpm-cost`) are still skipped. The test count is the `dev` baseline plus 18 legacy and embed tests, plus 15 new surface tests.

- [ ] **Step 2: Check formatting on the new and changed files**

Run: `node node_modules/prettier/bin/prettier.cjs --check tests/vitest/legacy.ts tests/vitest/legacy-*.test.ts tests/vitest/embed-es6.test.ts tests/vitest/module-surface.test.ts`
Expected: `All matched files use Prettier code style!` If not, run the same command with `--write` in place of `--check` and re-run step 1.

- [ ] **Step 3: Commit**

```bash
git add tests/vitest/legacy.ts tests/vitest/legacy-*.test.ts tests/vitest/embed-es6.test.ts tests/vitest/module-surface.test.ts
git commit -F - <<'EOF'
test: cover every build target in Vitest

Each global build (min, debug, wasm, simd, thread) and the embed ES6 build
now gets a suite that initialises a controller, detects the pinball print
in pinball-demo.jpg and checks the projection planes. The Karma specs these
replace only checked that methods existed. The runtime-export checks in
module-surface.test.ts now run on all four ES6 module builds instead of
one.

Refs #579

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Expected: a signed commit. Check with `git log --show-signature -1`.

---

### Task 6: Remove Karma from the repository, `package.json` and CI

**Files:**
- Delete: `karma.conf.js`, `karma-debug.conf.js`, `karma-es6.conf.js`, `karma-embed-es6.conf.js`, `tests/tests.test.js`, `tests/tests-es6.test.js`, `tests/tests-embed-es6.test.js`
- Modify: `package.json` (devDependencies at lines 78–84 on `dev`, and scripts at lines 103–115)
- Modify: `package-lock.json` (regenerated)
- Modify: `.github/workflows/CI.yml` (the step at lines 20–61 on `dev`)
- Modify: `.github/workflows/publish.yml` (the step at lines 50–90 on `dev`)

**Interfaces:** none.

- [ ] **Step 1: Delete the Karma files**

```bash
git rm -q karma.conf.js karma-debug.conf.js karma-es6.conf.js karma-embed-es6.conf.js tests/tests.test.js tests/tests-es6.test.js tests/tests-embed-es6.test.js
```

- [ ] **Step 2: Edit `package.json`**

Remove these seven `devDependencies` lines:

```json
    "cross-env": "^10.1.0",
    "jasmine-core": "^6.3.0",
    "karma": "^6.4.4",
    "karma-chrome-launcher": "^3.2.0",
    "karma-firefox-launcher": "^2.1.3",
    "karma-jasmine": "^5.1.0",
    "karma-webpack": "^5.0.1",
```

Remove these eight `scripts` lines:

```json
    "test:min": "cross-env BUILD_TARGET=artoolkitNFT.min.js karma start karma.conf.js",
    "test:debug": "cross-env BUILD_TARGET=artoolkitNFT.debug.js karma start karma-debug.conf.js",
    "test:wasm": "cross-env BUILD_TARGET=artoolkitNFT_wasm.js karma start karma.conf.js",
    "test:simd": "cross-env BUILD_TARGET=artoolkitNFT_wasm.simd.js karma start karma.conf.js",
    "test:embed-es6": "karma start karma-embed-es6.conf.js",
    "test:es6": "cross-env BUILD_TARGET_ES6=artoolkitNFT_ES6_wasm.js karma start karma-es6.conf.js",
    "test:es6-simd": "cross-env BUILD_TARGET_ES6=artoolkitNFT_ES6_wasm.simd.js karma start karma-es6.conf.js",
    "test:all": "npm run test:min && npm run test:debug && npm run test:wasm && npm run test:simd && npm run test:embed-es6 && npm run test:es6 && npm run test:es6-simd",
```

Change:

```json
    "test": "npm run test:vitest && npm run test:all && npm run test:node",
```

to:

```json
    "test": "npm run test:vitest && npm run test:node",
```

Then check that nothing else references them:
Run: `grep -n -E "karma|jasmine|cross-env|test:all" package.json`
Expected: no output.

- [ ] **Step 3: Regenerate the lockfile**

Run: `node --use-system-ca "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" install --no-audit --no-fund`

Then check: `grep -c -E '"node_modules/(karma|jasmine-core|cross-env)' package-lock.json`
Expected: `0`. `git diff --stat package-lock.json` should show deletions only, or near enough. If it shows many version bumps of unrelated packages, stop and report: the install must not upgrade anything.

- [ ] **Step 4: Remove the Chrome step from both workflows**

In `.github/workflows/CI.yml`, delete the whole step, from the line `      - name: Install Chrome for Karma` through the line `          google-chrome-stable --version` inclusive. In `.github/workflows/publish.yml`, delete its step with the same first and last lines. Keep each file's `      - name: Install Playwright Chromium` step. Do this with a script, so both deletions are exact:

```bash
python - <<'EOF'
import re
for path in (".github/workflows/CI.yml", ".github/workflows/publish.yml"):
    text = open(path, encoding="utf-8").read()
    new, n = re.subn(
        r"      - name: Install Chrome for Karma\n.*?          google-chrome-stable --version\n\n",
        "",
        text,
        flags=re.S,
    )
    assert n == 1, (path, n)
    open(path, "w", encoding="utf-8", newline="\n").write(new)
    print(path, "step removed")
EOF
grep -n -i -E "chrome|playwright" .github/workflows/CI.yml .github/workflows/publish.yml
```

Expected: both `step removed` lines. The grep shows only the two `Install Playwright Chromium` steps and their `npx playwright install --with-deps chromium` lines, with no `CHROME_BIN`.

- [ ] **Step 5: Run the full suite from a clean install**

```bash
node --use-system-ca "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" ci --no-audit --no-fund
node --use-system-ca "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" test
```

Expected: Vitest passes as in Task 5, then `node --test` reports the Node suite passing. No Karma output appears.

---

### Task 7: Documentation, and the second commit

**Files:**
- Modify: `README.md` (the Dependabot badge at line 6 and the Jasmine badge at line 7; the `tests/` bullet at line 344; the "Running the tests" section at lines 348–398, which ends just before `## WebAssembly 👋`)
- Modify: `AGENTS.md` (the "Testing" section at lines 133–150)
- Modify: `CLAUDE.md` (the last bullet, lines 19–21)
- Modify: `vitest.config.ts` (the header comment, lines 4–21)
- Modify: `tests/vitest/controller.test.ts` (the header comment, lines 12–19)

**Interfaces:** none.

- [ ] **Step 1: README badges**

Replace:

```markdown
[![Tested with Jasmine](https://img.shields.io/badge/tested_with-Jasmine-8A4182.svg)](https://jasmine.github.io/)
```

with:

```markdown
[![Tested with Vitest](https://img.shields.io/badge/tested_with-Vitest-6E9F18.svg?logo=vitest&logoColor=white)](https://vitest.dev/)
```

Replace:

```markdown
![Dependabot Badge](https://flat.badgen.net/github/dependabot/webarkit/jsartoolkit-nft)
```

with:

```markdown
![Dependabot Badge](https://flat.badgen.net/github/dependabot/webarkit/jsartoolkitNFT)
```

- [ ] **Step 2: The README `tests/` bullet**

Replace:

```markdown
- `tests/` (Karma/Jasmine specs, plus the Vitest browser suite in `tests/vitest/` — see [Running the tests](#running-the-tests-))
```

with:

```markdown
- `tests/` (the Vitest browser suite in `tests/vitest/` and the Node suite in `tests/node/` — see [Running the tests](#running-the-tests-))
```

- [ ] **Step 3: The README "Running the tests" section**

Replace everything from the line `## Running the tests 🧪` up to, but not including, `## WebAssembly 👋` with the block below. The "WebAssembly" section that follows it stays unchanged.

````markdown
## Running the tests 🧪

Install dependencies, then fetch the browser the test suite drives:

```bash
npm ci
npx playwright install chromium
```

That second step is required. The browser suite runs in a real Chromium supplied by Playwright,
and without it you get a missing-executable error before any spec starts. It is the only browser
the tests need.

```bash
npm test              # everything: the browser suite, then the Node suite
npm run test:vitest   # the browser suite only
npm run test:node     # the Node suite only
npm run test:coverage # the browser suite, with an lcov report scoped to src/
```

`npm run test:vitest:watch` re-runs on change while you work. To run a single file, pass its
path:

```bash
npx vitest run tests/vitest/legacy-min.test.ts
```

What the suites cover:

- **The TypeScript API** (`tests/vitest/` over `src/`): `ARControllerNFT` as consumers import
  it. This covers marker loading, `process()`, two markers detected in a real photo and
  marker-lost events, on the default, SIMD and threaded builds.
- **Every browser build** (`legacy-*.test.ts`, `embed-es6.test.ts`, `module-surface.test.ts`):
  each committed artifact in `build/` loads, detects the pinball print in
  `examples/node/pinball-demo.jpg`, and exports what `src/` relies on (`HEAPU8`, `FS`,
  `_malloc`).
- **The published bundle** (`dist-bundle.test.ts`): `dist/ARToolkitNFT.js` loaded with a script
  tag, the way a `<script>` consumer gets it.
- **The Node build** (`tests/node/`), run with `node --test`.

Tests run against the **committed** `build/` and `dist/` artifacts. If you change anything under
`emscripten/` or `tools/makem.js`, rebuild before testing, or you will be testing stale
WebAssembly. See [AGENTS.md](AGENTS.md).

````

- [ ] **Step 4: AGENTS.md "Testing"**

Replace everything from the line `## Testing` up to, but not including, the next `---` line with:

````markdown
## Testing

```bash
npm test          # Vitest in Playwright's Chromium, then the Node suite
npm run format-check
```

`npm test` runs two suites:

- **`tests/vitest/`**, in a real Chromium. It drives `src/` (what `dist/` ships) through marker
  loading and detection on a real photo. It also detects the pinball marker once with every
  committed browser artifact in `build/`, checks each ES6 module's runtime exports, and
  smoke-tests the `dist/ARToolkitNFT.js` bundle.
- **`tests/node/`**: the Node build, with `node --test`.

A green run means every artifact loads and detects a marker in one fixed photo. It does not
measure tracking quality: stability, jitter, or loss and recovery on a moving camera. When
changing the detection or tracking path, still verify against a real example.
`examples/node/example_dist.js` runs a full detect-and-track pass on a static image with no
camera; the browser examples need one.

### New methods need new tests

**Every new method or function, in TypeScript or JavaScript, ships with a test in the same PR.**
This applies to public methods on `ARControllerNFT` or `ARToolkitNFT` in `src/`, and to
additions to the legacy APIs in `js/`. A method with no test can break in any later PR without
anyone noticing; #614 shipped exactly that way.

Put the test where the method is used:

| New code | Test goes in |
|---|---|
| A method in `src/` (all four entry points: default, `_simd`, `_td`, `_node`) | `tests/vitest/controller.test.ts`, or a focused `tests/vitest/<feature>.test.ts`. Loop over `VARIANTS` from `tests/vitest/variants.ts` when the behaviour should hold on every browser build. |
| A method on the Node build | `tests/node/` |
| A method in `js/artoolkitNFT.api.js` or `js/artoolkitNFT_ES6.api.js` | the shared suite in `tests/vitest/legacy.ts`, which runs on every legacy and embed build |
| A new `Module.x` runtime export | `tests/vitest/module-surface.test.ts` |

The test has to exercise the behaviour, not just the method's existence. Call the method and
assert on what it returns or changes. Where you can, break the implementation on purpose once
and watch the test fail, then restore it; a test that cannot fail proves nothing.

````

- [ ] **Step 5: CLAUDE.md**

Replace:

```markdown
- **A green `npm test` proves very little.** The suite never loads an NFT marker and never
  calls `process()`. Verify tracking changes against a real example such as
  `examples/node/example_dist.js`.
```

with:

```markdown
- **A green `npm test` proves the artifacts load and detect, not that tracking is good.** The
  suite detects one marker in one photo per build; it does not measure stability or recovery.
  Verify tracking changes against a real example such as `examples/node/example_dist.js`.
```

- [ ] **Step 6: The `vitest.config.ts` header comment**

Replace the comment block above `export default defineConfig({` with:

```ts
/**
 * Vitest runs the specs in a real Chromium supplied by Playwright.
 *
 * - Vite serves the repository root, so `examples/DataNFT/**`, `examples/Data/**`
 *   and the committed `build/` and `dist/` artifacts are fetchable by the specs
 *   with no proxy configuration.
 * - Specs import `src/` directly. Vite compiles the TypeScript, so the tests
 *   exercise the code that ships as `dist/` without a webpack build in between,
 *   and coverage of `src/` becomes meaningful (see #580).
 * - Each test file runs in its own iframe. The legacy builds set page globals, so
 *   `tests/vitest/legacy-*.test.ts` rely on this to keep one build per page.
 *
 * The browser is managed by Playwright rather than installed with apt, which is
 * the flaky step described in #602. It is the only browser the suite needs.
 */
```

- [ ] **Step 7: The `controller.test.ts` header comment**

Replace:

```ts
/**
 * ARControllerNFT, driven through `src/` — the code that ships as `dist/` and
 * that consumers import.
 *
 * The Karma specs this sits alongside exercise either the deprecated
 * `js/artoolkitNFT.api.js` or the raw Emscripten binding, and never load a
 * marker or push a frame. That gap is why #614 shipped: `process()` was broken
 * on every path and the suite stayed green. See #579.
 */
```

with:

```ts
/**
 * ARControllerNFT, driven through `src/` — the code that ships as `dist/` and
 * that consumers import.
 *
 * The other build artifacts get one detection suite each (`legacy-*.test.ts`,
 * `embed-es6.test.ts`); this file covers the shipped API in depth. #614 is why
 * both exist: `process()` was broken on every path while a suite that never
 * pushed a frame stayed green. See #579.
 */
```

- [ ] **Step 8: Check nothing still mentions Karma**

Run: `git grep -n -i -E "karma|jasmine|CHROME_BIN|test:all" -- . ':!specs' ':!package-lock.json'`
Expected: no output.

- [ ] **Step 9: Format check, and one last full run**

Run: `node node_modules/prettier/bin/prettier.cjs --check README.md AGENTS.md CLAUDE.md vitest.config.ts tests/vitest/controller.test.ts .github/workflows/CI.yml .github/workflows/publish.yml`
Expected: all files pass. If not, run the same command with `--write` in place of `--check`, and check that the diff contains only formatting.

Run: `node --use-system-ca "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" test`
Expected: PASS, as in Task 6, step 5.

- [ ] **Step 10: Commit**

```bash
git add -A -- package.json package-lock.json .github/workflows/CI.yml .github/workflows/publish.yml README.md AGENTS.md CLAUDE.md vitest.config.ts tests/vitest/controller.test.ts
git status --short
git commit -F - <<'EOF'
chore: remove Karma

Every target Karma ran is now covered in Vitest (previous commit), so
Karma's four configs, three specs, seven dev dependencies and eight npm
scripts go. `npm test` is now Vitest plus the Node suite.

CI and the publish workflow no longer download and install Google
Chrome: Playwright's Chromium, already installed for Vitest, is the only
browser left. A release no longer depends on dl.google.com or an apt
mirror for a browser only Karma needed.

The README swaps the Jasmine badge for Vitest, fixes the Dependabot badge
(it pointed at webarkit/jsartoolkit-nft), and rewrites "Running the
tests". AGENTS.md and CLAUDE.md no longer claim the suite never loads a
marker or calls process().

Refs #579
Refs #602

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Before committing, `git status --short` must show the seven deletions from Task 6, step 1 as staged (`D`), and nothing unstaged under `build/`, `dist/`, `src/` or `js/`. Expected: a signed commit.

---

### Task 8: Push and open the PR (only when the user says so)

**Files:** none.

- [ ] **Step 1: Ask the user before pushing**

Summarise:
- the two commits;
- the break-on-purpose results from Tasks 1, 3 and 4;
- the per-file times from Task 2.

Wait for an explicit go-ahead.

- [ ] **Step 2: Rebase if `dev` moved**

```bash
git -c http.sslBackend=schannel fetch origin
git rebase origin/dev
```

- **If `package.json` or `package-lock.json` conflict,** as expected if `chore/upgrade-deps` landed first: keep that branch's version bumps, drop the Karma entries, regenerate the lockfile as in Task 6, step 3, and re-run `npm test`.
- **If any other file conflicts,** stop and report it.

- [ ] **Step 3: Push**

Run: `git -c http.sslBackend=schannel push -u origin test/retire-karma`

- [ ] **Step 4: Open the PR against `dev`**

Title: `test: retire Karma in favour of Vitest`. The body contains:
- a summary;
- the target table from the spec;
- the "Karma assertions and where they go" table from the spec;
- the break-on-purpose results;
- the per-file times;
- `Refs #579` and `Refs #602`;
- the attribution line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Write the body to `$TEMP/retire-karma-pr.md`, then:

```bash
gh pr create --repo webarkit/jsartoolkitNFT --base dev --head test/retire-karma --title "test: retire Karma in favour of Vitest" --body-file "$TEMP/retire-karma-pr.md"
```

Expected: the PR URL. Report it to the user. The PR's CI run without the Chrome step is the final check.
