# Runtime settings in ARToolKitNFTCore (#720, phases 1 and 2)

**Date:** 2026-10-23
**Issue:** #720 (phases 1 and 2); also closes #677 and #692
**Status:** design agreed in discussion; this document is the written spec, awaiting approval

## Summary

`ARToolKitNFTCore` (WebARKitLib) gains one settings struct, `NFTRuntimeSettings`, and one entry
point, `configure(settings)`. The settings that may change while tracking live in it:

- the projection planes;
- continuous detection and the detection interval;
- pose filtering;
- the log level;
- the AR2 tracking parameters, which are hard-coded in `setupAR2()` today.

`configure()` recomputes whatever depends on the values it changes. New planes rebuild the camera
lens, and new AR2 parameters are applied to the live AR2 handle. The existing setters stay, and
each one becomes a shortcut that changes one field.

jsartoolkitNFT binds `configure()` / `getRuntimeSettings()` and exposes `configure(patch)` on
`ARToolkitNFT` and `ARControllerNFT`, in every variant that runs on the core. The camera matrix
becomes consistent with the planes at all times, so the `recalculateCameraLens()` workaround is no
longer needed. The log level can be set before the controller starts, so start-up output can be
silenced (#677).

This is the first of three projects that #720 is split into:

1. **This one:** the core and its binding, phases 1 and 2.
2. **The data-oriented TypeScript facade and the worker wrapper,** phases 3 to 5. It is built on
   the `configure()` delivered here.
3. **Migrating the consumers:** webarkit-studio first, then ARnft and aframe-nft.

## Why

The goal of #720 is that webarkit-studio, ARnft and aframe-nft stop rewriting the same layer on top
of `ARControllerNFT`. Most of that layer belongs to the facade, project 2. The facade needs a core
that can be configured in one call and keeps derived state consistent. Otherwise it would be born
with workarounds and a mapping onto setters, and both would have to be removed later.

- **The order is the user's choice: core first.** It avoids writing or changing the same code
  twice. The facade is written once, on the final API.
- **What webarkit-studio works around today** (`src/runtime/trackers/artk-session.ts`):
  - `refreshLens()` exists only because `_initialize()` caches the lens with the core's near plane
    of 0.0001, before it sets 0.1, and because the plane setters only store the value;
  - `apply()` maps a settings object onto five setters.

  Both disappear with this project.
- **The AR2 parameters cannot be tuned at all.** They are compiled in: tracking threshold 5.0,
  similarity threshold 0.5, 16 search features, template sizes 6 and 6.
- **#677:** start-up output cannot be silenced, because the log level can only be set after the
  controller exists.

## Goals, non-goals, anti-goals

**Goals**

- G1. `NFTRuntimeSettings` and `ARToolKitNFTCore::configure()` in WebARKitLib. Changing the planes
  rebuilds the lens when a camera is loaded. Changing the AR2 parameters applies them to the live
  handle. `getRuntimeSettings()` returns the current values.
- G2. **Defaults equal today's behaviour,** except for the near plane, which is 0.1 instead of
  0.0001 (D4). Tracking results do not change.
- G3. **The camera matrix is always consistent with the planes.** This holds right after
  initialisation, after a setter, and after `configure()`, with no `recalculateCameraLens()` call
  needed.
- G4. `configure(patch)` and `getRuntimeSettings()` on `ARToolkitNFT` and `ARControllerNFT`:
  default, `_simd`, `_td` and `_node`. Unknown keys and invalid values throw. Nothing is applied
  half-way.
- G5. **The log level can be set before initialisation,** and it reaches WebARKitLib's logger, the
  ARToolKit logger and the JS console lines of the controller (#677).
- G6. **Existing setters, getters and `recalculateCameraLens()` keep working,** with the same
  names and arguments.

**Non-goals**

- The facade, `FrameResult`, transitions with a configurable `lostTimeout`, per-marker filters,
  `projectionFor()` and the worker wrapper. These are project 2.
- `removeMarkers`, marker sizes in millimetres, and the `'capacity'` reason. These are phase 3,
  project 2.
- **The Python bindings.** They keep compiling against the new core, and the behaviour change in
  D4 applies to them. Exposing `configure()` in Python is a follow-up issue.
- **The legacy APIs in `js/`.** They run on `emscripten/ARToolKitJS.cpp`, not on the core.
- **Merging `NFTRuntimeSettings` with `NFTTrackingConfig`** (#720, open question 3). They stay
  separate (D2).
- **Deprecating the individual setters.**

**Anti-goals** (this fails if it happens, even if the tests pass)

- Tracking output changes with the default settings. The near plane does not affect tracking,
  only the projection.
- A consumer that uses the setters breaks, or has to change its code. This includes Python,
  WebAR-Canvas, aframe-nft and webarkit-studio.
- `configure()` applies part of a patch and then fails.
- Project 2 has to change the API delivered here.

## Approaches

Three ways to build `configure()` were considered. The user chose **A**.

- **A. A `NFTRuntimeSettings` struct and `configure(settings)`, as in #720 (chosen).**
  - The core recomputes what depends on the settings.
  - The existing setters stay, and each changes one field.
  - In JS, `configure(patch)` merges the patch into `getRuntimeSettings()` and passes the full
    struct.
  - Pro: one entry point, which native consumers (Python, WebAR-Canvas) get for free.
  - Con: an Embind value object and more binding code.
- **B. Only new setters for the AR2 parameters, no struct.**
  - Pro: the least change to the core.
  - Con: every wrapper keeps mapping an object onto a sequence of calls, which is exactly what
    #720 sets out to remove. Rejected for that reason.
- **C. A native patch with `std::optional` fields.**
  - Pro: the patch reaches the core unchanged.
  - Con: awkward to expose through Embind and pybind11, and it gains nothing over A, where the
    merge happens in JS. Rejected.

## Decisions

**user** means agreed in the discussion; **design** means this document's call, open to review.

- **D1 (user). Order and split.** #720 becomes three projects: this one, then the facade and
  worker, then the consumer migration. The core comes first so that no code is written twice.
- **D2 (user, from #720). Runtime settings are separate from `NFTTrackingConfig`.**
  `NFTTrackingConfig` keeps the variant choices fixed at construction: the detector, the AR2
  variant and the presets. `NFTRuntimeSettings` holds what may change while tracking. The preset
  still supplies the default detection interval.
- **D3 (user). Approach A.**
- **D4 (design). The core's default near plane becomes 0.1.**
  - The reasons:
    - `ARControllerNFT` already advertises 0.1;
    - #720 phase 1 asks for the two to be aligned;
    - aligning the core is the only way the first lens is right without a second computation.
  - The effect is that `getCameraMatrix()` right after initialisation is built with 0.1 instead of
    0.0001, in JS and in Python.
  - No known consumer depends on the old value. ARnft and aframe-nft ignore near/far, ARnft-threejs
    overwrites the projection, and webarkit-studio recomputes it with 0.1.
  - This is recorded as a behaviour change.
- **D5 (design). The plane setters rebuild the lens when a camera is loaded.** Before
  `setCamera()` they only store the value, as there is no lens yet. `recalculateCameraLens()`
  stays for compatibility, but is no longer needed.
- **D6 (design). AR2 parameters live in the settings, and `setupAR2()` reads them** instead of the
  constants.
  - A new AR2 handle gets the current settings. This happens after `setCamera()` and after
    `setupAR2()`.
  - `configure()` applies changed parameters to the live handle with the `ar2Set*` calls, except
    the template sizes (D12).
  - The fields:
    - `trackingThresh`, default 5.0;
    - `simThresh`, default 0.5;
    - `searchFeatureNum`, default 16;
    - `templateSize1` and `templateSize2`, default 6 each;
    - `searchSize`, default 0, which means "the preset's choice": 6, or 12 on a multi-CPU
      threaded build, as today.

    `searchSize` is not in #720's sketch. It is added because the threaded preset already varies it,
    and leaving it out would hard-code that choice again.
- **D7 (design). `configure()` validates everything first, then applies.**
  - It returns 0 on success, or a negative value with nothing changed.
  - Invalid means:
    - `nearPlane <= 0`, or `farPlane <= nearPlane`;
    - a negative interval, other than the `-1` sentinel;
    - an unknown log level;
    - AR2 values outside the ranges below.

    `filtering` is valid on every build, because #692 is folded in (D13).
  - **AR2 ranges.** AR2 itself checks nothing: every `ar2Set*` in `lib/SRC/AR2/handle.c` accepts
    any value, except `ar2SetSearchFeatureNum`, which silently clamps to [3, 40]
    (`AR2_SEARCH_FEATURE_MAX`). So the ranges are this project's own:
    - `searchFeatureNum` outside [3, 40] is rejected, never clamped;
    - for the other fields, the builder chooses conservative bounds that include every value the
      presets use. The bounds and the reason for each go in a code comment.
  - **Sentinels.** `detectionIntervalMs = -1` and `searchSize = 0` are accepted, and mean "follow
    the preset". They are kept as sentinels, so a later `setupAR2()` re-resolves `searchSize`.
    `getRuntimeSettings()` returns the effective values. A JS read-modify-write therefore sends
    back explicit values, equal to the preset's choice for that session, so behaviour does not
    change.
  - The reason is #720's rule that an unsupported explicit request fails and is never silently
    substituted. The existing setters keep their current lenient behaviour, for example "negative
    interval means 0", so callers do not break.
- **D8 (design). The JS `configure(patch)` merges and checks the keys.**
  - It takes a deep-partial patch: nested `ar2` fields merge one by one.
  - It merges the patch into `getRuntimeSettings()` and calls the binding once.
  - It throws a `TypeError` on an unknown key, including the square-marker keys that #707
    deprecated: `threshold`, `thresholdMode`, `imageProcMode`, `debugMode`. Their setters are
    deprecated, not removed, and they have no effect on NFT.
  - It throws a `RangeError` when the core refuses the values.
  - It returns nothing. `getCameraMatrix()` reflects the new planes at once.
- **D9 (design). The log level lives in the module globals, not in the core instance.**
  - `arLogLevel` and `webarkitLogLevel` are globals of a WASM module.
  - In JS, every `init()` calls the MODULARIZE factory again, so each controller has its own
    module: the level is **per controller**. For native consumers and Python, it is
    **process-wide**. The JSDoc says both.
  - `getRuntimeSettings().logLevel` reads `arLogLevel`. The core constructor does not touch the
    globals. The reason: if the core held its own copy, the first `configure({ near })` after an
    init-time `logLevel` would write the core's INFO back over it.
- **D10 (design). #677 is closed here, all three of its points:**
  1. `initWithDimensions`, `initWithImage` and `customInit` take an optional trailing
     `options: { logLevel?: ARLogLevel }`.
     - The level is applied inside `init()`, on the fresh module, between the factory call and
       `new instance.ARToolKitNFT(...)`, through a module-level binding.
     - That covers the core constructor's `init ARToolKitNFTCore`, the camera dump and
       `setCamera()`.
  2. **Every native logger follows the same level.**
     - WebARKitLib's logger already follows it since 1.14, through `setLogLevel()`.
     - The Emscripten logger (`lib/SRC/WebARKit/WebARKitLog.cpp`) prints through `EM_ASM` with no
       level check today. That is how the adapter's `init ARToolKitNFT constructor...` and
       `withFiltering` lines get through. The WebARKitLib 0.12.0 PR gates it on
       `webarkitLogLevel`. Without that, the start-up output cannot be silenced and #677 stays
       open.
  3. The JS console lines go through a small level check:
     - the version line, which moves from the `ARToolkitNFT` constructor into `init()` after the
       level is applied, and is logged at `RelInfo` so it can still be kept;
     - the three `[ARControllerNFT] …` lines in `_initialize()`;
     - `add nft marker ids`, which survives only in `ARToolkitNFT_node.ts`.

  The reason it is done here: the same code path, and #720 phase 2 lists it.
- **D12 (user). A template-size change recreates only the AR2 handle.**
  - AR2 builds each tracking thread's template once, on the first tracked frame
    (`lib/SRC/AR2/tracking2d.c:106`, `trackingMod2d.c:81`), and reuses it. A later
    `ar2SetTemplateSize1/2` stores the number with no effect.
  - So when `templateSize1` or `templateSize2` changes, `configure()` deletes the AR2 handle and
    creates a new one with the current settings, through the same create call `setupAR2()` uses
    for the build's AR2 variant.
  - The markers stay loaded, because each marker's tracking state lives in its surface set, not in
    the handle.
  - The KPM handle and the detector are not touched. `setupAR2()` itself still replaces both, as
    today.
  - This needs a new code path in the core, separate from `setupAR2()`. Before a camera is set
    there is no handle, so the sizes are only stored.
  - The reason: it is the only option that makes the change take effect live without reaching into
    AR2's internals.
- **D13 (design, after the user pointed to #692). The threaded build gets pose filtering here;
  this closes #692.**
  - Today `threadedPreset()` has `poseFilteringSupported = false`, and `setFiltering(true)` has no
    effect on the threaded build. #692 plans to enable it in the threaded preset once the core
    exists, and the core now exists.
  - Doing it here avoids writing a "filtering is unsupported on td" rejection in `configure()`
    that #692 would then have to remove.
  - The changes:
    - the threaded preset supports filtering, with per-marker `arFilterTransMat`, cutoff 60.0,
      sample rate 120.0, and a reset on (re)acquisition, as in the single-thread build;
    - `ARToolkitNFT_td` constructs the binding with an explicit `true`, like the other builds.
      Today it passes nothing, which leaves `withFiltering` uninitialised.
  - **Verification**, as #692 asks: with `tools/compare-builds`, the poses change in the
    threaded build only, and the single-thread builds stay bit-identical.
  - This is recorded as a behaviour change. The threaded build's poses become filtered by default.
- **D11 (design). Releases.**
  - **WebARKitLib 0.12.0,** a minor release: a new API, plus the D4 behaviour change. It follows
    the usual process: a version bump in `WebARKitConfig.cpp` and the tests, `dev` → `master` merge
    commit, an annotated tag, and a GitHub release.
  - **jsartoolkitNFT:**
    - bumps the submodule to that tag;
    - adds the bindings and the TypeScript surface;
    - rebuilds the WASM in the pinned emsdk 4.0.17 container, and commits `build/`, `dist/` and
      `types/`.

## Current state

- **The core** (`ARToolKitNFTCore.cpp`):
  - the constructor sets `nearPlane(0.0001)`, `farPlane(1000.0)`, `continuousDetection(true)`
    and the preset's detection interval;
  - `setupAR2()` hard-codes the AR2 parameters, with `searchSize` 6, or 12 when
    `cpuDependentSearchSize` and more than one CPU;
  - `setProjectionNearPlane` and `setProjectionFarPlane` only store the value;
  - `setCamera()` builds the lens with the planes as they are at that moment;
  - `recalculateCameraLens()` rebuilds it, and does nothing without `paramLT`.
- **The adapters** `emscripten/ARToolKitNFT_js.cpp` and `_td.cpp`, bound in
  `ARToolKitNFT_js_bindings.cpp`:
  - `setLogLevel` sets `arLogLevel` and `webarkitLogLevel`;
  - the other setters forward to the core.
- **`ARControllerNFTBase._initialize()`:**
  - caches `camera_mat = getCameraLens()` before it calls `setProjectionNearPlane(0.1)` and
    `setProjectionFarPlane(1000)`;
  - so the cached matrix uses 0.0001 until `recalculateCameraLens()`.
- **The JS console lines:**
  - `console.info("ARToolkitNFT ", version)` in the `ARToolkitNFT` constructor, before `init()`;
  - three `console.log("[ARControllerNFT]", …)` calls in `_initialize()`;
  - `add nft marker ids`, now only in `ARToolkitNFT_node.ts`.
- **The Emscripten logger** (`WebARKitLog.cpp`) prints with `EM_ASM` and checks no level.
- **One WASM module per controller.** Every `init()` calls the MODULARIZE factory again, so each
  controller has its own globals.
- **Filtering.** The threaded preset has `poseFilteringSupported = false`. The default, SIMD and
  Node toolkits construct `ARToolKitNFT(true)`, so filtering is on; the threaded toolkit passes
  nothing, so it is off.
- **Existing tests:** `tests/vitest/camera-lens.test.ts` and `tests/node/camera-lens.test.js`
  assert the old store-only behaviour of the plane setters. D5 makes them fail, so they are
  rewritten.
- **The Node variant** is not on the shared base classes (#734's open part), so it is edited in
  place, as #685 did.
- **The Python adapter** (`python-bindings/ARToolKitNFT_py.cpp`) runs on the core with
  `singleThreadPreset()`.

## Design

### WebARKitLib

```cpp
// NFTRuntimeSettings.h, next to NFTTrackingConfig.h
struct NFTAR2Settings {
  float trackingThresh = 5.0f;
  float simThresh = 0.5f;
  int searchFeatureNum = 16;
  int templateSize1 = 6;
  int templateSize2 = 6;
  int searchSize = 0;              // 0: the preset's choice (6, or 12 with cpuDependentSearchSize)
};

struct NFTRuntimeSettings {
  ARdouble nearPlane = 0.1;
  ARdouble farPlane = 1000.0;
  bool continuousDetection = true;
  double detectionIntervalMs = -1; // -1: the preset's defaultDetectionIntervalMs
  bool filtering = false;
  int logLevel = AR_LOG_LEVEL_INFO;
  NFTAR2Settings ar2;
};

class ARToolKitNFTCore {
  int configure(const NFTRuntimeSettings &settings); // 0, or <0 with nothing changed (D7)
  NFTRuntimeSettings getRuntimeSettings() const;     // effective values (preset defaults resolved)
  // existing setters/getters unchanged in signature; each now updates one field (D5, D6)
};
```

**`configure()`:**

1. Validate every field.
2. Store the struct.
3. If a plane changed and `paramLT` exists, rebuild the lens.
4. If an AR2 field changed and the handle exists:
   - for a template size, recreate the AR2 handle (D12);
   - otherwise, call the matching `ar2Set*`.
5. Apply the log level to `arLogLevel` and `webarkitLogLevel`.
6. Apply filtering, continuous detection and the interval as their setters do today.

**Threading.** On the threaded build, `configure()` is called between frames on the thread that
calls `detectNFTMarker()`. AR2 tracking runs inside that call, so changing the handle between
frames is safe. The threaded KPM search does not use the AR2 handle. This goes in a code comment.

**`getRuntimeSettings()`** returns the effective values: the resolved interval and the resolved
`searchSize`. So a read-modify-write round trip never changes behaviour.

**Tests** (gtest, in `tests/`):

- a `configure()` round trip;
- invalid input leaves everything unchanged;
- new planes rebuild the lens, compared with `arglCameraFrustumRH` for the same planes;
- the lens before `setCamera()` (store only) and after it;
- AR2 parameters reach a live handle, read back with `ar2Get*`, or from the handle's fields where
  no getter exists;
- a new handle after `setCamera()` gets the stored parameters;
- a template-size change replaces the AR2 handle:
  - the new handle carries the new sizes;
  - the loaded markers still track afterwards;
  - the KPM handle is the same object as before;
- the defaults match the old constants.

### jsartoolkitNFT: bindings

- In `ARToolKitNFT_js.cpp` / `.h` and `_td`, plus `ARToolKitNFT_js_bindings.cpp`:
  - `configure(settings)` and `getRuntimeSettings()`, with Embind `value_object`s for both structs
    (nested `ar2`);
  - a module-level `setLogLevel(level)` free function for D10, usable before any instance exists.
- Anything reached as `Module.x` goes in `EXPORTED_RUNTIME_METHODS` in `tools/makem.js`, as
  AGENTS.md requires.

### jsartoolkitNFT: TypeScript

```ts
// CommonInterfaces.ts
interface NFTRuntimeSettings {
  near: number; far: number;
  continuousDetection: boolean;
  detectionInterval: number;        // ms
  filtering: boolean;
  logLevel: ARLogLevel;
  ar2: { trackingThresh: number; simThresh: number; searchFeatureNum: number;
         templateSize1: number; templateSize2: number; searchSize: number };
}
type NFTRuntimeSettingsPatch = Partial<Omit<NFTRuntimeSettings, "ar2">> & {
  ar2?: Partial<NFTRuntimeSettings["ar2"]>;
};
```

The JS names follow #720's `TrackerConfig`: `near`, `far` and `detectionInterval`. That way
project 2's facade passes them through unchanged. The binding maps them onto the C++ field names.

- **`ARToolkitNFTBase` and `ARToolkitNFT_node`:** `configure(patch)` and
  `getRuntimeSettings()`, following D8.
- **`ARControllerNFTBase` and `ARControllerNFT_node`:**
  - the same two methods;
  - `getCameraMatrix()` always returns the core's current lens. Either the cache is refreshed after
    every change, or it reads through; that is left to the builder.
- **`_initialize()`:** the planes are set before the first lens is read, so the cached matrix
  matches the planes from the start (G3).
- **The init options** follow D10.1. Every `init*` and `customInit` takes an optional trailing
  `options: { logLevel?: ARLogLevel }`.
- **A small logger** gates the JS console lines on the level (D10.3).
- **Exports:** `NFTRuntimeSettings` and `NFTRuntimeSettingsPatch` are exported as types from every
  entry point.
- **The JSDoc** of the plane setters and `recalculateCameraLens()` drops "only store them", and
  says the lens follows the planes.

## Behaviour changes for callers

These go in the release notes, with their reasons:

1. **`getCameraMatrix()` right after initialisation uses near 0.1,** not 0.0001, and it follows
   every plane change at once (D4, D5).
2. **The plane setters rebuild the lens** when a camera is loaded (D5).
3. **Start-up output can be silenced** with `init*(…, { logLevel })`. The controller's own JS
   lines follow the log level (D10).
4. **New:** `configure()` and `getRuntimeSettings()`, which include the AR2 parameters.
5. **Python:** the camera matrix right after setup uses near 0.1 (D4), after the Python bindings
   move to the new WebARKitLib.
6. **Threaded build:** poses are filtered by default, and `setFiltering()` / `configure({
   filtering })` now take effect (D13, #692).

## Testing

- **WebARKitLib:** the gtest cases above, which run in WebARKitLib's CI and in Docker per the
  project notes.
- **Browser** (`tests/vitest/runtime-settings.test.ts`, looping over `VARIANTS`):
  - `getCameraMatrix()` matches `getProjectionNearPlane()` right after init, after a setter, and
    after `configure()`, compared with a matrix computed for the same planes;
  - `configure` round trip, including nested `ar2` merging;
  - an unknown key and a #707 key throw `TypeError`, and nothing changes;
  - invalid values throw `RangeError`, and nothing changes;
  - the default settings equal the old behaviour: detection and pose on the pinball photo equal
    those before the change;
  - the `logLevel` init option silences the start-up console lines (spy on `console`).
- **Node:** the same in `tests/node/`. #720 phase 1 also asks for "getCameraMatrix matches
  getProjectionNearPlane right after load and after a change".
- **Tracking:**
  - `tools/compare-builds` gives identical tracking output before and after with the defaults;
  - `examples/node/example_dist.js` still tracks;
  - an AR2 change visibly changes behaviour. For example, a very high `trackingThresh` stops
    tracking on the photo sequence, which proves the value reaches the handle.
- **Python:** the existing pytest suite passes against the new core. It is built at -O3, per the
  project notes.

## Recording the reasons

Each behaviour change carries its reason in four places: a code comment, the commit body, a "change
→ reason" table in each PR, and the release notes. The comments that must exist:

- D4: why the near plane is 0.1;
- D5: why the setters rebuild the lens;
- D6: what `searchSize` 0 means, and why it was added;
- D7: why `configure()` validates first while the setters stay lenient;
- D9: why the log level is process-wide;
- the threading note.

## Delivery

1. **WebARKitLib PR to `dev`:**
   - `NFTRuntimeSettings` and `configure()`;
   - the setter changes;
   - the AR2-only handle recreation (D12);
   - the level gate on the Emscripten logger (D10.2);
   - the gtests.

   Then the 0.12.0 release.
2. **jsartoolkitNFT PR to `dev`** (`feat/720-runtime-settings`):
   - the submodule bump;
   - the bindings and `makem.js`;
   - the TypeScript surface, the init options and the logger;
   - the tests;
   - the rebuilt artifacts.

   The title is `feat: runtime settings with configure() on the NFT core (#720, #677, #692)`.
3. **Follow-up issue:** `configure()` in the Python bindings.

## Risks

- **The near plane change** could affect a consumer that read the initial matrix without
  recalculating it. None is known, and it is in the release notes.
- **The Embind `value_object` with a nested struct:** if nested value objects prove awkward, flatten
  the AR2 fields in the binding only. The TS shape stays nested.
- **AR2 parameter ranges:** AR2 sets no limits, so the bounds are this project's (D7). Bounds that
  are too tight would reject configurations consumers use, so they must include every preset value
  and stay generous.
- **Log noise in tests:** gating the JS console lines may hide output that existing tests or
  examples look for. Grep for it before changing it.

## Left to the builder

- The file layout in WebARKitLib, and the exact error codes of `configure()`.
- Whether `getCameraMatrix()` reads through or refreshes a cache.
- The logger's shape and name.
- The test file names, beyond the AGENTS.md placement rules.
- The commit split.
