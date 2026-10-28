# Runtime settings in ARToolKitNFTCore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `NFTRuntimeSettings` and `configure()` in WebARKitLib's NFT core, released as 0.12.0, then
exposed in jsartoolkitNFT as `configure(patch)` / `getRuntimeSettings()`, with a camera matrix that
always follows the planes, a start-up log level (#677), and pose filtering on the threaded build
(#692).

**Architecture:** WebARKitLib comes first:

- the core stores one settings struct;
- it validates a full struct before applying anything;
- it recomputes what depends on the settings: the lens for new planes, `ar2Set*` for new AR2
  values, and an AR2-only handle recreation for new template sizes.

After the 0.12.0 release, jsartoolkitNFT:

- bumps the submodule;
- binds the struct as Embind value objects, with the JS field names;
- merges deep-partial patches in TypeScript.

**Tech Stack:** C++17 with gtest (WebARKitLib), Emscripten 4.0.17 with Embind, TypeScript, Vitest
in Chromium, `node --test`.

**Spec:** `specs/2026-10-23-runtime-settings-core-design.md`. Read it with this plan. D-numbers
refer to its decisions.

## Global Constraints

- **Defaults keep today's values,** except near:
  - near 0.1, far 1000.0;
  - continuous detection on;
  - interval -1 (the preset's choice);
  - filtering false;
  - log level `-1` ("leave unchanged"; erratum: the plan said `AR_LOG_LEVEL_INFO`, but a default-built struct must not reset a quieter level nor overwrite one set through `WebARKitManager`, changed in the WebARKitLib #106 review);
  - AR2: trackingThresh 5.0, simThresh 0.5, searchFeatureNum 16, templateSize1 6,
    templateSize2 6, searchSize 0.
- **Sentinels:** `detectionIntervalMs == -1` and `searchSize == 0` mean "follow the preset".
  `getRuntimeSettings()` returns the resolved values.
- **Validation ranges** (D7; each goes in a code comment with its reason):
  - `nearPlane > 0`, and `farPlane > nearPlane`, both finite;
  - interval `-1` or finite `>= 0`;
  - `logLevel` in `[AR_LOG_LEVEL_DEBUG, AR_LOG_LEVEL_REL_INFO]`;
  - `trackingThresh` in `(0, 100]`;
  - `simThresh` in `(0, 1]`;
  - `searchFeatureNum` in `[3, 40]`, rejected outside, never clamped;
  - `templateSize1` / `templateSize2` in `[1, 32]`;
  - `searchSize` `0` or in `[1, 64]`.
- **Setters stay lenient** and keep their signatures. Only `configure()` rejects.
- **The log level lives in `arLogLevel` / `webarkitLogLevel`,** never in the core instance (D9).
- **The JS names** are `near`, `far`, `continuousDetection`, `detectionInterval`, `filtering`,
  `logLevel`, and `ar2.{trackingThresh, simThresh, searchFeatureNum, templateSize1, templateSize2,
  searchSize}`.
- **Repositories:**
  - WebARKitLib PRs target its `dev`, and the release follows its process: a bump PR, then
    `dev` → `master` as a merge commit, then an annotated unsigned tag `0.12.0`, then a GitHub
    release in the 0.10.1 layout;
  - jsartoolkitNFT PRs target `dev`.
- **Conventional Commits,** with types limited to feat/fix/perf/doc/refactor/test/style/chore.
  Every behaviour change carries its reason in a code comment, the commit body, the PR table and
  the release notes.
- **jsartoolkitNFT artifacts:**
  - the WASM is rebuilt with `docker exec emscripten-jsartoolkitnft npm run build` (emsdk 4.0.17);
  - the TypeScript with `npm run build-ts`;
  - `build/`, `dist/` and `types/` are committed. The rebuild noise is reverted as AGENTS.md
    describes.

## Review Focus

1. **A patch that is invalid in one field after valid fields:** nothing at all is applied, and the
   lens and the AR2 handle are unchanged. Covered in Task 1 and Task 6.
2. **`configure()` before a camera is loaded:** no crash. The values are stored and apply when
   `setCamera()` / `setupAR2()` run. Covered in Task 1 and Task 2.
3. **A template-size change while a marker is being tracked:** the marker keeps tracking within a
   few frames. Covered in Task 2.
4. **The init-time `logLevel`, followed by `configure({ near })`:** the level is not reset to INFO.
   Covered in Task 7.
5. **`configure({})` and a read-modify-write of `getRuntimeSettings()`:** no change in behaviour.
   Covered in Task 1 and Task 6.

---

## Part 1: WebARKitLib

All paths in Tasks 1 to 5 are relative to `emscripten/WebARKitLib`.

- **Branch:** `feat/runtime-settings` from WebARKitLib `origin/dev`, checked out in the submodule
  of the jsartoolkitNFT worktree.
- **Test runs,** per the project notes, in `emscripten/emsdk:4.0.17` with `libjpeg-dev zlib1g-dev`:
  `cd tests && mkdir -p build && cd build && cmake -DEMSCRIPTEN_COMP=0 .. && make webarkit_nft_core_test && ./webarkit_nft_core_test`.

### Task 1: The settings struct, `configure()`, planes and lens

**Files:**
- Create: `WebARKit/WebARKitTrackers/WebARKitNFT/include/WebARKitTrackers/WebARKitNFT/NFTRuntimeSettings.h`
- Modify: `WebARKit/WebARKitTrackers/WebARKitNFT/include/WebARKitTrackers/WebARKitNFT/ARToolKitNFTCore.h`
- Modify: `WebARKit/WebARKitTrackers/WebARKitNFT/ARToolKitNFTCore.cpp`:
  - the constructor (line 35, `nearPlane(0.0001)`);
  - the setters (lines 591-601 and 648-665).
- Test: `tests/webarkit_nft_core_test.cc`. Reuse `makeReady()` at line 381.

**Interfaces:**
- Produces:
  - `struct NFTAR2Settings { float trackingThresh; float simThresh; int searchFeatureNum; int templateSize1; int templateSize2; int searchSize; }`;
  - `struct NFTRuntimeSettings { ARdouble nearPlane; ARdouble farPlane; bool continuousDetection; double detectionIntervalMs; bool filtering; int logLevel; NFTAR2Settings ar2; }`, with the Global Constraints defaults;
  - `int ARToolKitNFTCore::configure(const NFTRuntimeSettings &)`, returning `0`, or `-1` with nothing changed;
  - `NFTRuntimeSettings ARToolKitNFTCore::getRuntimeSettings() const`;
  - `bool nftRuntimeSettingsValid(const NFTRuntimeSettings &)` in the header, for reuse by tests.

- [ ] **Step 1: Write the failing tests**

```cpp
TEST(NFTRuntimeSettingsTest, DefaultsMatchTheOldConstants)  // near 0.1, far 1000, AR2 5.0/0.5/16/6/6, searchSize 0, interval -1
TEST(NFTRuntimeSettingsTest, GetResolvesSentinels)          // singleThreadPreset core: getRuntimeSettings().detectionIntervalMs == 300, ar2.searchSize == 6
TEST(NFTRuntimeSettingsTest, InvalidSettingsChangeNothing)  // near=0; far<near; interval=-2; logLevel=99; searchFeatureNum=2 and 41; simThresh=1.5;
                                                            // templateSize1=0; searchSize=65: each returns -1 and getRuntimeSettings() is unchanged
TEST(NFTRuntimeSettingsTest, ConfigureRoundTrip)            // configure(getRuntimeSettings()) == 0 and changes nothing; configure(s with near 1, far 500) then get == s
TEST(NFTRuntimeSettingsTest, PlaneSetterRebuildsLensAfterSetCamera)  // makeReady(core); setProjectionNearPlane(5); lens == arglCameraFrustumRH(param, 5, far)
TEST(NFTRuntimeSettingsTest, PlanesBeforeCameraOnlyStore)   // fresh core: setProjectionNearPlane(5) does not crash; after makeReady the lens uses 5
TEST(NFTRuntimeSettingsTest, LogLevelIsTheGlobal)           // configure(logLevel=AR_LOG_LEVEL_ERROR) sets arLogLevel and webarkitLogLevel; get reads arLogLevel;
                                                            // constructing a second core does not reset them
```

- [ ] **Step 2: Run, and expect a compile failure** (`NFTRuntimeSettings` undefined).

- [ ] **Step 3: Implement**
  - `NFTRuntimeSettings.h`, with the struct defaults and `nftRuntimeSettingsValid`, using the
    Global Constraints ranges, each with a comment.
  - The core stores `NFTRuntimeSettings settings_` in place of `nearPlane`, `farPlane`,
    `continuousDetection`, `detectionIntervalMs` and `withFiltering`. The constructor's
    `withFiltering` argument seeds `settings_.filtering`.
  - The constructor no longer touches the log globals.
  - `configure()`:
    1. validate;
    2. remember the old planes;
    3. assign;
    4. if the planes changed and `paramLT` exists, rebuild the lens with the same call as
       `recalculateCameraLens()`;
    5. write `arLogLevel` and `webarkitLogLevel`;
    6. resolve the interval through the existing `setDetectionInterval` logic.
  - Each existing setter assigns its field. The plane setters also rebuild the lens when `paramLT`
    exists (D5).
  - Comments: D4 (why 0.1), D5, D7 (validate first; the setters stay lenient), D9.

- [ ] **Step 4: Run `webarkit_nft_core_test`.** Expected: all pass, including the existing
  `NFTTrackingConfigTest` and detector tests.

- [ ] **Step 5: Commit**

```bash
git add WebARKit/WebARKitTrackers/WebARKitNFT tests/webarkit_nft_core_test.cc
git commit -m "feat: NFTRuntimeSettings and configure() on ARToolKitNFTCore"
```

### Task 2: AR2 parameters from the settings, live updates, AR2-only handle recreation

**Files:**
- Modify: `WebARKit/WebARKitTrackers/WebARKitNFT/ARToolKitNFTCore.cpp`, in `setupAR2()` (lines
  211-260) and `configure()`.
- Modify: `ARToolKitNFTCore.h`, adding the private `int recreateAR2Handle()`.
- Test: `tests/webarkit_nft_core_test.cc`.

**Interfaces:**
- Consumes: `settings_` and `configure()` from Task 1.
- Produces: `NFTAR2Settings ARToolKitNFTCore::effectiveAR2() const`, with `searchSize` resolved.
  Task 1's `getRuntimeSettings()` uses it.

- [ ] **Step 1: Write the failing tests**

```cpp
TEST(NFTRuntimeSettingsAR2Test, SetupAR2UsesStoredSettings)   // configure(trackingThresh 7, simThresh 0.6, searchFeatureNum 20) before makeReady;
                                                               // handle fields after makeReady equal them (read AR2HandleT fields directly)
TEST(NFTRuntimeSettingsAR2Test, ConfigureUpdatesLiveHandle)   // makeReady; configure(trackingThresh 9); same handle pointer, handle->trackingThresh == 9
TEST(NFTRuntimeSettingsAR2Test, TemplateSizeRecreatesOnlyAR2) // makeReady + add pinball; configure(templateSize1 8); AR2 handle pointer changed,
                                                               // new handle->templateSize1 == 8; KPM handle pointer unchanged
TEST(NFTRuntimeSettingsAR2Test, TrackingSurvivesTemplateChange) // track pinball-demo.jpg until tracked; configure(templateSize1 8, templateSize2 8);
                                                               // tracked again within 5 frames of the same image
TEST(NFTRuntimeSettingsAR2Test, SearchSizeZeroFollowsPreset)  // singleThreadPreset: effective searchSize 6; configure(searchSize 10): handle->searchSize == 10
```

Expose the handles to tests only through accessors the core already has. Add
`const AR2HandleT *ar2HandleForTest() const` and `const KpmHandle *kpmHandleForTest() const` only if
none exist, and mark them as test-only in a comment.

- [ ] **Step 2: Run, and expect the new tests to fail.**

- [ ] **Step 3: Implement**
  - `setupAR2()` applies `effectiveAR2()` instead of the constants:
    - resolve `searchSize` 0 to the existing CPU-dependent value;
    - keep `ar2Set*` in the current order.
  - `recreateAR2Handle()`:
    - create a new handle with the same variant branch as `setupAR2()`;
    - apply `effectiveAR2()`;
    - delete the old handle with the matching delete call;
    - swap.

    It must not touch `kpmHandle` or `detector`.
  - `configure()`:
    - if `templateSize1` or `templateSize2` changed and a handle exists, call
      `recreateAR2Handle()`;
    - otherwise, call the changed `ar2Set*`.

    Without a handle, it only stores.
  - Comments:
    - D6: what `searchSize` 0 means, and why it was added;
    - D12: templates are built once per thread in `tracking2d.c:106` / `trackingMod2d.c:81`, and
      the per-marker state lives in the surface sets;
    - the threading note from the spec.

- [ ] **Step 4: Run `webarkit_nft_core_test`.** Expected: all pass.

- [ ] **Step 5: Commit** with `feat: configurable AR2 parameters, applied live; template sizes recreate the AR2 handle`.

### Task 3: Pose filtering on the threaded preset (#692)

**Files:**
- Modify: `WebARKit/WebARKitTrackers/WebARKitNFT/include/WebARKitTrackers/WebARKitNFT/NFTTrackingConfig.h:45`,
  setting `poseFilteringSupported = true`.
- Modify: `ARToolKitNFTCore.cpp:179`, the comment that says the threaded preset never filters.
- Test: `tests/webarkit_nft_core_test.cc`, the `ThreadedPresetMatchesTheThreadedBinding` test at
  line 125.

- [ ] **Step 1: Update the test.** `threadedPreset().poseFilteringSupported` is now expected to be
  `true`. Add `TEST(NFTRuntimeSettingsTest, ThreadedPresetFilters)`: a `threadedPreset()` core with
  filtering on creates `ftmi` for a tracked marker. Assert that two successive poses of a static
  image differ from the unfiltered core's poses.
- [ ] **Step 2: Run, and expect a FAIL.**
- [ ] **Step 3: Flip the preset flag and update the comments.** The reason, from #692: the threaded
  build has never filtered, and the core now makes it a preset flag.
- [ ] **Step 4: Run, and expect all tests to pass.**
- [ ] **Step 5: Commit** with `feat: pose filtering in the threaded preset (refs jsartoolkitNFT#692)`.

### Task 4: Level gate on the Emscripten logger (D10.2)

**Files:**
- Modify: `lib/SRC/WebARKit/WebARKitLog.cpp`. Every `webarkitLOGi/w/e/d` overload returns early
  when its level is below `webarkitLogLevel`.
- Modify: `include/WebARKit/WebARKitLog.h`, declaring `extern "C" int webarkitLogLevel;` if it is
  not already visible.

The levels are the native logger's constants: info, warn, error, debug.

- [ ] **Step 1: Write the gate.** This file only builds under Emscripten, so it has no native test.
  The jsartoolkitNFT test in Task 7 (start-up silence) covers it.
- [ ] **Step 2: Check with a native build.** The CI command from `.github/workflows/test.yml` still
  passes, and the emsdk job compiles the file.
- [ ] **Step 3: Commit** with `fix: the Emscripten logger honours webarkitLogLevel (refs jsartoolkitNFT#677)`.

### Task 5: The PR, the 0.12.0 bump and the release

**Files:**
- Modify: `WebARKit/WebARKitTrackers/WebARKitOpticalTracking/WebARKitConfig.cpp`, setting the
  version to 0.12.0 (string and MAJOR/MINOR/TINY).
- Modify: `tests/webarkit_test.cc:82,180`, changing `"0.11.1"` to `"0.12.0"`.

- [ ] **Step 1:** Push `feat/runtime-settings` and open a PR to WebARKitLib `dev`. Its body has a
  change → reason table with D4, D5, D6, D7, D9, D10.2, D12 and D13. **The user merges.**
- [ ] **Step 2:** Open the bump PR `chore: bump version to 0.12.0`, and run the full native suite
  (`webarkit_test` in `ubuntu:24.04`). **The user merges.**
- [ ] **Step 3:** Open the `dev` → `master` sync PR, merged with a merge commit. **The user
  merges.**
- [ ] **Step 4:** Create the annotated, unsigned tag `0.12.0` on the merge commit, and the GitHub
  release in the 0.10.1 layout:
  - title: `0.12.0 Release - runtime settings for the NFT core`;
  - New, Fixed and Changed sections. The near plane of 0.1 and threaded filtering are listed
    under behaviour changes.

---

## Part 2: jsartoolkitNFT

All paths are relative to the worktree `.claude/worktrees/720-runtime-settings`, on branch
`feat/720-runtime-settings`.

### Task 6: Submodule bump, bindings and the TypeScript `configure()`

**Files:**
- Modify: `emscripten/WebARKitLib`, the submodule, pointing to tag `0.12.0`.
- Modify: `emscripten/ARToolKitNFT_js.h/.cpp`, `emscripten/ARToolKitNFT_js_td.h/.cpp`. Add
  `int configure(NFTRuntimeSettings)` and `NFTRuntimeSettings getRuntimeSettings()`, which forward
  to the core.
- Modify: `emscripten/ARToolKitNFT_js_bindings.cpp`:
  - `value_object<NFTAR2Settings>("NFTAR2Settings")` and
    `value_object<NFTRuntimeSettings>("NFTRuntimeSettings")`, with the JS field names (`near`
    → `nearPlane`, `far` → `farPlane`, `detectionInterval` → `detectionIntervalMs`, `ar2` nested);
  - `.function("configure")` and `.function("getRuntimeSettings")`;
  - the free function `function("setLogLevel", &moduleSetLogLevel)`, which applies the same guard
    as `ARToolKitNFT::setLogLevel`.
- Modify: `src/abstractions/CommonInterfaces.ts`, adding `NFTRuntimeSettings` and
  `NFTRuntimeSettingsPatch`, as in the spec.
- Modify: `src/ARToolkitNFTBase.ts` and `src/ARToolkitNFT_node.ts`, adding
  `configure(patch: NFTRuntimeSettingsPatch): void` and
  `getRuntimeSettings(): NFTRuntimeSettings`.
- Modify: `src/ARControllerNFTBase.ts` and `src/ARControllerNFT_node.ts`:
  - the same two methods;
  - `getCameraMatrix()` reads the core's lens through `getCameraLens()` on each call, or refreshes
    `camera_mat` after every setter and `configure()`;
  - `_initialize()` sets the planes before reading the first lens (lines 865-868).
- Modify: `src/ARToolkitNFT_td.ts`, passing `true` to the native constructor (D13). Replace the
  comment that says the threaded binding does not filter.
- Modify: `src/index.ts`, `src/index_simd.ts`, `src/index_td.ts`, `src/index_node.ts`, adding the
  type exports.
- Modify: `emscripten/ARToolKitNFT_js_td.cpp:21`, the comment about filtering.
- Test: create `tests/vitest/runtime-settings.test.ts` (loop over `VARIANTS`) and
  `tests/node/runtime-settings.test.js`.
- Test: rewrite `tests/vitest/camera-lens.test.ts:38-40` and `tests/node/camera-lens.test.js`.
  They now expect the matrix to follow the setters.

**Interfaces:**
- Consumes: the WebARKitLib 0.12.0 API from Tasks 1 to 3.
- Produces:
  - `ARControllerNFT.configure(patch)` / `getRuntimeSettings()` on all four variants;
  - `Module.setLogLevel(level)` on every core build.

  Task 7 uses the latter inside `init()`.

- [ ] **Step 1: Write the failing tests**

```ts
it("matrix follows the planes from init", ...)        // getCameraMatrix() equals the matrix of a second controller where
                                                      // configure({ near: 0.1, far: 1000 }) was applied, right after init
it("setter rebuilds the matrix", ...)                 // setProjectionNearPlane(10): getCameraMatrix()[10] and [14] change (near/far terms)
it("configure round trip with nested ar2", ...)       // configure({ ar2: { simThresh: 0.6 } }); get().ar2 == { ...defaults, simThresh: 0.6 }, other fields unchanged
it("unknown and deprecated keys throw TypeError", ...)// configure({ nearPlane: 1 }), configure({ threshold: 5 }): TypeError; get() unchanged
it("invalid values throw RangeError", ...)            // configure({ near: 0 }), configure({ near: 1, far: 0.5 }), configure({ ar2: { searchFeatureNum: 41 } }): RangeError; get() unchanged
it("configure({}) changes nothing", ...)              // deepEqual(get() before, get() after)
it("filtering is accepted on every variant", ...)     // configure({ filtering: true }); get().filtering === true, including td
```

The Node test file covers the same cases, plus the #720 phase 1 check: right after load and after a
change, `getCameraMatrix()` matches `getProjectionNearPlane()`.

- [ ] **Step 2: Run, and expect a FAIL.** Run `npm run test:vitest -- runtime-settings camera-lens`
  and `node --test tests/node/runtime-settings.test.js`. Expect them to fail with `configure is not
  a function`.
- [ ] **Step 3: Bump the submodule** (`git -C emscripten/WebARKitLib checkout 0.12.0`) and implement
  the bindings and the TypeScript.
  - `configure(patch)`:
    1. reject unknown top-level and `ar2` keys with `TypeError`, naming the key;
    2. deep-merge into `getRuntimeSettings()`;
    3. call `instance.configure(merged)`;
    4. throw `RangeError` when the result is not 0;
    5. refresh the matrix.
  - Update the JSDoc of the plane setters and of `recalculateCameraLens()`: the lens follows the
    planes, and the method is kept for compatibility.
  - `logLevel` is per controller in JS (D9), and the JSDoc says so.
- [ ] **Step 4: Rebuild and run the tests.**
  - Run `docker exec emscripten-jsartoolkitnft npm run build`, then `npm run build-ts`.
  - Run `npm test`. Expected: everything passes, including the rewritten camera-lens tests.
- [ ] **Step 5: Commit** with `feat: configure() and getRuntimeSettings() on ARToolkitNFT and
  ARControllerNFT (#720)`. Two separate commits come after it, so the review stays readable:
  `chore: bump WebARKitLib to 0.12.0` and `chore: rebuild artifacts`.

### Task 7: Start-up log level and gated JS console lines (#677)

**Files:**
- Modify: `src/ARToolkitNFTBase.ts` and `src/ARToolkitNFT_node.ts`:
  - `init(options?: { logLevel?: ARLogLevel })` calls `instance.setLogLevel(level)` right after
    the factory and before `new instance.ARToolKitNFT(...)`;
  - the version `console.info` moves from the constructor into `init()`, after the level is set,
    and is logged at `RelInfo`.
- Create: `src/logger.ts`, exporting
  `logAt(level: ARLogLevel, current: ARLogLevel, ...args: unknown[]): void`.
- Modify: `src/ARControllerNFTBase.ts` and `src/ARControllerNFT_node.ts`:
  - the three `console.log("[ARControllerNFT]", …)` calls in `_initialize()` go through
    `logAt(Info, …)`;
  - `_initialize()` passes the options to `artoolkitNFT.init(options)`.
- Modify: `src/ARControllerNFT.ts`, `_simd.ts`, `_td.ts`, `_node.ts`. `initWithDimensions`,
  `initWithImage` and `customInit` take a trailing `options?: { logLevel?: ARLogLevel }`.
- Modify: `src/ARToolkitNFT_node.ts:497`, so that `add nft marker ids` goes through `logAt`.
- Test: `tests/vitest/runtime-settings.test.ts` and `tests/node/runtime-settings.test.js`.

- [ ] **Step 1: Write the failing tests**

```ts
it("init-time logLevel silences start-up output", ...)  // spy console.log/info/warn; initWithDimensions(w, h, cam, true, { logLevel: ARLogLevel.Error });
                                                        // no call between start and resolve; getRuntimeSettings().logLevel === ARLogLevel.Error
it("configure keeps the init-time level", ...)          // after the above, configure({ near: 1 }); getRuntimeSettings().logLevel still Error
it("default init still logs the version", ...)          // without options: one console.info call containing the package version
```

Break it on purpose once: remove the gate from Task 4 by building against WebARKitLib 0.11.1 locally,
and watch "init ARToolKitNFT constructor" break the first test. Then restore.

- [ ] **Step 2: Run, and expect a FAIL.**
- [ ] **Step 3: Implement as listed under Files.**
- [ ] **Step 4: Run `npm run build-ts && npm test`.** Expected: everything passes.
- [ ] **Step 5: Commit** with `feat: log level at initialisation, and JS console lines that follow it (#677)`.

### Task 8: Verification, documentation and the PR

**Files:**
- Modify: `README.md`. A short `configure()` section with one example, and the init `logLevel`
  option.
- Modify: `AGENTS.md`, only if a rule changed. None is expected.

- [ ] **Step 1: Tracking equivalence (#692).** Run `node tools/compare-builds.js`, with its usage
  from its header, against the artifacts of `origin/dev`.
  - Expected: the single-thread builds are bit-identical, and only the threaded build's poses
    differ.
  - Record the output in the PR.
- [ ] **Step 2: The AR2 value reaches the handle.** Add a vitest case to
  `tests/vitest/runtime-settings.test.ts`:
  - with `configure({ ar2: { trackingThresh: 0.01 } })`, the pinball photo sequence from
    `tests/vitest/frames.ts` no longer tracks;
  - with the defaults, it does.
- [ ] **Step 3: Examples.** Run `npm run test-node-example`. Expected: the pinball marker is
  detected and tracked, as before.
- [ ] **Step 4: Python.** Build the Python bindings at -O3 against the new core (`CFLAGS=-O3`, per
  the project notes), and run `pytest python-bindings/test_arcontrollerNFT.py`. Expected: 29/29
  pass.
- [ ] **Step 5: README, then rebuild.** Update the README, run `npm run build-ts`, revert the
  rebuild noise, and commit `doc: configure() and the init log level`.
- [ ] **Step 6: The PR.**
  - Push, and open a PR to `dev` titled
    `feat: runtime settings with configure() on the NFT core (#720, #677, #692)`.
  - The body has a change → reason table and the behaviour changes from the spec.
  - Add a note: "a PR into dev does not close issues". #677 and #692 close in the `dev` →
    `master` PR, or by hand.
- [ ] **Step 7: Follow-up issue.** Open an issue for `configure()` in the Python bindings.
