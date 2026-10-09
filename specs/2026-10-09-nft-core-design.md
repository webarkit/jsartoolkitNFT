# ARToolKitNFT_core: one NFT engine for the JS, threaded and native bindings

**Date:** 2026-10-09
**Issue:** #683
**Status:** design approved in discussion; this document is the written spec

## Summary

Extract the NFT tracking logic that is duplicated in `emscripten/ARToolKitNFT_js.cpp` and
`emscripten/ARToolKitNFT_js_td.cpp` into a pure C++ core, `ARToolKitNFTCore`, that lives in
WebARKitLib next to the NFT helpers moved there by WebARKitLib#76 / #687. The two Emscripten
classes become thin Embind adapters over the core. Native C++ consumers such as WebAR-Canvas
link the core directly, with no Embind, no `emscripten::val` and no RTTI requirement.

The refactor **does not change behaviour**. Differences between the two builds that come from
threading become configuration of the core; differences that are drift are preserved and fixed
in later, separate PRs. An equivalence comparison between the current and the new WASM is the
proof.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | The first version serves the single-thread Embind build, the threaded Embind build and WebAR-Canvas. The core lives in WebARKitLib. | Building the core here and moving it later would do the work twice. The Python binding moves onto the core later, in its own issue. |
| D2 | The refactor preserves behaviour exactly, including drift. | Equivalence then has a yes/no answer. With convergence mixed in, a pose difference could be the intended fix or a refactor bug. |
| D3 | The core is NFT only. The `ARHandle` part (threshold, threshold mode, debug mode, image processing mode, `getProcessingImage`) stays in the Embind adapters until #659 deprecates it. | Those methods have no effect on NFT: `arhandle` is created but never used for detection. They should not become public API of WebARKitLib. |
| D4 | Threading differences are handled by a pluggable detector (strategy) plus a configuration struct, not by `#ifdef`s inside the core's methods. | Separates *when* to search (shared policy) from *how* (the only real difference). Both variants build and test in one native binary, and a native consumer chooses at runtime. |
| D5 | The core logs through `WebARKit/include/WebARKitLog.h` (`WEBARKIT_LOG*`), not `include/WebARKit/WebARKitLog.h` (`webarkitLOG*`). | The latter includes `<emscripten.h>` unconditionally. The former is the native ARUtil-style logger. |
| D6 | The one deliberate behaviour change: the threaded build's `exit(-1)` when the KPM worker cannot start becomes an error return. | A library must not terminate its host application. The path is not reached in practice, and the code after it already handles the failure. |

## Current state, measured

`ARToolKitNFT_js.cpp` (654 lines) and `ARToolKitNFT_js_td.cpp` (693 lines), with their headers
(148 and 159 lines), are near copies. `python-bindings/ARToolKitNFT_py.cpp` (631 lines) is a
third, older copy: it still tracks one marker through a scalar `detectedPage` and has no
`NFTMarkerState` and no incremental loading. It is out of scope here (D1).

The two Emscripten copies differ in these places. The first group is threading; the second is
drift.

**Threading differences** (become configuration, D4):

| | `_js` | `_js_td` |
|---|---|---|
| KPM search | `kpmMatching()` on the calling thread, results applied in the same frame | `trackingInitStart()` on a worker; results collected on a later frame |
| AR2 handle | `ar2CreateHandleMod(paramLT, pixFormat)` / `ar2DeleteHandleMod` | `ar2CreateHandle(paramLT, pixFormat, AR2_TRACKING_DEFAULT_THREAD_NUM)` / `ar2DeleteHandle` |
| AR2 tracking | `ar2TrackingMod()` | `ar2Tracking()` |
| AR2 settings | fixed: tracking thresh 5.0, sim thresh 0.50, search feature num 16, search size 6, template size 6 / 6 | same, except search size 12 when `threadGetCPU() > 1` |
| default detection interval | 300 ms | 0 ms |

**Drift** (preserved by D2):

| | `_js` | `_js_td` |
|---|---|---|
| pose filtering | per marker, `arFilterTransMat` in `trackMarkers()` | none: `setFiltering` has no effect. The threaded build has never filtered: before #658 its filter code sat in a commented-out block under `#if WITH_FILTERING`, which #658 removed. |
| `getProcessingImage` null check | yes | no (adapter code, D3) |
| luma buffer size | `width * height` | `videoFrameSize / 4` (equal for the fixed RGBA format) |

Two more facts the design depends on:

- The default constructor leaves `withFiltering` uninitialized, and the filter parameters
  (cutoff 60.0, sample rate 120.0) are only set by `ARToolKitNFT(true)`. Every reachable JS path
  is defined: the single-thread builds construct with `true`, and the threaded build never
  filters. The core initializes them always (see *Configuration*), so nothing observable
  changes.
- The NFT code throws no exceptions; errors are return codes.

## Architecture

```
WebARKitLib  WebARKit/WebARKitTrackers/WebARKitNFT/   (CMake target WebARKitNFT)
  ARToolKitNFTCore            camera, markers, frame buffers, per-marker state,
                              AR2 tracking, detection policy
  NFTDetector                 interface: how one KPM search runs
    SyncKpmDetector           kpmMatching on the calling thread       (always built)
    ThreadedKpmDetector       trackingSub worker                      (WEBARKIT_NFT_THREADS)
  NFTTrackingConfig           AR2 variant and settings, default interval, filtering support
  KpmRefDataSetCopy.h         moved from jsartoolkitNFT/emscripten
  NFTMarkerState.h            already here

jsartoolkitNFT  emscripten/
  ARToolKitNFT_js(.h/.cpp)     Embind adapter: owns an ARToolKitNFTCore (single-thread preset)
  ARToolKitNFT_js_td(.h/.cpp)  Embind adapter: owns an ARToolKitNFTCore (threaded preset)
  ARToolKitNFT_js_bindings.cpp unchanged
```

### ARToolKitNFTCore

Public API, all native types:

- Construction: `ARToolKitNFTCore(const NFTTrackingConfig &config, bool withFiltering = false)`.
  Not copyable. The destructor calls `teardown()`.
- Camera: `loadCamera(path)`, `setCamera(id, cameraID)`, `setup(width, height, cameraID)`,
  `setProjectionNearPlane` / `Far` and getters, `recalculateCameraLens()`,
  `const ARdouble *cameraLens()` (16 values), and read-only `const ARParam &cameraParam()` and
  `ARParamLT *cameraParamLT()` for the adapters' `ARHandle` (see *Embind adapters*).
- Markers: `std::vector<int> addNFTMarkers(const std::vector<std::string> &paths)`,
  `decompressZFT(path, tempPath)`, `getNFTData(index)` returning the existing `nftMarker`
  struct, `markerCount()`.
- Frame: `setVideoFrame(const ARUint8 *rgba, const ARUint8 *luma)`. The core copies both, as
  `passVideoData` does today. A null pointer leaves that buffer unchanged, as today.
- Per frame: `int detectNFTMarker()`, which detects (per policy) and then tracks every marker.
  Its return value is unchanged for both variants.
- Results: `const NFTMarkerState *markerState(int index)`, `nullptr` when out of range.
- Policy: `setFiltering(bool)`, `setContinuousDetection(bool)`, `setDetectionInterval(double ms)`.
- `teardown()`.

The core does not use Embind or `emscripten::val`, is C++14 (the standard WebARKitLib's CMake
sets), and compiles with `-fno-rtti` and with `-fno-exceptions`. `<emscripten.h>` appears only in the core's clock source (`NFTClock.cpp`),
under `#ifdef __EMSCRIPTEN__`, for the default clock (`emscripten_get_now()`). Its public header
includes no log header (see *Logging*).

What today's binding header defines at file scope moves with the code that uses it:
`PAGES_MAX` and the `nftMarker` struct go to the core's public header (the adapters and
`ARToolKitNFT_js_bindings.cpp` keep using them under the same names). The camera registry
(`cameraParams`, `gCameraID`), which `loadCamera` fills and `setCamera` reads, becomes internal
to the core's `.cpp` with the same process-wide semantics: an id from `loadCamera` stays valid
for any controller. `gARControllerID` follows `setup()` into the core.

### NFTDetector

```cpp
struct NFTDetection { int page; float trans[3][4]; };

class NFTDetector {
public:
  virtual ~NFTDetector() = default;
  // Has a search finished since the last call? If so, fill `out`, set resultNum, return true.
  virtual bool collect(std::vector<NFTDetection> &out, int &resultNum) = 0;
  virtual bool idle() const = 0;
  // Start a search. Returns true if it has already finished (sync): collect it at once.
  virtual bool start(ARUint8 *luma, const int *skipPages, int skipNum) = 0;
  // Wait for a running search and drop its result (before kpmSetRefDataSet, and in teardown).
  virtual void waitIdle() = 0;
};
```

- `SyncKpmDetector`: `start()` sets the skip pages, runs `kpmMatching()` and `kpmGetResult()`,
  keeps the results with `camPoseF == 0`, and returns `true`. `resultNum` is `kpmGetResult`'s
  count, as `_js` returns today.
- `ThreadedKpmDetector`: wraps `trackingInitInit` / `trackingInitStart` /
  `trackingInitGetResults` / `trackingInitQuit`. A failed search counts as finished with no
  results, as today. `resultNum` is the collected count, as `_js_td` returns today. Creation
  failure is reported to the core, not `exit(-1)` (D6).

### Per-frame flow

The two builds order detection differently today, and the flow keeps both orders without
branching on the detector type:

1. `collect()`. If a search finished: `lastKpmEndMs = now()`, then apply each detection
   (page in range, not already tracking: `ar2SetInitTrans`, mark tracking, reset its filter).
2. If `idle()`, at least one marker is loaded and untracked, and detection is due: build the
   skip list from tracked pages and `start()`. If it returns `true`, collect and apply at once as
   in step 1.
3. `trackMarkers()`.

"Due" is unchanged: always while nothing is tracked; otherwise only with continuous detection
on and at least `detectionIntervalMs` since `lastKpmEndMs`.

For the threaded build this is today's order: collecting first means pages detected by the
previous search already count as tracked when deciding whether to start a new one. For the
single-thread build step 1 never collects (a sync search is never pending between frames), so
the flow reduces to today's "decide, search, apply, track".

### Configuration

```cpp
struct NFTTrackingConfig {
  enum class Detector { Sync, Threaded };            // which NFTDetector the core creates
  Detector detector;
  enum class AR2Variant { SingleThread, Threaded };  // ar2*Mod vs ar2* with AR2 threads
  AR2Variant ar2Variant;
  bool cpuDependentSearchSize;   // search size 12 instead of 6 when threadGetCPU() > 1
  double defaultDetectionIntervalMs;
  bool poseFilteringSupported;   // false reproduces today's threaded build (D2)
  double (*clock)();             // milliseconds; emscripten_get_now / steady_clock by default
};
```

Two presets reproduce today's builds exactly: `singleThreadPreset()` (Sync detector,
SingleThread AR2, fixed settings, 300 ms, filtering supported) and `threadedPreset()` (Threaded
detector, Threaded AR2, CPU-dependent search size, 0 ms, filtering not supported). The core
creates the detector in one place; `Detector::Threaded` in a build without
`WEBARKIT_NFT_THREADS` is reported as an error (`addNFTMarkers` returns an empty vector), not a
link failure.

The core references both AR2 variants, so every build that compiles it also compiles
`trackingMod.c` and `trackingMod2d.c` (today the threaded build does not), and the threaded
detector moves the `PAGES_MAX == TRACKING_INIT_MAX_RESULTS` `static_assert` with it. The clock is injectable so tests can drive the detection
interval deterministically.

`withFiltering` defaults to `false`, and the filter parameters are always cutoff 60.0 and
sample rate 120.0. With `poseFilteringSupported == false` the core never filters, whatever
`setFiltering` says.

### Logging

The core's `.cpp` files include `WebARKit/include/WebARKitLog.h` (as `<WebARKitLog.h>`) and log
with `WEBARKIT_LOG*`. The two `WebARKitLog.h` headers share the include guard `WEBARKIT_LOG_H`,
so a translation unit that included both would get only the first, and code using the other
logger would fail to compile. The core's public headers include neither; the adapters keep including `<WebARKit/WebARKitLog.h>`. The two
loggers define different symbols (`webarkitLog` vs the `webarkitLOGi(const std::string&)`
overloads), so they link together.

`WebARKit/WebARKitLog.cpp` is added to the `WebARKitNFT` CMake target and to `tools/makem.js`.
The adapters' `setLogLevel` sets both `arLogLevel` and `webarkitLogLevel`, so one call still
controls all NFT logging. Only the text of some log lines changes.

### Embind adapters

`ARToolKitNFT_js` and `ARToolKitNFT_js_td` keep their class name, methods, signatures and
return values. Each owns an `ARToolKitNFTCore` with its preset and keeps only what is JS:

- `getNFTMarkerInfo` and `getCameraLens`, building `emscripten::val` from the core's data
  (`MARKER_INDEX_OUT_OF_BOUNDS` when `markerState` is `nullptr`; the zero pose stays a
  `typed_memory_view`);
- `passVideoData`, taking JS heap pointers and doing the internal SIMD luma conversion
  (`WebARKitVideoLuma`), then `setVideoFrame`;
- `setLogLevel` / `getLogLevel`;
- the `ARHandle` part (D3): `arhandle`, `ar3DHandle` and the threshold, debug and image
  processing methods.

`setCamera` today does two things. The NFT part (load `param`, resize it, create `paramLT`,
compute `cameraLens`) moves to the core: KPM and AR2 are created from `paramLT`. The `ARHandle`
part (`arCreateHandle(paramLT)`, `arSetPixelFormat`, `ar3DCreateHandle(&param)`) stays in the
adapter. `ARHandle` consumes `paramLT`; nothing in the NFT path reads `arhandle` or
`ar3DHandle`, and no KPM, AR2 or WebARKitNFT source refers to `ARHandle`. Their only other use is
`getProcessingImage` (for `debugSetup()` in the TS controllers), which returns
`labelInfo.bwImage`; only `arDetectMarker`'s labeling writes it, and the NFT path never calls
it. Whether to remove `ARHandle` stays with #659.

Because `arhandle` keeps a pointer to the core's `paramLT`, the adapter orders the two:

- `setCamera`: delete its `arhandle` / `ar3DHandle`, call the core's `setCamera`, then create
  them again from `cameraParamLT()` and `cameraParam()`. An `arCreateHandle` or
  `ar3DCreateHandle` failure still makes `setCamera` return `-1`, as today.
- `teardown` and destruction: delete `arhandle` / `ar3DHandle` before the core's `teardown()`
  frees `paramLT`.

`ARToolKitNFT_js_bindings.cpp` is unchanged, so `src/*.ts`, `types/`, the examples and the
workers in `js/` are unchanged.

## Errors, lifecycle, threads

- **Errors** keep today's return codes: `-1` for failures, an empty vector from
  `addNFTMarkers`, `1` / `-1` from `decompressZFT`. The core throws nothing itself. The one
  standard-library call that can throw stays as it is: `getNFTData` uses `std::vector::at`, and
  an out-of-range index aborts, as it does today under Emscripten (exceptions are not caught)
  and as it does natively with `-fno-exceptions`.
- **Ownership:** the core owns `paramLT`, `kpmHandle`, `ar2Handle`, the surface sets, the
  accumulated reference data set (`refDataSetAll`) and the detector
  (`std::unique_ptr<NFTDetector>`). The detector is created by the first `addNFTMarkers`, which
  is when a KPM handle exists, as `_js_td` does today.
- **Teardown order:** `waitIdle()` and destroy the detector, then free the KPM handle the worker
  uses, then the rest.
- **Threads:** the core is not thread-safe and is driven from one thread, as today. The only
  concurrency is the KPM worker, which uses `kpmHandle` during a search. The core never changes
  the KPM handle while a search runs: before `kpmSetRefDataSet` and before setting skip pages
  the detector is idle, or the core calls `waitIdle()` and drops the stale result.

## Integration and PR sequence

The route is the one #687 used (WebARKitLib#76 on `dev`, release on `master`, submodule bump).

1. **WebARKitLib PR on `dev`: the core.** Core, detectors, configuration,
   `KpmRefDataSetCopy.h`, `WebARKitLog.cpp` in the target, gtest tests. Small commits, one per
   component.
2. **jsartoolkitNFT draft PR on `dev`, in parallel.** Submodule temporarily at the WebARKitLib
   PR's commit; thin adapters; `tools/makem.js` adds the core, the detectors (the threaded build
   adds the threaded detector) and the native logger; `build/` and `dist/` rebuilt; equivalence
   run. A problem the comparison finds in the core is fixed in the WebARKitLib PR before it is
   released.
3. **WebARKitLib release 0.11.0** from `dev` to `master`, once both PRs are green.
4. **jsartoolkitNFT PR completed:** submodule moved to the release commit on `master`, rebuilt,
   verified again, marked ready.

Between steps 1 and 4 WebARKitLib's `dev` carries the core without a consumer here. It
replaces nothing inside WebARKitLib, as with #75 / #76.

## Testing and verification

### Equivalence (the proof for D2)

`tools/compare-builds.js` loads two builds (the current one from git, the new one from the
working tree), feeds both the same frames, and compares per frame the return value of
`detectNFTMarker()` and, per marker, `found`, `error` and the 12 pose values.

- **Frames** are built from `examples/node/pinball-demo.jpg`, as `tests/node/multi-marker.test.js`
  does: both markers; pinball alone (kuva painted over); blank frames (tracking lost); both again
  (re-detection). Run with filtering on and off, and with continuous detection on and off.
- **Time:** the 300 ms default depends on the wall clock, so runs use an interval of 0 or
  60 000 ms, as the multi-marker test does. The result then does not depend on machine speed.
- **Single-thread builds** (Node, ES6, SIMD): bit-identical results. WASM does not reorder
  floating-point operations and has no FMA, so the same operations in the same order give the
  same values. A difference is investigated before any tolerance is considered.
- **Threaded build:** the frame on which a worker result arrives depends on timing, and varies
  between two runs of the *current* build. First measure that by running the current build
  twice. The criterion is then: the same markers found, and the same pose once tracking has
  settled on static frames.
- **Where:** the Node build in Node; ES6, SIMD and threaded in a cross-origin isolated page
  served by `python-server.py`.

The script is committed as a development tool, outside CI. The pose-filtering PR for the
threaded build reuses it: it must show differences in the threaded build only.

### Native tests in WebARKitLib (gtest, its CI)

- Detection and tracking of pinball on `tests/pinball.jpg` with `SyncKpmDetector` and with
  `ThreadedKpmDetector` (the test build enables `WEBARKIT_NFT_THREADS`; natively `trackingSub`
  uses ARUtil's pthreads).
- Detection policy with a fake clock: interval, continuous detection, skipped pages.
- Incremental loading (`addNFTMarkers` over several calls), and teardown with a search running.
- One test target compiled with `-fno-rtti -fno-exceptions`, so the constraint is enforced.

### jsartoolkitNFT

- Vitest and the Node tests pass **with no change to the tests**.
- Real examples, as `CLAUDE.md` asks: `examples/node/example_dist.js`, and the browser examples
  with a webcam, especially the threaded one.
- The Python bindings' CI stays green. They do not use the core but compile sources from the
  same WebARKitLib folder.

## Out of scope, follow-ups

- #692: pose filtering in the threaded build, its own PR, verified with
  `tools/compare-builds.js`.
- #693: port the Python binding onto the core, which removes the third copy and brings it
  multi-marker support.
- webarkit/WebARKitLib#84: the two `WebARKitLog.h` headers sharing `WEBARKIT_LOG_H` (see
  *Logging*).
- WebAR-Canvas adopting the core: in that repository.
- #659: deprecating the `ARHandle` methods, independent of this work. The threaded binding's
  `getProcessingImage` null check (drift, adapter code) and `debugSetup()` as a caller are
  recorded there.
- `ARToolKitJS.cpp` (the legacy API) is not touched.

## Risks

- **Bit-identical single-thread output is an expectation, not a guarantee.** If the comparison
  shows differences, the likeliest causes are a changed operation order in the refactor or a
  different AR2 variant reaching a build by mistake. Either is a bug to fix, not a tolerance to
  add.
- **Header clash.** Because of the shared `WEBARKIT_LOG_H` guard, a log header included from a
  core public header would hide the adapters' logger. This fails at compile time, not silently:
  the adapters' `webarkitLOG*` calls become undeclared. The rule in *Logging* avoids it. If the
  guard is ever renamed in WebARKitLib, that is a separate change.
