# NFT Tracker Facade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `createNFTTracker` (all four entry points) and `createNFTTrackerWorker` (the three browser entry points). Together they form a data-oriented tracker. Its outputs are per-target poses, debounced found/lost transitions, built-in per-target filtering and the projection helpers.

**Architecture:**
- **The same-thread facade:** `src/tracker/NFTTracker.ts` sits on the build's `ARToolkitNFT` class, which is injected, as the base classes are after #734. It owns found/lost (`foundLost.ts`), the filters (`filters/`) and the geometry (`geometry.ts`), and it never touches `ARControllerNFT`.
- **The worker wrapper:** `createNFTTrackerWorker` picks the build and starts one ES-module worker bundle per build, `dist/NFTTracker{,_simd,_td}.worker.js`. Those bundles relay a plain-data protocol to an `NFTTracker` running inside the worker.

**Tech Stack:**
- TypeScript, built with Vite 8 library mode through `tools/build-ts.mjs` and `vite.lib.config.mjs`;
- Emscripten ES6 glue in `build/`;
- tests in Vitest browser mode (Playwright Chromium, COOP/COEP) and `node --test`.

**Spec:** `specs/2026-10-25-nft-tracker-facade-design.md`. Decision numbers D1–D18 and goals G1–G9 below refer to it, so read it alongside this plan.

## Global Constraints

- **Branch and delivery:**
  - work on branch `feat/720-tracker-facade`;
  - open one PR to `dev`, titled `feat: data-oriented NFT tracker facade and worker wrapper (#720)`;
  - the PR body says "refs #720", not "closes".
- **Commits:**
  - Conventional Commits, with the types `feat`, `fix`, `perf`, `doc`, `refactor`, `test`, `style` and `chore` only;
  - end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - commits are GPG-signed, and signing is never bypassed;
  - never commit `examples/test720_*`.
- **Recording the reasons:** every non-obvious choice carries its reason in a code comment and in the commit body. Name the D-number: D6, D9, D10, D11, D12, D13, D14, D15 and D16 at least.
- **Naming:**
  - "target" in the facade: `addNFTTargets`, `TargetLoad`, `TargetInfo`, `TargetResult`, `FrameResult.targets`;
  - the core and the controller keep "marker".
- **Unchanged APIs:** `ARControllerNFT`, its events and the legacy `js/` APIs are not changed in behaviour.
- **Plain data:** everything that crosses `postMessage` is plain, structured-cloneable data (G7). The one exception is the transferred frame buffer or `ImageBitmap`.
- **Pose matrices:** a pose is a column-major 4×4 right-handed GL matrix, the controller's `matrixGL_RH`, as a `Float64Array(16)`, or `null`.
- **Defaults:**
  - `lostTimeout` defaults to 200 ms;
  - `filter` defaults to OneEuro with ARnft's parameters, `{ type: "oneEuro", minCutOff: 0.0001, beta: 0.01 }` (D18 revised, D19). Export it as `DEFAULT_FILTER` from `src/tracker/filters/oneEuro.ts`;
  - the maximum number of loaded targets is 20.
- **Luma:** the facade always passes luma through the WASM path, `lumaInternal = true` (D9b).
- **Variant subclasses:** a variant subclass declares no instance fields (AGENTS.md: ESNext class-field reset).
- **Tests:** every new public function has a test in the same PR (AGENTS.md). Browser behaviour goes in `tests/vitest/`, looping over `VARIANTS` where it should hold on every build; Node behaviour goes in `tests/node/`.
- **Committed outputs:** `dist/` and `types/` are rebuilt with `npm run build-ts` and committed at the end (Task 10). No WASM rebuild is needed: no `emscripten/**` or `tools/makem.js` change.

## Review Focus

1. **A consumer feeds frames faster than the worker answers.** `process()` must resolve `{ skipped: true }` at once, never queue, and the next call after the in-flight one resolves must work. Covered by Task 9, `skips a frame while one is in flight`.
2. **`addNFTTargets` with a mix of good and bad sources, or past the 20-target limit.** Each source gets its own result, in order, the good ones still load, and the result past the limit has `reason: 'capacity'`. Covered by Task 5, `loads per source` and `reports capacity past 20`.
3. **`configure({ filter: { module } })` with a bad module on a running tracker.** It rejects with an `Error` naming the URL, and **the previous filter stays active**, rather than leaving the tracker with no filter. Covered by Task 6, `keeps the old filter when a new module fails`.
4. **A frame of the wrong size,** for example a camera that changes resolution mid-session. It throws `RangeError`, and the next correctly sized frame processes normally. Covered by Task 6, `rejects a wrongly sized frame and recovers`.
5. **Calls after `dispose()`, including a second `dispose()`.** Every method throws `Error('NFTTracker: disposed')`, except `dispose()`, which is a no-op. In the worker, a call after dispose rejects instead of hanging. Covered by Task 5, `dispose is idempotent and later calls throw`, and Task 9, `rejects after dispose`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/poseMath.ts` | pure `transMatToGLMat`, `arglCameraViewRHf` (moved from the controllers, D9) |
| `src/tracker/types.ts` | all public facade types |
| `src/tracker/foundLost.ts` | `FoundLost`: per-target debounced transitions (D8) |
| `src/tracker/geometry.ts` | `targetInfo`, `centerOrigin`, `projectionFor` (D11, D12, D17) |
| `src/tracker/filters/PoseFilter.ts` | `PoseFilter`, `PoseFilterModule` (D14) |
| `src/tracker/filters/oneEuro.ts` | built-in OneEuro over `@webarkit/oneeurofilter-ts`, as a `PoseFilterModule`; `DEFAULT_FILTER` |
| `src/tracker/filters/loadFilter.ts` | resolves a `FilterConfig` to a factory; module import and error reporting |
| `src/tracker/frame.ts` | `copyFrame`: validates the size and returns the RGBA bytes (D6) |
| `src/tracker/NFTTracker.ts` | `createTrackerFactory(toolkitClass, loader)` and the `NFTTracker` implementation |
| `src/tracker/worker/protocol.ts` | the message types, `PROTOCOL_VERSION = 1` |
| `src/tracker/worker/host.ts` | `runHost(createNFTTracker)`, the worker-side relay |
| `src/tracker/worker/host_default.ts`, `host_simd.ts`, `host_td.ts` | the worker bundle entries, one per build (D16) |
| `src/tracker/worker/selectBuild.ts` | `selectBuild`, `supportsWasmSimd` |
| `src/tracker/worker/createNFTTrackerWorker.ts` | the page-side wrapper (D4, D13) |
| `examples/filters/average-filter.js` | the custom-filter template (D14) |

`src/tracker/frame.ts` and `src/tracker/worker/selectBuild.ts` are additions to D5's list. This is the plan's call (the spec leaves internal names to the builder): both are pure functions with their own tests.

---

### Task 1: Shared pose math

**Files:**
- Create: `src/poseMath.ts`
- Modify: `src/ARControllerNFTBase.ts:386-470` (`transMatToGLMat`, `arglCameraViewRHf` delegate)
- Modify: `src/ARControllerNFT_node.ts:512-600` (the same)
- Test: `tests/vitest/pose-math.test.ts`

**Interfaces:**
- Produces:
  - `transMatToGLMat(transMat: Float64Array, glMat?: Float64Array, scale?: number): Float64Array`;
  - `arglCameraViewRHf(glMatrix: Float64Array, glRhMatrix?: Float64Array, scale?: number): Float64Array`.

  Both are exported from `src/poseMath.ts`.

- [ ] **Step 1: Write the failing test.** In `pose-math.test.ts`:
  - `transMatToGLMat` maps a 3×4 row-major `[1..12]` to the column-major `[1,5,9,0, 2,6,10,0, 3,7,11,0, 4,8,12,1]`;
  - `arglCameraViewRHf` of that result negates rows 1 and 2 (indices 1,5,9,13 and 2,6,10,14);
  - `scale = 2` doubles indices 12–14;
  - the controller methods return the same values as the free functions. Use `ARControllerNFT.initWithDimensions(640, 480, CAMERA_PARAM, false)` from `src/index`, and compare the outputs for the same input.
- [ ] **Step 2: Run** `npx vitest run tests/vitest/pose-math.test.ts`. Expected: FAIL, because `src/poseMath` does not exist.
- [ ] **Step 3: Implement `src/poseMath.ts`.** Move the two bodies unchanged. Both controllers keep their public methods as one-line delegates, which keeps the API unchanged. The comment cites D9: one copy, so the facade's and the controller's poses cannot drift apart.
- [ ] **Step 4: Run** `npx vitest run tests/vitest/pose-math.test.ts tests/vitest/controller.test.ts` and `npm run test:node`. Expected: PASS.
- [ ] **Step 5: Commit:** `refactor: share the GL pose conversion between the controllers (#720)`.

### Task 2: Facade types and found/lost

**Files:**
- Create: `src/tracker/types.ts`, `src/tracker/foundLost.ts`
- Test: `tests/vitest/tracker-found-lost.test.ts`

**Interfaces:**
- Produces, in `types.ts`, these exact names, used by every later task:

```ts
export type TargetOrigin = "corner" | "center";
export interface TargetInfo { id: number; url: string; widthPx: number; heightPx: number; dpi: number; widthMm: number; heightMm: number; origin: TargetOrigin; }
export type TargetLoadReason = "network" | "format" | "capacity" | "unknown";
export type TargetLoad =
  | { status: "loaded"; info: TargetInfo }
  | { status: "error"; url: string; reason: TargetLoadReason; message: string };
export interface TargetResult { id: number; found: boolean; pose: Float64Array | null; error: number | null; }
export interface Transition { type: "found" | "lost"; id: number; }
export interface FrameResult { time: number; processMs: number; targets: TargetResult[]; transitions: Transition[]; }
export interface SkippedFrame { skipped: true; }
export interface OneEuroConfig { type: "oneEuro"; minCutOff?: number; beta?: number; warmUp?: number; } // defaults 0.0001, 0.01, 0 (D19)
export type FilterConfig =
  | "none" | "native" | OneEuroConfig
  | { module: string; options?: unknown }
  | { create: (options: unknown) => PoseFilter; options?: unknown }; // same thread only (D3)
export interface NFTTrackerSettings { lostTimeout: number; filter: FilterConfig; logLevel: number; near: number; far: number; continuousDetection: boolean; detectionInterval: number; ar2: NFTAR2Settings; }
export type NFTTrackerPatch = Partial<Omit<NFTTrackerSettings, "ar2">> & { ar2?: Partial<NFTAR2Settings> };
export interface NFTTrackerConfig extends NFTTrackerPatch { width: number; height: number; cameraParam: string | Uint8Array; }
export type TrackerFrame = ImageData | ImageBitmap | { data: Uint8ClampedArray | Uint8Array; width: number; height: number };
export interface Viewport { width: number; height: number; fit?: "contain" | "cover"; } // fit defaults to "contain"
export interface FrameGeometry { frameWidth: number; frameHeight: number; videoWidth: number; videoHeight: number; x: number; y: number; width: number; height: number; rotated: boolean; }
export interface AddTargetsOptions { origin?: TargetOrigin; } // default "corner"
export interface NFTTracker {
  readonly cameraMatrix: Float64Array;
  configure(patch: NFTTrackerPatch): Promise<void>;
  addNFTTargets(sources: string[], opts?: AddTargetsOptions): Promise<TargetLoad[]>;
  process(frame: TrackerFrame, timestampMs: number): FrameResult;
  projectionFor(viewport: Viewport, geometry?: FrameGeometry): Float64Array;
  dispose(): void;
}
```

  - `PoseFilter` is imported from `filters/PoseFilter.ts`, created in this task with only the two D14 interfaces.
  - `NFTAR2Settings` comes from `src/abstractions/CommonInterfaces`.
  - `configure` returns a Promise because a `{ module }` filter loads asynchronously (D14). This is the plan's call.
- Produces, in `foundLost.ts`:
  - `class FoundLost { constructor(lostTimeoutMs: number); lostTimeoutMs: number; update(id: number, tracked: boolean, timeMs: number): "found" | "lost" | null; }`.

- [ ] **Step 1: Write the failing tests.** In `tracker-found-lost.test.ts`, with explicit times:
  - `found once on the first tracked frame`: `update(0, true, 0)` gives `"found"`, and `update(0, true, 16)` gives `null`;
  - `lost after more than lostTimeout`: tracked at 0, then untracked at 100 and 200 give `null`, and untracked at 201 gives `"lost"`. The rule is strictly greater than, as in `MarkerLostTracker.checkLost`'s `now - time <= lostAfterMs`;
  - `exactly one lost`: a further untracked frame at 300 gives `null`;
  - `found again after lost`: a tracked frame at 400 gives `"found"`;
  - `re-tracked inside the grace window gives no transition`: tracked at 0, untracked at 100, tracked at 150 give `"found"`, `null`, `null`;
  - `targets are independent`: ids 0 and 1 interleaved;
  - `lostTimeoutMs is live`: set to 50 after the first frame, and an untracked frame at 51 gives `"lost"`;
  - `never-tracked target`: untracked at any time gives `null`.
- [ ] **Step 2: Run** `npx vitest run tests/vitest/tracker-found-lost.test.ts`. Expected: FAIL, because the module is missing.
- [ ] **Step 3: Implement `FoundLost`.** Use a `Map<number, number>` of last-seen times. A present target is one that has an entry.
- [ ] **Step 4: Run it.** Expected: PASS. Also run `npx tsc -p tsconfig.json --noEmit` to type-check `types.ts`.
- [ ] **Step 5: Commit:** `feat: add the tracker facade types and found/lost logic (#720)`. The body cites D8.

### Task 3: Geometry

**Files:**
- Create: `src/tracker/geometry.ts`
- Test: `tests/vitest/tracker-geometry.test.ts`

**Interfaces:**
- Consumes: `TargetInfo`, `Viewport`, `FrameGeometry` (Task 2).
- Produces:
  - `targetInfo(id: number, url: string, data: { width: number; height: number; dpi: number }, origin: TargetOrigin): TargetInfo`;
  - `centerOrigin(pose: Float64Array, info: TargetInfo): Float64Array`, which returns a new matrix;
  - `projectionFor(cameraMatrix: Float64Array, frameWidth: number, frameHeight: number, viewport: Viewport, geometry?: FrameGeometry): Float64Array`, which returns a new matrix.

- [ ] **Step 1: Write the failing tests:**
  - `targetInfo computes millimetres`: `{ width: 893, height: 1117, dpi: 120 }` gives `widthMm = 893 / 120 * 25.4` and `heightMm = 1117 / 120 * 25.4`, to 1e-9. `dpi` is used as given, already an integer from the core (D11).
  - `centerOrigin translates by half the size`: on the identity pose, the result's indices 12 and 13 are `widthMm / 2` and `heightMm / 2`, and index 14 is 0. On a pose with a rotation R, the translation added is `R · (w/2, h/2, 0)`. This is a post-multiplication, D11.
  - `projectionFor without geometry, contain`, with a 640×480 frame and a known `cameraMatrix` `P`:
    - a viewport of 640×480 returns `P` unchanged;
    - a viewport of 1280×480 (wider) scales indices 0, 4, 8 and 12 by `(640/480) / (1280/480) = 0.5`, with the y terms unchanged;
    - a viewport of 640×960 (taller) scales indices 1, 5, 9 and 13 by `(640/960) / (640/480) = 0.5`.
  - `projectionFor cover` with the same viewports: wider scales the y terms by 2; taller scales the x terms by 2.
  - **`projectionFor with geometry matches ARnft`**, for a geometry built with the real package (D20): `toFrameGeometry(vw, vh, getProcessGeometry(vw, vh, rotatePortrait))` from `@webarkit/camera-view`.
    - Add `"@webarkit/camera-view": "^0.1.0"` to `devDependencies` in this task, and run `npm install`.
    - The test also asserts that the package's result is assignable to the facade's `FrameGeometry`, as a compile-time check: `const g: FrameGeometry = toFrameGeometry(...)`.

    The expected value is ARnft `NFTWorker.dispatchProjectionMatrix`'s output, inlined in the test as `arnftProjection(P, g)`:
    - x terms (0, 4, 8, 12) times `pw / w`, and y terms (1, 5, 9, 13) times `ph / h`;
    - then, if `rotated`, for each column c: `(x, y)` becomes `(-y, x)`.

    Assert equality to 1e-12 for:
    - 1280×720 not rotated;
    - 720×1280 rotated;
    - 720×1280 not rotated.

    In each case the viewport has the video's displayed aspect, so `fit` makes no difference.
- [ ] **Step 2: Run** `npx vitest run tests/vitest/tracker-geometry.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `projectionFor` (D12, D17):

```text
P' = copy of cameraMatrix
if geometry: x-terms *= frameWidth / width; y-terms *= frameHeight / height   // undo letterbox
             if rotated: per column (x, y) -> (-y, x)                          // undo rotation
             source aspect a_s = videoWidth / videoHeight
else:        a_s = frameWidth / frameHeight
a_v = viewport.width / viewport.height
contain: a_v > a_s ? x-terms *= a_s / a_v : y-terms *= a_v / a_s
cover:   a_v > a_s ? y-terms *= a_v / a_s : x-terms *= a_s / a_v
```

  Here x-terms are indices 0, 4, 8, 12 and y-terms are 1, 5, 9, 13. The comment cites D12 and D17, and ARnft #344 for the rotation direction.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: add the tracker geometry helpers (#720)`. The body cites D11, D12 and D17.

### Task 4: Pose filters

**Files:**
- Modify: `src/tracker/filters/PoseFilter.ts`. Add JSDoc for the module contract, the COEP note and the "must export createPoseFilter" rule.
- Create: `src/tracker/filters/oneEuro.ts`, `src/tracker/filters/loadFilter.ts`, `examples/filters/average-filter.js`
- Modify: `package.json`, `package-lock.json`. Add `"@webarkit/oneeurofilter-ts": "^0.2.0"` to `devDependencies` (D19: it is bundled, so consumers install nothing).
- Test: `tests/vitest/tracker-filters.test.ts`

**Interfaces:**
- Consumes: `FilterConfig`, `OneEuroConfig` (Task 2).
- Produces:
  - `createPoseFilter(options: OneEuroConfig): PoseFilter`, exported from `oneEuro.ts`, so the module itself satisfies `PoseFilterModule`;
  - `DEFAULT_FILTER: OneEuroConfig = { type: "oneEuro", minCutOff: 0.0001, beta: 0.01 }`, exported from `oneEuro.ts`;
  - `type FilterFactory = (() => PoseFilter) | null`, where `null` means no JS filter (`'none'` and `'native'`);
  - `loadFilter(config: FilterConfig, where: "thread" | "worker"): Promise<FilterFactory>`;
  - `usesNativeFiltering(config: FilterConfig): boolean`, which is true only for `'native'`.

- [ ] **Step 1: Write the failing tests.**
  - **OneEuro:**
    - `the first sample passes through`;
    - `a constant input stays constant`;
    - `a step is smoothed`: the output after the step lies strictly between the old and new values for the default parameters, with samples 33 ms apart;
    - `matches the package`: for the same sample stream, the output equals `new OneEuroFilter(0.0001, 0.01).filter(t, x)` from `@webarkit/oneeurofilter-ts` to 1e-12. This proves the units are passed unchanged (D19);
    - `warmUp samples pass through`: with `warmUp: 3`, the first 3 outputs equal their inputs;
    - `reset restarts`: after `reset()`, the next sample passes through.
  - **The loader:**
    - `'none'` and `'native'` resolve to `null`;
    - `{ type: 'oneEuro', ... }` resolves to a factory whose filters are independent: two filters fed different streams do not interfere;
    - `{ module: '/examples/filters/average-filter.js', options: { weight: 0.5 } }` loads, and its filter gives `[5, 10]` after `[0, 0]` then `[10, 20]`, as in the spike;
    - a missing module rejects with an `Error` whose message contains the URL;
    - a module without `createPoseFilter` rejects with an `Error` naming the URL and `createPoseFilter`. Use `/tests/vitest/fixtures/no-export-filter.js`, a new one-line file `export const x = 1;`;
    - a module whose `createPoseFilter` throws rejects with an `Error` naming the URL. Use the new `/tests/vitest/fixtures/throwing-filter.js`;
    - `{ create }` works with `"thread"` and rejects with `TypeError` for `"worker"`, with a message saying a function cannot cross `postMessage` (D3).

  Module URLs are made absolute with `new URL(path, location.origin).href`.
- [ ] **Step 2: Run** `npx vitest run tests/vitest/tracker-filters.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **OneEuro wraps `@webarkit/oneeurofilter-ts`** (D19, the user's choice). It uses one `OneEuroFilter` per pose filter, over the 16 values.
    - `timeMs` and `minCutOff` / `beta` are passed unchanged, as ARnft does. Defaults come from `DEFAULT_FILTER`.
    - `warmUp`, default 0: the first `warmUp` samples after construction or `reset()` return the input while still being fed to the package filter.
    - Reuse an output buffer through the package's `out` argument, then return a copy, so a caller can keep the returned array.
    - The JSDoc gives the units, and notes that aframe-nft divides `minCutOff` by 1000.
  - **`loadFilter` for `{ module }`:** use `import(/* @vite-ignore */ url)`. The comment says Vite must leave it alone, and cites D14.
    - Wrap every failure as `new Error(\`pose filter module ${url}: ${reason}\`)`.
    - Validate the factory eagerly: call `createPoseFilter(options)` once at load time, so a throwing factory rejects `loadFilter` and not the first `process()`.
  - **`examples/filters/average-filter.js`** is the spike's `average-filter.js`, with a header comment explaining how to copy it.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: add the built-in OneEuro filter and the pose filter module loader (#720)`. The body cites D3 and D14.

### Task 5: The tracker: create, configure, load, dispose

**Files:**
- Create: `src/tracker/NFTTracker.ts`
- Modify: `src/index.ts`, `src/index_simd.ts`, `src/index_td.ts`. Export `createNFTTracker`, bound to the entry's `ARToolkitNFT`, and the types from `src/tracker/types.ts` plus `PoseFilter` and `PoseFilterModule`.
- Modify: `src/factoryFunctions/initARToolkitNFT*.ts` (the three browser files). Accept an optional `moduleOptions?: Record<string, unknown>` and pass it to the glue factory: `ARToolkitNFT(moduleOptions)`. Task 8's td host needs it for `mainScriptUrlOrBlob` (D16).
- Modify: `src/ARToolkitNFTBase.ts`. `init(options?: ARInitOptions & { moduleOptions?: Record<string, unknown> })` forwards `moduleOptions` to `initModule`. The `initModule` type becomes `(moduleOptions?: Record<string, unknown>) => Promise<ARToolkitNFTModule>`.
- Test: `tests/vitest/tracker.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `type ToolkitClass = new () => ARToolkitNFTBase | NodeToolkit`, where `NodeToolkit` is `ARToolkitNFT` imported as a type from `src/ARToolkitNFT_node`. A type-only import keeps the Node class out of the browser bundles;
  - `createTrackerFactory(toolkitClass: ToolkitClass, loader: TargetLoader, where: "thread" | "worker"): (config: NFTTrackerConfig, init?: { moduleOptions?: Record<string, unknown> }) => Promise<NFTTracker>`;
  - `interface TargetLoader { load(toolkit: any, url: string): Promise<{ id: number } | { errorKind: NFTLoadErrorKind | "unknown"; message: string }> }`;
  - `browserTargetLoader: TargetLoader`, exported from `NFTTracker.ts` and implemented with `toolkit.addNFTMarkers([url])`;
  - the index exports `createNFTTracker(config: NFTTrackerConfig): Promise<NFTTracker>`.

- [ ] **Step 1: Write the failing tests.** In `tracker.test.ts`, loop over `VARIANTS`. Extend `VARIANTS[i].load`'s type with `createNFTTracker: any`. Use 640×480 with `CAMERA_PARAM`.
  - `creates a tracker with a cameraMatrix consistent with near/far`. Reuse the near/far extraction `planesOf` from `tests/node/runtime-settings.test.js`.
  - `loads per source`: `addNFTTargets([MARKER_PINBALL, "/examples/DataNFT/missing"])` gives:
    - `[0].status === "loaded"`, with `info.id === 0`, `widthPx > 0`, `dpi > 0`, `widthMm === widthPx / dpi * 25.4` and `origin === "corner"`;
    - `[1]` equal to `{ status: "error", url: ".../missing", reason: "network", message: <non-empty> }`;
    - no `undefined` id anywhere.
  - `ids are stable and never reused`: a second call loading `MARKER_KUVA` gets `id === 1`.
  - `reports capacity past 20`. Load pinball 20 times in one call: ids 0–19 are loaded, and the 21st source gives `reason: "capacity"`. Run this on the `wasm` variant only, because it is slow; KPM rebuilds per source (D10).
  - **Configure:**
    - `configure is live`: `configure({ near: 1, far: 500 })` changes `cameraMatrix`'s planes;
    - `configure rejects filtering`: `configure({ filtering: true } as any)` rejects with a `TypeError` whose message contains `"filter"`;
    - an unknown key rejects with a `TypeError`;
    - `createNFTTracker` with `filtering` in the config rejects in the same way.
  - `logLevel above 4 goes through setLogLevel`: `configure({ logLevel: 5 })` resolves, where the core's `configure()` would refuse it (D18).
  - `dispose is idempotent and later calls throw`: after `dispose()`, a second `dispose()` does not throw; `process`, `configure`, `addNFTTargets` and `projectionFor` throw or reject `Error("NFTTracker: disposed")`; reading `cameraMatrix` throws the same error.
- [ ] **Step 2: Run** `npx vitest run tests/vitest/tracker.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `NFTTracker.ts` (construction, configure, addNFTTargets, dispose).**
  - **Construction:**
    - validate `width` and `height` as positive integers (`RangeError`), and `cameraParam` present;
    - `new toolkitClass()`, then `init({ logLevel, moduleOptions })`, `loadCamera(cameraParam)` and `setup(width, height, cameraId)`;
    - apply the core settings with `configure`, merged with `filtering` derived by `usesNativeFiltering` (D18);
    - load the filter;
    - read `cameraMatrix = Float64Array.from(toolkit.getCameraLens())`.
  - **The default `filter`** is `DEFAULT_FILTER`. Add a test, `the default filter is OneEuro`: a tracker created with no `filter` key returns a pose that differs from a `filter: "none"` tracker's on the second tracked frame, and equals a tracker created with `filter: DEFAULT_FILTER`.
  - **`configure(patch)`** splits the facade keys (`lostTimeout`, `filter`, `logLevel`) from the core keys.
    - A key outside `NFTTrackerSettings` rejects with `TypeError`; `filtering` gets the message `'"filtering" is not a tracker setting: use "filter" (D18)'`.
    - A `logLevel` of 4 or less goes to the core `configure`; above 4 it goes to `toolkit.setLogLevel()`.
    - A new `filter` is loaded **before** anything is swapped, so a failure leaves the old filter in place (Review Focus 3). When it succeeds, the per-target filter instances are dropped, and native filtering is set via core `configure({ filtering })`.
    - Refresh `cameraMatrix` after every core configure.
  - **`addNFTTargets`** goes through `loader.load` one source at a time (D10).
    - `reason` mapping: `http`, `network` and `missing` become `network`; `format` stays `format`; `rejected` becomes `capacity` when 20 are already loaded, else `unknown`, with the message `"the dataset may be unreadable"` appended; `argument` becomes `unknown`.
    - Build `TargetInfo` with `targetInfo(id, url, toolkit.getNFTData(id), opts.origin ?? "corner")`.
    - The comments cite D10 for both the per-source loop and the mapping.
  - **`dispose`:** `toolkit.teardown()`, then mark the tracker disposed. Every method checks the flag first.
  - **`projectionFor`** delegates to `geometry.projectionFor(cameraMatrix, width, height, ...)`.
  - **The index files** export `createNFTTracker = createTrackerFactory(ARToolkitNFT, browserTargetLoader, "thread")`.
- [ ] **Step 4: Run** `npx vitest run tests/vitest/tracker.test.ts tests/vitest/controller.test.ts tests/vitest/runtime-settings.test.ts`. Expected: PASS. The last two prove the `init` / `initModule` change broke nothing.
- [ ] **Step 5: Commit:** `feat: add createNFTTracker: create, configure, addNFTTargets, dispose (#720)`. The body cites D2, D10, D16 (`moduleOptions`) and D18.

### Task 6: The tracker: process, filtering, pose equality

**Files:**
- Create: `src/tracker/frame.ts`
- Modify: `src/tracker/NFTTracker.ts` (`process`)
- Test: `tests/vitest/tracker.test.ts` (add to the file), `tests/vitest/tracker-frame.test.ts`

**Interfaces:**
- Produces: `copyFrame(frame: TrackerFrame, width: number, height: number): Uint8ClampedArray | Uint8Array`, in `frame.ts`.
  - It throws `RangeError` when the size differs.
  - An `ImageBitmap` is drawn to an `OffscreenCanvas(width, height)` and read back with `getImageData`.

- [ ] **Step 1: Write the failing tests.**
  - **`tracker-frame.test.ts`:**
    - `copyFrame` returns `ImageData.data` as is;
    - it accepts `{ data: Uint8Array, width, height }`;
    - it reads back an `ImageBitmap` of the right size;
    - it throws `RangeError` for 641×480, with a message naming both sizes.
  - **`tracker.test.ts`,** over `VARIANTS`. Frames come from `loadCompositeFrames(0.32)` (640×480), with `pinballOnly` as the visible frame; use `blankFrame()` for "hidden".
    - **`process finds the target and fires found once`:** feed `pinballOnly` at t = 0, 33, 66, … until `targets[0].found`.
      - Exactly one `{ type: "found", id: 0 }` appears across all the results.
      - `pose` is a `Float64Array(16)` and `error` is a number.
      - `time` equals the timestamp passed in.
      - `processMs >= 0`.
    - **`hiding the target gives exactly one lost after lostTimeout`:** after found, blank frames at 33 ms steps.
      - `targets[0].found === false` and `pose === null` on the first blank frame (D8 grace window);
      - exactly one `lost`, on the first frame where the time since the last tracked frame is over 200.
    - **`configure({ lostTimeout }) is live`:** with 50, the lost transition comes on the first blank frame more than 50 ms later.
    - **`poses equal the controller's matrixGL_RH`:**
      - `createNFTTracker({ width, height, cameraParam, filter: "native" })` against `ARControllerNFT.initWithDimensions(w, h, CAMERA_PARAM, true)`, where `true` is `internalLuma` (D9b);
      - both load pinball, and both get the same N = 30 `pinballOnly` frames;
      - for every frame where both found, `pose` equals the `getNFTMarker` event's `matrixGL_RH` to 1e-9.
      - The controller's `detectionInterval` and continuous detection are left at the defaults, and so are the tracker's: same core, same defaults.
    - **`origin center shifts the pose`:** load with `{ origin: "center" }`, and assert that the pose equals `centerOrigin(cornerPose, info)` for a corner-origin tracker fed the same frames.
    - **`a JS filter turns native filtering off and resets on lost`:**
      - with the default config (no `filter` key), native filtering is off, because the default is OneEuro (D18 revised). The tracker does not expose its toolkit, so `vi.spyOn(ARToolkitNFT.prototype, "configure")` before creating it, and assert that a call carried `filtering: false`;
      - after found → lost → found, the first pose after the re-found equals the raw pose for that frame, because the filter was reset.

      Get the raw pose by running a `filter: "none"` tracker alongside.
    - **`keeps the old filter when a new module fails`:** `configure({ filter: { module: "<missing url>" } })` rejects, and the next `process` is still filtered by the previous OneEuro, so its pose differs from the `"none"` tracker's.
    - **`rejects a wrongly sized frame and recovers`:** `process(blankFrame(641, 480), t)` throws `RangeError`, and the next 640×480 frame returns a result.
- [ ] **Step 2: Run** `npx vitest run tests/vitest/tracker-frame.test.ts tests/vitest/tracker.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `process(frame, t)`.**
  - `copyFrame`, then `toolkit.passVideoData(rgba, emptyLuma, true)`, where `emptyLuma` is a zero-length `Uint8Array` that is unused when `lumaInternal` is true.
  - `toolkit.detectNFTMarker()`.
  - For each loaded id, `getNFTMarker(id)`:
    - when found: `poseMath.transMatToGLMat`, then `arglCameraViewRHf`; then `centerOrigin` if the target's origin is `"center"`; then the JS filter, created lazily per id;
    - feed `FoundLost.update(id, found, t)`, and on `"lost"` call the id's filter's `reset()`.
  - `processMs` comes from `performance.now()` around the work.
  - Comments cite D6 (sizes), D8 (the grace window: raw found, debounced transitions only) and D18 (the native filter resets on the core's own untracked frame).
- [ ] **Step 4: Run it.** Expected: PASS on all three variants. If the pose-equality test fails only on `wasm-threaded`, check that both sides see the same detection timing before changing any tolerance. The threaded build detects on a worker thread, so feed frames with an `await` between them, as `processUntil` does.
- [ ] **Step 5: Commit:** `feat: add NFTTracker.process with per-target filtering and found/lost (#720)`. The body cites D6, D8, D9b and D18.

### Task 7: Node entry point

**Files:**
- Modify: `src/tracker/NFTTracker.ts`. Add `nodeTargetLoader: TargetLoader`.
- Modify: `src/ARToolkitNFT_node.ts:565`. Change `tryAddNFTMarkers` from `@internal` to "internal, shared with the tracker facade (#720 D10)", keeping it out of the public docs.
- Modify: `src/ARToolkitNFT_node.ts` and `src/factoryFunctions/initARToolkitNFT_node.ts`, only if `lumaInternal` does not work on Node (Step 1 decides).
- Modify: `src/index_node.ts`, `src-esm/index_node.mjs` and `src-esm/index_node.d.mts`. Export `createNFTTracker` and the types.
- Test: `tests/node/tracker.test.js`, plus one assertion added to `tests/node/esm-entry.test.mjs`.

**Interfaces:**
- Consumes: `createTrackerFactory`, `TargetLoader` (Task 5).
- Produces: `createNFTTracker` on `dist/ARToolkitNFT_node.js` and `.mjs`.
  - Its `cameraParam` is a path relative to the working directory, and its sources are extension-less prefixes, as `ARToolkitNFT_node` accepts today.

- [ ] **Step 1: Check the luma path on Node.** In a scratch script against the current `dist/ARToolkitNFT_node.js`:
  - run the facade's `process` sequence by hand with `passVideoData(rgba, new Uint8Array(0), true)` on `examples/node`'s image, as `example_dist.js` loads it;
  - check that pinball is found.

  If it is found, Node uses `lumaInternal = true` like the browser. If not, `nodeTargetLoader`'s tracker computes luma in JS with the controller's formula, and the test comment records that Node poses then match the Node controller with its default luma. Record the outcome in the commit body (D9b: "the builder checks").
- [ ] **Step 2: Write the failing test.** In `tests/node/tracker.test.js`, run with `process.chdir(examples/node)` as `runtime-settings.test.js` does:
  - `createNFTTracker({ width, height, cameraParam: "camera_para.dat" })` resolves;
  - `addNFTTargets(["pinball", "missing"])` gives one loaded result and one `reason: "network"` result;
  - `process` on the example image finds pinball, with one `found` transition;
  - `poses equal the Node controller's matrixGL_RH` for the same frames;
  - `dispose` makes `process` throw.

  In `esm-entry.test.mjs`, assert `typeof createNFTTracker === "function"` on the named import.
- [ ] **Step 3: Run** `npm run build-ts && npm run test:node`. Expected: FAIL.
- [ ] **Step 4: Implement `nodeTargetLoader`.**
  - It calls `toolkit.tryAddNFTMarkers([url])` inside `try`, and maps a thrown `NFTLoadError`'s `kind`; any other throw becomes `"unknown"`.
  - It is wrapped in an `async` function, so `addNFTTargets` stays asynchronous over the synchronous Node loader.
  - Bind `createNFTTracker` in `index_node.ts`, and re-export it from the ESM wrapper and its `.d.mts`.
- [ ] **Step 5: Run** `npm run build-ts && npm run test:node`. Expected: PASS.
- [ ] **Step 6: Commit:** `feat: add createNFTTracker to the Node entry point (#720)`. The body cites D10 (`tryAddNFTMarkers`) and the outcome of Step 1. Do not commit `dist/` or `types/` yet; Task 10 rebuilds them.

### Task 8: Worker protocol, host and the three worker bundles

**Files:**
- Create: `src/tracker/worker/protocol.ts`, `src/tracker/worker/host.ts`, `src/tracker/worker/host_default.ts`, `host_simd.ts`, `host_td.ts`
- Modify: `vite.lib.config.mjs`. Add the variants `"worker-default"`, `"worker-simd"` and `"worker-td"`.
- Modify: `tools/build-ts.mjs`:
  - `VARIANTS` gains the three new variants;
  - `owned()` also matches `/^NFTTracker.*\.js$/`.
- Modify: `.github/workflows/main.yml` (the release file list, around lines 96–101). Add `dist/NFTTracker.worker.js`, `dist/NFTTracker_simd.worker.js`, `dist/NFTTracker_td.worker.js`, plus the td pthread file if it gets its own name.
- Modify: `tests/node/dist-paths.test.js`. Add the new files to the "are present" list, and to the `file://` check.
- Test: `tests/node/dist-paths.test.js`, and `npm pack --dry-run` output.

**Interfaces:**
- Consumes: `createTrackerFactory`, `browserTargetLoader` (Task 5).
- Produces, in `protocol.ts`:

```ts
export const PROTOCOL_VERSION = 1;
export type Request =
  | { v: 1; id: number; type: "init"; config: NFTTrackerConfig; workerBase: string }
  | { v: 1; id: number; type: "configure"; patch: NFTTrackerPatch }
  | { v: 1; id: number; type: "addNFTTargets"; sources: string[]; opts?: AddTargetsOptions }
  | { v: 1; id: number; type: "process"; frame: ImageBitmap | { data: Uint8ClampedArray | Uint8Array; width: number; height: number }; timestampMs: number }
  | { v: 1; id: number; type: "dispose" };
export type Response =
  | { v: 1; id: number; type: "ok"; value?: unknown; cameraMatrix?: Float64Array }
  | { v: 1; id: number; type: "error"; name: string; message: string };
```

- Produces, in `host.ts`: `runHost(createNFTTracker: ReturnType<typeof createTrackerFactory>, pthreadFile?: string): void`.
  - It installs `self.onmessage`.
  - On `init`, when `pthreadFile` is given, it passes `moduleOptions: { mainScriptUrlOrBlob: new URL(pthreadFile, workerBase).href }`.
  - Errors are sent back as `{ name, message }`, so a `TypeError` or `RangeError` keeps its name across the boundary.
  - `init`, `configure` and `dispose` responses carry `cameraMatrix`.
- The bundle names are fixed:
  - `dist/NFTTracker.worker.js`, `dist/NFTTracker_simd.worker.js` and `dist/NFTTracker_td.worker.js`;
  - the td pthread worker is either `ARToolkitNFT_td.worker.js`, shared, or `NFTTracker_td.pthread.js` (Step 4 decides).
  - Task 9 imports the constant `WORKER_FILES` from `selectBuild.ts`.

- [ ] **Step 1: Write the failing test.** Extend `dist-paths.test.js` with the three worker files: present, no `file://`, and no `import.meta.url` replaced by a `globalThis.__artk*` global (D16: they are ES modules and keep the real `import.meta.url`).
- [ ] **Step 2: Run** `npm run test:node`. Expected: FAIL, because the files are missing.
- [ ] **Step 3: Implement the protocol, the host and the entries.**
  - Each `host_<variant>.ts` is two lines: import `createTrackerFactory` and the build's `ARToolkitNFT`, then call `runHost(createTrackerFactory(ARToolkitNFT, browserTargetLoader, "worker"), <pthreadFile or undefined>)`.
  - Vite variants `worker-*`:
    - an ES-format lib build, with `entryFileNames` as above;
    - **no `define` of `import.meta.url`, no banner, no footer, no `renderBuiltUrl`.** The comment cites D16;
    - `worker-td` adds `worker: { format: "es", rollupOptions: { output: { entryFileNames: <pthread name> } } }`.
- [ ] **Step 4: Decide the pthread file name (D16).**
  - Build once with `entryFileNames: "NFTTracker_td.pthread.js"`.
  - Compare it with `dist/ARToolkitNFT_td.worker.js`: `cmp dist/NFTTracker_td.pthread.js dist/ARToolkitNFT_td.worker.js`.
  - If they are identical, switch to sharing `ARToolkitNFT_td.worker.js`, and make sure the `worker-td` build runs **after** `td` in `VARIANTS`, so the file is rewritten identically.
  - If they differ, keep `NFTTracker_td.pthread.js` and add it to `main.yml` and `dist-paths`.
  - Record the result in a comment in `vite.lib.config.mjs` and in the commit body.
- [ ] **Step 5: Run** `npm run build-ts && npm run test:node && npm pack --dry-run 2>&1 | grep NFTTracker`. Expected: PASS, with the new files listed by `npm pack`. Run `git status dist/` to confirm only new files and the expected bundles changed.
- [ ] **Step 6: Commit:** `chore: build the three NFT tracker worker bundles (#720)`. Commit the sources, the config, `main.yml` and the test; the `dist/` files come in Task 10. The body cites D16 and the pthread outcome.

### Task 9: `createNFTTrackerWorker`

**Files:**
- Create: `src/tracker/worker/selectBuild.ts`, `src/tracker/worker/createNFTTrackerWorker.ts`
- Modify: `src/index.ts`, `src/index_simd.ts`, `src/index_td.ts`. Export `createNFTTrackerWorker` and `WorkerOptions`.
- Create: `tests/vitest/setup/worker-sources.ts`, a Vitest `globalSetup`. Register it in `vitest.config.ts` (`test.globalSetup`), and add `tests/vitest/.workers/` to `.gitignore`.
- Test: `tests/vitest/tracker-select-build.test.ts`, `tests/vitest/tracker-worker.test.ts`

**Interfaces:**
- Consumes: the protocol and the bundle names (Task 8), and `projectionFor` (Task 3).
- Produces:
  - `type BuildName = "default" | "simd" | "td"`;
  - `const WORKER_FILES: Record<BuildName, string>`;
  - `selectBuild(requested: "auto" | BuildName, env: { crossOriginIsolated: boolean; simd: boolean }): BuildName`;
  - `supportsWasmSimd(): boolean`;
  - `interface WorkerOptions { build?: "auto" | BuildName; workerBase?: string | URL }`;
  - `createNFTTrackerWorker(config: NFTTrackerConfig, opts?: WorkerOptions): Promise<NFTTrackerWorker>`;
  - `interface NFTTrackerWorker`, which mirrors `NFTTracker` except:
    - `process(frame, t): Promise<FrameResult | SkippedFrame>`;
    - `dispose(): Promise<void>`;
    - `configure` and `addNFTTargets` return Promises as before;
    - `cameraMatrix` and `projectionFor` are synchronous.

- [ ] **Step 1: Write the failing tests.**
  - **`tracker-select-build.test.ts`:**
    - `auto` with `{ crossOriginIsolated: true, simd: true }` gives `td`;
    - `{ false, true }` gives `simd`;
    - `{ false, false }` gives `default`;
    - an explicit build wins whatever the env;
    - `supportsWasmSimd()` is `true` in the suite's Chromium.
  - **`tracker-worker.test.ts`.** The workers are started from Blob URLs (D15). The file comment explains that Vitest's browser mode rewrites `import()` in served JS (`wrapDynamicImport`), which breaks in a worker, so the test loads the worker bundle's text.
    - The `globalSetup` copies `dist/NFTTracker*.worker.js` to `tests/vitest/.workers/<name>.txt`, so the Vite server delivers them untransformed. The spike needed `.txt`.
    - The test passes `opts.workerBase = location.origin + "/dist/"`. A test-only seam replaces `new Worker(url)`: an exported `__setWorkerFactory(fn)` from `createNFTTrackerWorker.ts`, marked `@internal`. Through it the test supplies `new Worker(blobUrlOf(name), { type: "module" })`.
    - For each build in `["default", "simd", "td"]`:
      - **`init, addNFTTargets, process until found`:** `cameraMatrix` is a `Float64Array(16)` after init, `addNFTTargets` gives one loaded result, and `process` with a fresh `ImageData` copy of `pinballOnly` per call eventually returns a `found` transition.
      - **`transfers the frame`:** after `process`, the caller's `ImageData.data.buffer.byteLength === 0` (D6).
      - **`custom filter module`:** `filter: { module: <abs url of examples/filters/average-filter.js>, options: { weight: 0.5 } }` initialises and processes.
    - **Wrapper behaviour** (once, on default):
      - `rejects a { create } filter` with `TypeError` before posting (D3);
      - `skips a frame while one is in flight`: call `process` twice without awaiting; the second resolves `{ skipped: true }`, and a third call, made after the first resolves, returns a `FrameResult`;
      - `configure updates cameraMatrix` (near/far);
      - `errors keep their name`: `configure({ filtering: true })` rejects with `TypeError`;
      - `rejects after dispose`: after `await dispose()`, `process` rejects with `Error("NFTTracker: disposed")` and does not hang;
      - `projectionFor runs locally`: it returns the same matrix as `geometry.projectionFor(cameraMatrix, ...)`, with no message posted (spy on `postMessage`).
- [ ] **Step 2: Run** `npm run build-ts && npx vitest run tests/vitest/tracker-select-build.test.ts tests/vitest/tracker-worker.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **The SIMD test:** `WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]))`. These are the wasm-feature-detect SIMD bytes, and the comment says so.
  - **`workerBase` default:** `new URL(".", import.meta.url).href`. In the UMD bundles `import.meta.url` is already defined as the bundle URL global, so this resolves next to the bundle, by the bundle-URL rule (D4).
  - **Requests:**
    - the wrapper keeps a request-id map of `{ resolve, reject }`;
    - one in-flight `process` flag (D13: drop the frame, do not queue; the comment cites it);
    - the frame is transferred: an `ImageBitmap` itself, or `ImageData` and `{ data }` as `{ data, width, height }` with `[data.buffer]`.
  - **`dispose()`** posts `dispose`, awaits it, then calls `terminate()`. Later calls reject locally.
  - **Worker errors:** an `error` event on the worker rejects all pending requests with an `Error` that includes the event's message, so a crashed worker never leaves a hanging Promise.
- [ ] **Step 4: Run it.** Expected: PASS on all three builds; td works because the suite is cross-origin isolated (D15, D16 `mainScriptUrlOrBlob`). Then run the full browser suite once: `timeout 2400 npx vitest run`. If it hangs or flakes on `legacy-thread` (a known flake on this machine), rerun once.
- [ ] **Step 5: Commit:** `feat: add createNFTTrackerWorker (#720)`. The body cites D4, D13 and D15.

### Task 10: Example, README, rebuilt artifacts

**Files:**
- Create: `examples/ARToolkitNFT_ES6_tracker_example.html` and `examples/tracker_worker_ES6.js`. Port `ARToolkitNFT_ES6_example.html` with its three.js renderer.
- Modify: `README.md`. Add a "Tracker facade" section and a "Writing a pose filter" section.
- Modify: `dist/*`, `types/*` (rebuilt)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Port the example.**
  - The page loads `../dist/ARToolkitNFT.js` and calls `createNFTTrackerWorker({ width, height, cameraParam: "Data/camera_para.dat" }, { workerBase: "../dist/" })`.
  - It loads `DataNFT/pinball`.
  - Each frame it draws the video letterboxed into the processing canvas, with `@webarkit/camera-view` (D20), imported as an ES module from `../node_modules/@webarkit/camera-view/dist/camera-view.mjs`, which `python-server.py` serves from the repository root. Use its `getProcessGeometry` / `toFrameGeometry`, or its `FrameSource` if that fits more simply; the builder reads the package's README and picks one.
  - It calls `process(ctx.getImageData(...), performance.now())`, ignores `skipped`, and on `found` / `lost` shows or hides the model.
  - It applies `pose` and `projectionFor({ width: innerWidth, height: innerHeight, fit: "cover" }, geometry)`.
  - It logs `processMs`.
  - The comment cites D17: the camera side letterboxes.
- [ ] **Step 2: Check the example by hand.** Serve it with `python python-server.py`, which sets COOP/COEP, and open it in Chromium with a webcam or a phone over `adb reverse`. Check that the model appears on the pinball image and disappears when it is hidden, and that the console shows `td` was selected. Record the build and `processMs` in the PR body.
- [ ] **Step 3: Write the README sections.**
  - **"Tracker facade":**
    - `createNFTTracker` and `createNFTTrackerWorker` with a minimal example;
    - the `FrameResult` shape;
    - found/lost semantics: raw `targets`, debounced `transitions` (D8);
    - the `addNFTTargets` reasons table (D10);
    - `origin`;
    - `projectionFor` and `FrameGeometry`, pointing to `@webarkit/camera-view`;
    - `workerBase`, and the files to serve: `NFTTracker*.worker.js` plus the td pthread file;
    - skipped frames (D13);
    - the default OneEuro, and `filter: "native"` to match `ARControllerNFT`'s poses exactly (D18 revised);
    - the `'native'` filter resetting on the core's untracked frame, not on `lostTimeout` (D18).
  - **"Writing a pose filter":**
    - the `PoseFilterModule` contract (D14) and `examples/filters/average-filter.js`;
    - that the module must be an ES module reachable by URL;
    - COEP: a cross-origin module needs CORS plus `Cross-Origin-Resource-Policy`; same-origin needs nothing;
    - `{ create }` works only on the same thread;
    - OneEuro's units: those of `@webarkit/oneeurofilter-ts`, time in ms, with the aframe-nft `minCutOff / 1000` note (D19).
- [ ] **Step 4: Rebuild and run everything.**
  - `npm run build-ts`;
  - `timeout 2400 npm test`, rerunning once on a known hang or flake;
  - `git status`: `types/` line-ending-only churn is reverted (AGENTS.md), and `dist/` holds the changed bundles plus the new worker files;
  - `node examples/node/example_dist.js`, which still tracks (the controller is unchanged).
- [ ] **Step 5: Commit:** `feat: add the tracker worker example, README sections and rebuilt bundles (#720)`, with `dist/` and `types/` included.
- [ ] **Step 6: Push and open the PR.** Push the branch, and open the PR to `dev` with the title from Global Constraints.
  - The PR body gives "refs #720" and a "change → reason" table with one row per D-number cited above.
  - It records the manual check from Step 2 and the outcomes of Task 7 Step 1 and Task 8 Step 4.
  - It ends with the generated-with line.
