# Retiring Karma: every build target under Vitest

**Date:** 2026-09-24
**Issues:** #579 (test refresh), #602 (CI hardening)
**Builds on:** [2026-09-20-test-refresh-and-marker-fixes-design.md](2026-09-20-test-refresh-and-marker-fixes-design.md),
whose "Step 3" this is. That document chose the runner (Vitest browser mode, Playwright
provider) and the three test layers; this one does not revisit either.

## Context

`npm test` runs two browser test runners. Vitest (`tests/vitest/`) exercises `src/` against real
WASM: it loads NFT markers, pushes real frames through `process()`, and checks detection. Karma runs
seven more targets, but its three spec files mostly assert `typeof` on methods. None of them loads
a marker or detects anything.

Karma also costs more than it catches:

- CI and the npm publish workflow both download and install a system Chrome `.deb`, wrapped in
  retry loops, because Karma cannot use Playwright's Chromium ("launches but never captures").
  A release can fail on a `dl.google.com` or apt mirror hiccup.
- Karma has been deprecated by its maintainers since 2023.
- Eight npm scripts, four near-duplicate configs and seven dev dependencies exist only for it.

## Goal

`npm test` is Vitest plus the Node suite, and nothing else. Every build target Karma covered, plus
the untested legacy threaded build, gets a Vitest test that **detects the pinball marker in a real
photo**, not just a method-existence check. Karma and everything that exists only for it is
removed.

**Success:**

- CI passes with Playwright's Chromium as the only browser, and no Chrome install step.
- Breaking any committed browser artifact fails a test that names it. That means a missing file, a
  missing runtime export, or a build that runs but no longer detects.
- Nothing a Karma spec checked is silently lost: each assertion has a new home or a stated reason
  for dropping it (see "Karma assertions and where they go").

## Non-goals

- **Removing the legacy API** (`js/artoolkitNFT.api.js`, the global builds): that is #616. The
  legacy builds get one detection suite each and nothing more.
- **The Node build** (`artoolkitNFT_node_wasm.js`): it has its own `node --test` suite since #661,
  and it stays as it is.
- **Any change to `build/`, `dist/`, `emscripten/` or `src/`:** this is test and tooling work only,
  so it needs no Docker rebuild.
- **Coverage upload (#580).**

## Targets

| Karma target | Artifact | Vitest coverage after this work |
|---|---|---|
| `min` | `build/artoolkitNFT.min.js` (asm.js) | new: `legacy-min.test.ts` |
| `debug` | `build/artoolkitNFT.debug.js` (asm.js) | new: `legacy-debug.test.ts` |
| `wasm` | `build/artoolkitNFT_wasm.js` | new: `legacy-wasm.test.ts` |
| `simd` | `build/artoolkitNFT_wasm.simd.js` | new: `legacy-simd.test.ts` |
| none | `build/artoolkitNFT_thread.js` | new: `legacy-thread.test.ts` |
| `embed-es6` | `build/artoolkitNFT_embed_ES6_wasm.js` | new: `embed-es6.test.ts` |
| `es6` | `build/artoolkitNFT_ES6_wasm.js` | existing: `multi-marker.test.ts` (`wasm` variant) detects through `src/index.ts`; `module-surface.test.ts` |
| `es6-simd` | `build/artoolkitNFT_ES6_wasm.simd.js` | existing: `multi-marker.test.ts` (`wasm-simd` variant); `module-surface.test.ts` (extended) |
| none | `build/artoolkitNFT_ES6_wasm_td.js` | existing: `multi-marker.test.ts` (`wasm-threaded` variant); `module-surface.test.ts` (extended) |

## Design

### Legacy builds: one file per target, one shared helper

The legacy builds are classic scripts that set page globals (`Module`, `artoolkitNFT`,
`ARControllerNFT`, `ARCameraParamNFT`), so two of them cannot share a page. Vitest's browser mode
runs each test file in its own iframe, so one file per target gives isolation with no extra
configuration. A failure also names its target in the file name, and one target runs alone with
`npx vitest run tests/vitest/legacy-min.test.ts`.

**`tests/vitest/legacy.ts`** exports `legacyDetectionSuite(buildFile, options?)`, which defines one
`describe` block:

1. **`beforeAll`:**
   - registers a listener for `artoolkitNFT-loaded` *before* injecting
     `<script src="/build/<buildFile>">`, so a fast load cannot fire the event unheard;
   - awaits the event with a timeout, so a missing or broken build fails with a message naming the
     file instead of hanging;
   - loads the frames with `loadCompositeFrames(options.frameScale ?? 1)`.
2. **"initialises a controller":** `new ARControllerNFT(width, height, CAMERA_PARAM)` reaches
   `onload`, its `id` is non-negative, and `getCameraMatrix()` returns 16 finite values.
3. **"detects the pinball marker":**
   - loads `MARKER_PINBALL` with `loadNFTMarker` and calls `trackNFTMarkerId`;
   - pushes the `pinballOnly` frame through `process()` until a `getNFTMarker` event arrives,
     yielding between frames so the threaded build's worker can run;
   - asserts that the reported pose has 16 finite values and is not the identity matrix.
4. **"sets and reads the projection planes":** the near and far checks from `tests/tests.test.js`.

Five test files call the helper, one line each: `legacy-min`, `legacy-debug`, `legacy-wasm`,
`legacy-simd` and `legacy-thread`. The threaded one depends on `SharedArrayBuffer`, which
`vitest.config.ts` already enables with COOP/COEP headers.

**Frame scale.** `min` and `debug` are asm.js (`-s WASM=0`), so a KPM pass on the 2000×1500 photo
may take seconds. The default scale is 1. The two asm.js files pass `frameScale: 0.5` only if a
measured run takes longer than 30 s for the file. The plan records the measured times either way.

### The embed build

`artoolkitNFT_embed_ES6_wasm.js` is an ES6 module whose factory resolves to a module carrying its
own `ARCameraParamNFT` and `ARControllerNFT` (from `js/artoolkitNFT_ES6.api.js`). The API is the
legacy one, but it is loaded by `import` rather than a script tag. So `embed-es6.test.ts` is its
own file with the same three tests:

1. create an `ARCameraParamNFT` and an `ARControllerNFT`;
2. detect pinball;
3. set and read the projection planes.

It shares the pose assertions with `legacy.ts` through a small exported helper, not by copying
them.

### The module surface on every ES6 build

`module-surface.test.ts` today checks `HEAPU8`, `FS`, `_malloc`/`_free` and the binding class on
`artoolkitNFT_ES6_wasm.js` only. Its "Emscripten module surface" block becomes a loop over the four
ES6 module builds: `ES6_wasm`, `ES6_wasm.simd`, `ES6_wasm_td` and `embed_ES6_wasm`. The #614 guard
then covers every artifact a bundler consumer can import. The embed build exposes the legacy
controller instead of the `ARToolKitNFT` binding class, so that last assertion is per build. The
"public package surface" block is unchanged.

### Removal

**Files deleted:**

- `karma.conf.js`, `karma-debug.conf.js`, `karma-es6.conf.js`, `karma-embed-es6.conf.js`;
- `tests/tests.test.js`, `tests/tests-es6.test.js`, `tests/tests-embed-es6.test.js`.

**`package.json`:**

- **Dev dependencies removed:** `karma`, `karma-chrome-launcher`, `karma-firefox-launcher`,
  `karma-jasmine`, `karma-webpack`, `jasmine-core`, and `cross-env`, which only the Karma scripts
  use. `package-lock.json` is regenerated.
- **Scripts removed:** `test:min`, `test:debug`, `test:wasm`, `test:simd`, `test:embed-es6`,
  `test:es6`, `test:es6-simd`, `test:all`.
- **`test`** becomes `npm run test:vitest && npm run test:node`.

**Workflows** (`.github/workflows/CI.yml` and `publish.yml`):

- the "Install Chrome for Karma" step is deleted, including its download and apt retry loops and
  the `CHROME_BIN` export;
- the "Install Playwright Chromium" step stays and is the only browser setup.

**Docs:**

- **`README.md`:**
  - the Jasmine badge is replaced by a Vitest badge;
  - the Dependabot badge is fixed. It points at `webarkit/jsartoolkit-nft`, but the repository is
    `webarkit/jsartoolkitNFT`;
  - "The browser Karma needs" is removed;
  - the `tests/` entry in the layout list is updated;
  - "Running the tests" is rewritten around the layers: Vitest over `src/`, every browser
    artifact and the `dist` bundle, then the Node suite. It covers `npm test`, `test:vitest`,
    `test:node`, running one file, watch mode, coverage, and the one-time
    `npx playwright install chromium`.
- **`AGENTS.md` and `CLAUDE.md`:**
  - the `npm test` line (still "all seven build targets via Karma + Jasmine") is corrected;
  - the warning that the suite "never loads an NFT marker and never calls `process()`" is
    corrected. After this work it is untrue. What remains true is narrower: the suite does not
    judge tracking quality, so a real example is still the check for tracking changes.
- **Comments:** the "sits alongside Karma" comments in `vitest.config.ts` and
  `tests/vitest/controller.test.ts` are updated.
- **Specs:** `specs/*.md` are dated records and are left as written.

## Karma assertions and where they go

| Karma spec assertion | After this work |
|---|---|
| controller initialised, `id >= 0` (legacy, embed) | "initialises a controller" in `legacy.ts` and `embed-es6.test.ts` |
| `typeof` on ~17 methods (legacy, embed) | dropped: detection calls the methods that matter, and a missing one fails the call |
| low-level C++ functions present (`es6`) | `module-surface.test.ts`, extended to all ES6 builds |
| event listeners add, dispatch and remove (legacy) | add and dispatch: the `getNFTMarker` listener in the detection test. Remove: dropped for the legacy API (frozen, #616); `controller.test.ts` "events" covers it for `src/` |
| `getCameraMatrix` returns 16 numbers | "initialises a controller" in every new suite |
| `getTransformationMatrix` returns 16 numbers | the detection test's pose assertions, on a real detected pose instead of an empty one |
| debug mode toggles (legacy) | dropped: `controller.test.ts` covers debug mode on the shipped API; the legacy API is frozen (#616) |
| near and far projection planes | "sets and reads the projection planes" in every new suite |
| controller setup (`es6`) | `multi-marker.test.ts` and `controller.test.ts` through `src/` |

## Verification

A new test that cannot fail proves nothing, so each kind is broken on purpose once, locally,
before committing. The results go in the PR description.

- **Missing build:** point a legacy file at a missing build. `beforeAll` must fail with a message
  naming the file, well within the hook timeout.
- **No detection:** feed a blank frame instead of the photo. "Detects the pinball marker" must fail.
- **Missing export:** delete `HEAPU8` from a loaded module at runtime. That build's surface test
  must fail.

Then:

- `npm ci && npm test` passes in the worktree. This exercises the regenerated lockfile and the
  Node suite together.
- The time per new file is recorded, `min` and `debug` especially. This settles the frame-scale
  rule above.
- The PR's CI run passes with the Chrome step gone. `publish.yml` runs only on release; its edit
  is the same deletion as in `CI.yml` and is checked in review.

## Delivery

- Branch `test/retire-karma`, off `dev`.
- One PR against `dev`, titled `test: retire Karma in favour of Vitest`, with `Refs #579` and
  `Refs #602`. The maintainer closes the issues.
- Two commits, so the replacement and the removal can be reviewed side by side:
  1. `test: cover every build target in Vitest`: the "Legacy builds", "The embed build" and
     "The module surface" sections above.
  2. `chore: remove Karma`: the "Removal" section, including the README.
- **Conflict risk:** the pending dependency-upgrade branch (`chore/upgrade-deps`) also edits
  `package.json` and `package-lock.json`. Whichever lands second resolves it: keep that branch's
  version bumps, drop the Karma entries, and regenerate the lockfile.
