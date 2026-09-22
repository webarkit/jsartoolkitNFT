# Test suite refresh, `HEAPU8` regression, and incremental NFT marker loading

**Date:** 2026-09-20
**Issues:** #614 (`HEAPU8` / `process()`), #612 (`addNFTMarkers`), #579 (test refresh),
#602 (CI hardening), #580 (coverage)

> **Status (2026-09-21).** A design record, kept for the reasoning rather than as a
> live plan. Since it was written: #614 shipped in 1.10.2; the Vitest harness landed in
> #628; #602's CI hardening is done. Still open: #612 (parked), #580 (coverage upload),
> and expanding the harness to all seven targets to retire Karma (#579).
>
> One conclusion below has since been overturned. Two-marker detection was originally
> read as an index-mapping fault; it is actually a matcher false positive, and KPM can
> only report one marker per frame regardless. See #631 and #635.

## Context

Work on multi-target support in [Aframe-nft] surfaced #612: `addNFTMarkers()` derives page
numbers, marker ids and `surfaceSet` indices from its loop counter, so it only works when called
exactly once. Investigating how to verify a fix exposed two larger problems.

**The test suite cannot verify the fix, because it does not test the library.** The specs check
`typeof` on methods, matrices and debug flags. Nothing loads an NFT marker; nothing calls
`process()`. Worse, the targets point at the wrong artifacts: `min`, `debug`, `wasm` and `simd`
exercise `js/artoolkitNFT.api.js` — the legacy API that logs its own deprecation warning on load —
and the ES6 targets poke the raw Emscripten binding class. **No test touches `src/` → `dist/`,
which is what `package.json` `main`/`exports` ships and what downstream consumers import.**

**That blind spot has already shipped a regression.** `HEAPU8` is absent from
`EXPORTED_RUNTIME_METHODS`, so `Module.HEAPU8` is `undefined` and every `process()` call throws
(#614). It reached 1.10.1 because no test pushes a frame through the pipeline.

A browser-mode spike confirmed all of the above empirically, reproduced #612 on both the legacy and
TypeScript paths, and established that Vitest can import `src/index.ts` directly against real WASM.

[Aframe-nft]: https://github.com/webarkit/Aframe-nft

## Goals

- `process()` works again, on every build variant, with a test that would have caught its breaking.
- `addNFTMarkers()` supports incremental loading: ids, page numbers and surface sets accumulate
  across calls, and earlier markers survive later loads.
- The suite exercises the shipped TypeScript API, so coverage numbers mean something.
- CI stops depending on an apt/snap Chromium install.

## Non-goals

- Removing the legacy `js/artoolkitNFT.api.js` API. Tracked in #616; this work only reduces its
  test surface to a smoke test and repairs its `HEAPU8` usage.
- Removing or replacing `axios` in `src/Utils.ts`.
- Reworking the threading (`td`) or Python binding builds beyond what the matrix needs.
- Any change to the tracking/detection algorithms.

## Sequence

| Step | Work | Issues | Docker |
|---|---|---|---|
| 0 | Vitest harness + failing tests for #614 and #612 | #579 (slice) | no |
| 1 | `HEAPU8` export + stale-cache fix | #614 | yes |
| 2 | `addNFTMarkers` offset + KPM accumulation | #612 | yes |
| 3 | Full target matrix; CI hardening | #579, #602 | no |
| 4 | Coverage → Codecov | #580 | no |
| 5 | Dependency upgrades | dependabot | no |

Step 0 precedes the fixes so both land test-first. Steps 1 and 2 share one Docker/emsdk rebuild.

**Plan decomposition.** Steps 0–2 form one implementation plan: they share a branch, a rebuild
cycle, and a single coherent outcome — a harness that proves two fixes. Steps 3–5 each get their own
plan afterwards, because each is independently shippable and none blocks Aframe-nft. This document
is the spec for all six; only 0–2 are planned in detail first.

## Test architecture

Three layers exist in this codebase. Each gets an explicit job, replacing the current arrangement
where the layer under test is incidental.

### L2 — the TypeScript API (primary suite)

Tests import `src/index.ts`, `src/index_simd.ts`, `src/index_td.ts` and `src/index_node.ts`
directly. Vite compiles TypeScript natively, so there is no webpack step and no risk of testing a
stale `dist/`. The spike confirmed `ARControllerNFT.initWithDimensions()` and `loadNFTMarker()`
work against real WASM under this import.

This layer owns: camera parameter loading, NFT marker loading, `process()` on a real frame, the
marker-id contract, and the #612 incremental-loading regression test. It is the only layer where
coverage of `src/` is meaningful.

### L1 — the Emscripten modules (smoke matrix)

For each committed `build/*.js` artifact, one thin test: the module instantiates, and it exports
the surface `src/` depends on — `FS`, `_malloc`, `_free`, `HEAPU8`.

The `HEAPU8` assertion is the permanent #614 guard. Build-flag regressions belong at this layer,
not buried in an application-level test.

### L3 — the legacy API (smoke only)

`js/artoolkitNFT.api.js` currently accounts for four of seven targets and prints
*"This library is deprecated, use the ES6 version instead"* on load. It keeps a single
"loads and initialises" test per legacy target — enough to notice a hard break — and a separate
issue is opened to plan its removal. No further test investment.

### Configuration

The seven hand-maintained npm scripts and three near-duplicate Karma configs collapse into one
`vitest.config.ts` whose `projects` array expresses the matrix as data. Fixtures need no proxy
configuration: Vite serves `examples/DataNFT/**` and `examples/Data/**` from the project root.

Runner choice: **Vitest browser mode with the Playwright provider**. Karma has been deprecated by
its maintainers since 2023; refreshing an outdated suite onto a dead runner is not worth doing.
Vitest additionally supplies the Playwright-managed Chromium that #602 asks for and the lcov
coverage that #580 asks for, from one tool.

Version notes from the spike, which differ from most published examples: Vitest is at **5.0.1**,
where the Playwright provider ships as a separate package `@vitest/browser-playwright` and is used
as `provider: playwright()`; the `basic` reporter has been removed.

### Known complexities

- The `td` (threading) project needs `SharedArrayBuffer`, so it requires COOP/COEP response headers
  via Vite's `server.headers`.
- The node project runs in Vitest's node environment against `src/index_node.ts`, which has no
  tests today. Node-specific coverage is folded in here per #579's note on #140.
- Jasmine → Vitest is close to 1:1 for the existing assertions (`toBe`, `toBeDefined`,
  `toBeCloseTo`, `toBeTruthy` all exist). Only `done` callbacks and `fail()` need rewriting to
  async/await, across roughly 260 lines.

## Fix: #614 — `HEAPU8` is not exported

**Cause.** `tools/makem.js` L221 sets `EXPORTED_RUNTIME_METHODS=["FS"]`; the node flags at L232 set
`["NODEFS","FS"]`. Neither includes `HEAPU8`. `_malloc` was exported (commit `ada13f2`), but the
other half of what the `#604` manual-allocation refactor (`3b43aac`) needs was not.

The legacy build is non-MODULARIZE, so Emscripten's internal `HEAPU8` is reachable as a **global**.
`Module.HEAPU8` is a different thing and is never attached. Before `3b43aac` the built legacy file
contained zero occurrences of `Module.HEAPU8` — the frame copy went through the bare global. That
commit swapped a working global reference for an unexported `Module` property, in
`js/artoolkitNFT.api.js` *and* in the TypeScript sources simultaneously.

The emsdk 3.1.69 → 4.0.17 bump (`f3ae7a2`, 2025-10-24) is **not** implicated; the pre-refactor build
predates it and used the bare global regardless.

**Every distribution path is therefore broken**, not just the TypeScript one — confirmed by running
`examples/node/example_dist.js`, which dies on the first `process()` with no marker detected:

| path | entry | status |
|---|---|---|
| legacy browser | `js/artoolkitNFT.api.js` | broken |
| TS / ES6 | `src/ARToolkitNFT.ts`, `_simd`, `_td` | broken |
| node | `src/ARToolkitNFT_node.ts` | broken (verified) |

**Changes.**

1. Add `HEAPU8` to `EXPORTED_RUNTIME_METHODS` in both flag strings in `tools/makem.js`.
2. Drop the cached `HEAPU8` field; read `this.instance.HEAPU8` at each point of use in
   `ARToolkitNFT.ts`, `ARToolkitNFT_simd.ts`, `ARToolkitNFT_td.ts`, `ARToolkitNFT_node.ts`.
3. Fix the two `Module.HEAPU8.set(...)` calls in `js/artoolkitNFT.api.js`. Exporting `HEAPU8` per
   change 1 repairs them, but they must be verified explicitly — this is the path every browser
   example loads, and the duplication between it and `src/` is what let the regression hide.
4. Rebuild the WASM targets.

Step 2 is not optional cleanup. `ALLOW_MEMORY_GROWTH=1` is enabled (`tools/makem.js` L223), and
Emscripten *replaces* the `HEAPU8` typed array when the heap grows. A reference captured at `init()`
becomes detached, so caching would remain a latent bug even after the export is fixed.

**Verification.** L1 smoke asserts `HEAPU8` is exported on every target; an L2 test pushes one
frame through `process()` and asserts it does not throw.

## Fix: #612 — `addNFTMarkers` cannot be called more than once

**Cause.** `emscripten/ARToolKitNFT_js.cpp` uses the bare loop index for `pageNo`, `markerIds`,
`surfaceSet[i]` and `nft.id_NFT`, all of which restart at `0` on each call.

The KPM half was verified against the library rather than assumed:
`kpmSetRefDataSet` (`emscripten/WebARKitLib/lib/SRC/KPM/kpmMatching.cpp:173`) **copies** the
incoming set into `kpmHandle->refDataSet` and explicitly `free()`s the previous `refPoint` and
`pageInfo`. It is a true replace — which is why previously loaded markers vanish from detection.

**Changes.**

1. Offset every derived index by the existing count: `base = this->surfaceSetCount`,
   `slot = base + i`, used for `pageNo`, `markerIds`, `surfaceSet[slot]` and `nft.id_NFT`.
2. Accumulate the KPM reference set. Keep a `KpmRefDataSet*` as a class member, merge each call's
   datasets into it, and call `kpmSetRefDataSet` with the accumulated set. This is safe precisely
   because the handle copies. Add a matching `kpmDeleteRefDataSet` in teardown.
3. Guard `PAGES_MAX` against `base + datasetPathnames.size()`, not the incoming size alone.
   `surfaceSet` is a fixed `AR2SurfaceSetT*[PAGES_MAX]` (`ARToolKitNFT_js.h:113`), so an unguarded
   overflow is a genuine memory error, not a logic slip.
4. Fix the same per-call 0-based bug on the JS side: `Ids.push(index)` at `src/ARToolkitNFT.ts:505`.
5. Delete the dead local `auto surfaceSetCount = this->surfaceSetCount;` copy and its increment,
   which read as though they maintain state but do not.

**Adjacent cleanup.** `std::unordered_map<int, AR2SurfaceSetT *> surfaceSets` at
`ARToolKitNFT_js.h:114` is declared and never referenced anywhere in the codebase. It sits directly
beside the members being changed and is removed with them.

**Verification.** An L2 test loads `pinball`, asserts id `0`; loads `kuva` in a second call,
asserts id `1`; asserts both markers remain present; and calls `process()` afterwards to confirm the
first marker's surface set was not invalidated. The spike confirmed this test fails on current
`master` in the expected way — the second callback never fires and the module raises an
Emscripten exception.

## CI and coverage

**#602 — browser provisioning.** Resolved by construction: Vitest's Playwright provider manages its
own Chromium, so the `apt-get install chromium-browser` step that failed on a Snapcraft timeout is
deleted rather than retried.

**Stale-artifact blind spot.** CI runs `npm test` against the *committed* `build/*.js`, which are
rebuilt only by `main.yml` after merge. A PR changing `tools/makem.js` or `emscripten/**` therefore
passes against stale WASM — precisely how #614 shipped green. A conditional job is added: on PRs
touching `emscripten/**` or `tools/makem.js`, run the Docker/emsdk build and execute the L1 smoke
matrix against the freshly built artifacts. Other PRs stay fast on committed artifacts.

**#580 — coverage.** Vitest's v8 provider, scoped to `src/**`, emitting lcov for
`codecov/codecov-action`, report-only initially per the issue. Scoping matters: instrumenting the
Emscripten glue or the legacy bundle produces a large and meaningless number, and before the L2
suite exists `src/` coverage would read approximately zero regardless of how many targets run.

**Local developer experience.** `.nvmrc` pins `24.15.0`. Where that version is not installed, the
nvm shim fails every `node`/`npm` invocation inside the repository directory, so `npm test` cannot
run at all until a version is selected by hand. #602 already carries a task to document local test
runs; this belongs in it.

## Dependencies

Ordering matters, because the migration deletes some of the outstanding work:

| PR | Pulled in by | Fate |
|---|---|---|
| #608 socket.io-parser | `karma` only | auto-closes on Karma removal |
| #610 brace-expansion | `karma`, `karma-webpack`, `typedoc` | partly auto-closes |
| #609 fast-uri | `webpack` → `schema-utils` → `ajv` | survives; webpack stays for `dist/` |
| #606, #599 linkify-it, markdown-it | `typedoc` | survive |
| #598, #600 axios, form-data | `axios` (runtime dependency) | survive; one tree |
| #594, #595 prettier, `@types/node` | devDependencies | trivial; any time |

Upgrades land after the harness, so they are verifiable rather than merged on faith.

**Packaging bug found in passing.** `canvas` (^3.2.3) and `sharp` (^0.35.2) are declared in
`dependencies` but referenced only by `examples/node/**`. Every consumer of the published package
therefore downloads native binaries and triggers a `node-gyp` rebuild. They belong in
`devDependencies`. Filed as #615; related to the parked npm-publish trim.

## Risks

- **The `HEAPU8` fix is unverified.** The export surface and the throw were confirmed empirically,
  but the one-line flag change has not been rebuilt and tested. Step 1 begins by proving it.
- **KPM accumulation is the least certain change.** Retaining a merged `KpmRefDataSet` across calls
  is a new lifetime in this code. It needs explicit teardown and a check for leaks across repeated
  load/dispose cycles.
- **Threading target.** If COOP/COEP under Vitest proves awkward, the `td` project may need to be
  deferred to a follow-up rather than blocking the matrix.

## Verification

The work is done when: `process()` pushes a frame on every variant without throwing; two
sequential `loadNFTMarker` calls yield ids `0` and `1` with both markers detectable; the suite runs
green locally and in CI without an apt-installed browser; and Codecov reports a non-trivial `src/`
figure.
