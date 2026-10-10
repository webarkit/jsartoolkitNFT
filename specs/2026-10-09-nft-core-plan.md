# ARToolKitNFT_core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the NFT logic duplicated in `ARToolKitNFT_js.cpp` and `ARToolKitNFT_js_td.cpp` into a pure C++ `ARToolKitNFTCore` in WebARKitLib, and turn both Emscripten classes into thin Embind adapters, with no change in behaviour.

**Architecture:** Part A builds the core in WebARKitLib's `WebARKitNFT` CMake target: a config struct with two presets, a pluggable `NFTDetector` (sync / threaded), and the core itself, tested natively with gtest. Part B first builds an equivalence tool against the current WASM, then rewrites the two adapters over the core and proves the new builds behave the same.

**Tech Stack:** C++14, ARToolKit5 (AR, AR2, KPM, ARUtil) from WebARKitLib, CMake + GoogleTest (native, Linux), Emscripten 4.0.17 + Embind, webpack, Node 24, vitest, sharp.

**Spec:** `specs/2026-10-09-nft-core-design.md` (decisions D1–D6 referenced below).

## Global Constraints

- Behaviour preserved exactly (D2), including drift. The only deliberate change is `exit(-1)` → error return (D6).
- The core is C++14, does not use Embind or `emscripten::val`, compiles with `-fno-rtti -fno-exceptions`; `<emscripten.h>` only in `NFTClock.cpp` (the default clock) under `#ifdef __EMSCRIPTEN__`.
- The core's public headers include no `WebARKitLog.h`; core `.cpp` files include `<WebARKitLog.h>` (the native `WebARKit/include/WebARKitLog.h`) and log with `WEBARKIT_LOG*`.
- `ARToolKitNFT_js_bindings.cpp`, `src/**/*.ts`, `types/`, `js/` and `examples/` are not modified.
- jsartoolkitNFT PRs target `dev`; Conventional Commits with types `feat|fix|perf|doc|refactor|test|style|chore`; never write `fix`/`closes` next to an issue number unless it closes it (use "refs #683"). WebARKitLib PRs target its `dev`.
- `build/` and `dist/` are committed: any change under `emscripten/` or `tools/makem.js` is followed by a rebuild in `emscripten/emsdk:4.0.17` and a commit of the artifacts on the same branch.
- Commit with plain `git commit` (the repo's identity); end messages with the `Co-Authored-By` line.
- Preset values (from the spec): single-thread = Sync detector, `ar2CreateHandleMod`/`ar2TrackingMod`/`ar2DeleteHandleMod`, tracking thresh 5.0, sim thresh 0.50, search feature num 16, search size 6, template size 6/6, interval 300 ms, filtering supported. Threaded = Threaded detector, `ar2CreateHandle(paramLT, pixFormat, AR2_TRACKING_DEFAULT_THREAD_NUM)`/`ar2Tracking`/`ar2DeleteHandle`, same settings but search size 12 when `threadGetCPU() > 1`, interval 0 ms, filtering not supported. Filter: cutoff 60.0, sample rate 120.0, `withFiltering` default `false`.

## Review Focus

1. `addNFTMarkers` while a threaded search is running: the search is awaited, its result dropped, and the next frame searches the new set (test in Task A5).
2. `setCamera` called a second time: the core frees and recreates `paramLT`, KPM and AR2 handles, and the adapter recreates `arhandle` from the new `paramLT` without touching the freed one (tests in Tasks A4 and B3).
3. `detectNFTMarker()` before any marker is loaded, or before any frame is passed: returns `-1`, tracks nothing, does not crash (test in Task A5).
4. Marker index out of range (`-1`, `markerCount()`): `markerState` returns `nullptr`; the adapter returns `-3` (`MARKER_INDEX_OUT_OF_BOUNDS`) (tests in Tasks A4 and B3).
5. `teardown()` with a threaded search running, then destruction: no use of the freed KPM handle (test in Task A5).

---

## File structure

**WebARKitLib** (`WebARKit/WebARKitTrackers/WebARKitNFT/`, headers under `include/WebARKitTrackers/WebARKitNFT/`):

| File | Responsibility |
|---|---|
| `include/.../NFTTrackingConfig.h` | `NFTTrackingConfig`, `singleThreadPreset()`, `threadedPreset()` |
| `NFTClock.cpp` | `nftDefaultClockMs()`: the only `<emscripten.h>` include |
| `include/.../NFTDetector.h` | `NFTDetection`, `NFTDetector` interface |
| `include/.../SyncKpmDetector.h`, `SyncKpmDetector.cpp` | KPM on the calling thread |
| `include/.../ThreadedKpmDetector.h`, `ThreadedKpmDetector.cpp` | KPM on the `trackingSub` worker (only with `WEBARKIT_NFT_THREADS`) |
| `include/.../ARToolKitNFTCore.h`, `ARToolKitNFTCore.cpp` | the core: `PAGES_MAX`, `nftMarker`, camera registry, markers, frame, policy, tracking |
| `include/.../KpmRefDataSetCopy.h` | moved unchanged from `jsartoolkitNFT/emscripten/` |
| `CMakeLists.txt` | add the new sources, `WebARKit/WebARKitLog.cpp`, `-fno-rtti -fno-exceptions` on core sources |
| `tests/webarkit_nft_core_test.cc`, `tests/data/*` | native tests and their data |

**jsartoolkitNFT:**

| File | Responsibility |
|---|---|
| `tools/compare-builds.js`, `tools/compare-builds/scenarios.js`, `tools/compare-builds/index.html` | equivalence tool (Node and browser) |
| `emscripten/ARToolKitNFT_js.h/.cpp` | single-thread Embind adapter |
| `emscripten/ARToolKitNFT_js_td.h/.cpp` | threaded Embind adapter |
| `emscripten/KpmRefDataSetCopy.h` | deleted (moved) |
| `tools/makem.js` | new sources in `MAIN_SOURCES_IMPROVED_ES6` and `MAIN_SOURCES_TD_ES6` |

---

## Part A — WebARKitLib

Work in a WebARKitLib clone or worktree on a branch `feat/nft-core` from `origin/dev`. Native build and tests run in Linux, as CI does. From the WebARKitLib root:

```bash
docker run --rm -v "$PWD:/src" -w /src/tests ubuntu:24.04 bash -c "apt-get update -qq && apt-get install -y -qq build-essential cmake git libjpeg-dev zlib1g-dev >/dev/null && cmake -S . -B build -DEMSCRIPTEN_COMP=0 >/dev/null && cmake --build build -j --target webarkit_nft_core_test && cd build && ./webarkit_nft_core_test"
```

This is referred to below as **RUN-NATIVE** (append `--gtest_filter=<Suite>.<Name>` to run one test).

### Task A1: Configuration, presets, logger and data

**Files:**
- Create: `WebARKit/WebARKitTrackers/WebARKitNFT/include/WebARKitTrackers/WebARKitNFT/NFTTrackingConfig.h`
- Create: `WebARKit/WebARKitTrackers/WebARKitNFT/include/WebARKitTrackers/WebARKitNFT/KpmRefDataSetCopy.h` (copy of `jsartoolkitNFT/emscripten/KpmRefDataSetCopy.h`, unchanged)
- Modify: `WebARKit/WebARKitTrackers/WebARKitNFT/CMakeLists.txt` (add `${WEBARKITLIB_ROOT}/WebARKit/WebARKitLog.cpp` to the target; add `${WEBARKITLIB_ROOT}/WebARKit/include` to its PUBLIC include directories)
- Create: `tests/webarkit_nft_core_test.cc`; `tests/data/` with `pinball.{fset,iset,fset3}`, `kuva.{fset,iset,fset3}`, `camera_para.dat`, `pinball-demo.jpg` (copied from jsartoolkitNFT `examples/DataNFT/`, `examples/Data/`, `examples/node/`)
- Modify: `tests/CMakeLists.txt` (target `webarkit_nft_core_test`, linking `WebARKitNFT GTest::gtest_main`, `WEBARKIT_NFT_THREADS` defined, `gtest_discover_tests`, a post-build copy of `tests/data` next to the binary)

**Interfaces:**
- Produces:
  ```cpp
  struct NFTTrackingConfig {
    enum class Detector { Sync, Threaded };
    enum class AR2Variant { SingleThread, Threaded };
    Detector detector;
    AR2Variant ar2Variant;
    bool cpuDependentSearchSize;
    double defaultDetectionIntervalMs;
    bool poseFilteringSupported;
    double (*clock)();  // milliseconds
  };
  double nftDefaultClockMs();            // declared here, defined in NFTClock.cpp
  NFTTrackingConfig singleThreadPreset(); // inline
  NFTTrackingConfig threadedPreset();     // inline
  ```
  `KpmRefDataSet *kpmCopyRefDataSet(const KpmRefDataSet *src)` at its new include path `<WebARKitTrackers/WebARKitNFT/KpmRefDataSetCopy.h>`.

- [ ] **Step 1: Write the failing tests** in `tests/webarkit_nft_core_test.cc`:
  - `NFTTrackingConfigTest.SingleThreadPresetMatchesTheSingleThreadBinding`: `detector == Sync`, `ar2Variant == SingleThread`, `cpuDependentSearchSize == false`, `defaultDetectionIntervalMs == 300.0`, `poseFilteringSupported == true`, `clock == &nftDefaultClockMs`.
  - `NFTTrackingConfigTest.ThreadedPresetMatchesTheThreadedBinding`: `Threaded`, `Threaded`, `true`, `0.0`, `false`, `&nftDefaultClockMs`.
  - `NFTTrackingConfigTest.LoggerIsNative`: `WEBARKIT_LOGi("core logger test")` compiles and runs (include `<WebARKitLog.h>` in the test).
- [ ] **Step 2: RUN-NATIVE** — Expected: build failure, `NFTTrackingConfig.h` not found.
- [ ] **Step 3: Implement** `NFTTrackingConfig.h` (presets inline) and `NFTClock.cpp` defining `nftDefaultClockMs()`: `emscripten_get_now()` under `#ifdef __EMSCRIPTEN__`, otherwise `std::chrono::steady_clock` converted to milliseconds as `double`. Add `NFTClock.cpp` to the target.
- [ ] **Step 4: RUN-NATIVE** — Expected: the three tests PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add WebARKit/WebARKitTrackers/WebARKitNFT tests
  git commit -m "feat(nft): add the NFT tracking config, its presets and the native logger"
  ```

### Task A2: NFTDetector and SyncKpmDetector

**Files:**
- Create: `include/.../NFTDetector.h`, `include/.../SyncKpmDetector.h`, `SyncKpmDetector.cpp`
- Modify: `CMakeLists.txt` (add `SyncKpmDetector.cpp`), `tests/webarkit_nft_core_test.cc`

**Interfaces:**
- Consumes: none from A1 beyond the target.
- Produces:
  ```cpp
  struct NFTDetection { int page; float trans[3][4]; };
  class NFTDetector {
   public:
    virtual ~NFTDetector() = default;
    virtual bool collect(std::vector<NFTDetection> &out, int &resultNum) = 0;
    virtual bool idle() const = 0;
    virtual bool start(ARUint8 *luma, const int *skipPages, int skipNum) = 0;
    virtual void waitIdle() = 0;
  };
  class SyncKpmDetector final : public NFTDetector {
   public:
    explicit SyncKpmDetector(KpmHandle *kpmHandle);  // not owned
    // overrides as above
  };
  ```

- [ ] **Step 1: Write the failing tests.** A test helper `loadPinballKpm(width, height)` builds a `KpmHandle` the way `ARToolKitNFTCore::addNFTMarkers` does (`arParamLoad("data/camera_para.dat")`, `arParamChangeSize` to the frame size, `arParamLTCreate`, `kpmCreateHandle`, `kpmLoadRefDataSet("data/pinball.fset3", "fset3", …)`, `kpmChangePageNoOfRefDataSet(…, KpmChangePageNoAllPages, 0)`, `kpmSetRefDataSet`), and `loadLuma("data/pinball-demo.jpg")` converts `ar2ReadJpegImage` RGB to luma with `(77*R + 150*G + 29*B) >> 8`.
  - `SyncKpmDetectorTest.FindsPinballInTheSameCall`: `start(luma, nullptr, 0)` returns `true`; `idle()` is `true`; `collect(out, n)` returns `true`, `n >= 1`, `out` contains page `0`; a second `collect` returns `false`.
  - `SyncKpmDetectorTest.SkippedPageIsNotReported`: with `skipPages = {0}`, `collect` returns `true` and `out` has no page `0`.
  - `SyncKpmDetectorTest.BlankFrameFindsNothing`: an all-zero luma gives `collect` `true` with `out` empty.
- [ ] **Step 2: RUN-NATIVE** — Expected: build failure, `SyncKpmDetector.h` not found.
- [ ] **Step 3: Implement** `SyncKpmDetector` from `ARToolKitNFT_js.cpp:124-173` (`detectNFTMarker`): skip pages via `kpmSetMatchingSkipPage` when `skipNum > 0`, `kpmMatching`, `kpmGetResult`, keep entries with `camPoseF == 0` as `{pageNo, camPose}`; `resultNum` = `kpmGetResult`'s count. `start` stores the results for the next `collect` and returns `true`; `idle()` is always `true`; `waitIdle()` does nothing.
- [ ] **Step 4: RUN-NATIVE** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(nft): add the NFTDetector interface and the sync KPM detector`

### Task A3: ThreadedKpmDetector

**Files:**
- Create: `include/.../ThreadedKpmDetector.h`, `ThreadedKpmDetector.cpp`
- Modify: `CMakeLists.txt` (add `ThreadedKpmDetector.cpp` inside `if(WEBARKIT_NFT_THREADS)`), `include/.../trackingSub.h` (comment on `TRACKING_INIT_MAX_RESULTS`: "Must equal PAGES_MAX in ARToolKitNFTCore.h"), tests

**Interfaces:**
- Consumes: `NFTDetector`, `NFTDetection` (A2).
- Produces:
  ```cpp
  class ThreadedKpmDetector final : public NFTDetector {
   public:
    // Returns nullptr if the worker cannot start (D6: no exit()).
    static std::unique_ptr<ThreadedKpmDetector> create(KpmHandle *kpmHandle);
    ~ThreadedKpmDetector() override;  // waitIdle(), then trackingInitQuit
    // overrides
  };
  ```

- [ ] **Step 1: Write the failing tests** (reuse A2's helpers):
  - `ThreadedKpmDetectorTest.FindsPinballOnALaterCollect`: `start(luma, nullptr, 0)` returns `false`; `idle()` is `false`; poll `collect` (sleep 10 ms between polls, at most 10 s) until it returns `true`; `out` contains page `0`; `idle()` is now `true`.
  - `ThreadedKpmDetectorTest.WaitIdleDropsTheRunningSearch`: `start`, then `waitIdle()`; `idle()` is `true` and the next `collect` returns `false`.
  - `ThreadedKpmDetectorTest.DestroyWhileSearching`: `start`, then destroy the detector, then `kpmDeleteHandle`; no crash (run under the test binary; a crash fails the suite).
- [ ] **Step 2: RUN-NATIVE** — Expected: build failure.
- [ ] **Step 3: Implement** from `ARToolKitNFT_js_td.cpp` (`trackingInit`, the collect block and the start in `detectNFTMarker`, and the worker shutdown in `teardown`): skip pages are set with `kpmSetMatchingSkipPage` before `trackingInitStart`; `collect` calls `trackingInitGetResults(handle, results, PAGES_MAX, &n)` — `0` → `false`; `1` → copy `{page, trans}`, `resultNum = n`, `true`; `-1` → `out` empty, `resultNum = -1`, `true` (finished with no results). `waitIdle` uses `threadEndWait` when a search is running. Move the `static_assert(PAGES_MAX == TRACKING_INIT_MAX_RESULTS, …)` here (until A4 defines `PAGES_MAX`, use `TRACKING_INIT_MAX_RESULTS` for the buffer and add the assert in A4).
- [ ] **Step 4: RUN-NATIVE** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(nft): add the threaded KPM detector`

### Task A4: ARToolKitNFTCore — camera and markers

**Files:**
- Create: `include/.../ARToolKitNFTCore.h`, `ARToolKitNFTCore.cpp`
- Modify: `CMakeLists.txt` (add `ARToolKitNFTCore.cpp`; `set_source_files_properties` on `ARToolKitNFTCore.cpp`, `SyncKpmDetector.cpp`, `ThreadedKpmDetector.cpp` with `COMPILE_OPTIONS "-fno-rtti;-fno-exceptions"`), `ThreadedKpmDetector.cpp` (add the `static_assert`), tests

**Interfaces:**
- Consumes: `NFTTrackingConfig`, presets (A1); `NFTDetector`, `SyncKpmDetector` (A2); `ThreadedKpmDetector::create` (A3); `NFTMarkerState` (existing).
- Produces (public API of `ARToolKitNFTCore`; `PAGES_MAX = 20` and `struct nftMarker { int id_NFT, width_NFT, height_NFT, dpi_NFT; }` in the same header):
  ```cpp
  explicit ARToolKitNFTCore(const NFTTrackingConfig &config, bool withFiltering = false);
  ~ARToolKitNFTCore();  // teardown()
  static int loadCamera(const std::string &path);      // camera id, or -1
  int setup(int width, int height, int cameraID);       // controller id, or -1
  int setCamera(int id, int cameraID);                  // 0 or -1
  const ARdouble *cameraLens() const;                   // 16 values
  const ARParam &cameraParam() const;
  ARParamLT *cameraParamLT() const;
  void setProjectionNearPlane(ARdouble); ARdouble getProjectionNearPlane() const;
  void setProjectionFarPlane(ARdouble);  ARdouble getProjectionFarPlane() const;
  void recalculateCameraLens();
  std::vector<int> addNFTMarkers(const std::vector<std::string> &paths);  // {} on failure
  int decompressZFT(const std::string &path, const std::string &tempPath);
  nftMarker getNFTData(int index) const;                // std::vector::at
  int markerCount() const;
  const NFTMarkerState *markerState(int index) const;   // nullptr if out of range
  int teardown();
  ```
  Copying and assignment are deleted.

- [ ] **Step 1: Write the failing tests:**
  - `CoreCameraTest.LoadSetupAndLens`: `loadCamera("data/camera_para.dat") >= 0`; `setup(2000, 1500, id) >= 0`; `cameraParam().xsize == 2000`; `cameraParamLT() != nullptr`; `cameraLens()` has at least one non-zero value.
  - `CoreCameraTest.UnknownCameraIdFails`: `setCamera(0, 9999) == -1`.
  - `CoreCameraTest.SetCameraTwice`: after `setup`, `setCamera(id, cameraID)` again returns `0` and `cameraParamLT()` is non-null; then `addNFTMarkers({"data/pinball"})` returns `{0}` (handles recreated).
  - `CoreMarkersTest.LoadsTwoMarkersInOneCall`: returns `{0, 1}`; `markerCount() == 2`; `getNFTData(0).width_NFT > 0`.
  - `CoreMarkersTest.LoadsMarkersIncrementally`: `{"data/pinball"}` → `{0}`, then `{"data/kuva"}` → `{1}`; `markerCount() == 2`.
  - `CoreMarkersTest.MissingMarkerReturnsEmpty`: `{"data/does-not-exist"}` → empty vector; `markerCount()` unchanged.
  - `CoreMarkersTest.MarkerStateOutOfRange`: `markerState(-1) == nullptr`, `markerState(markerCount()) == nullptr`, `markerState(0)->tracking == false`.
  - `CoreMarkersTest.ThreadedDetectorUnavailableIsAnError`: only when `WEBARKIT_NFT_THREADS` is **not** defined (guard the test with `#ifndef`): a core with `threadedPreset()` returns `{}` from `addNFTMarkers`.
- [ ] **Step 2: RUN-NATIVE** — Expected: build failure.
- [ ] **Step 3: Implement** by moving code from `jsartoolkitNFT/emscripten/ARToolKitNFT_js.cpp` (the reference for every shared method): constructor defaults (`nearPlane 0.0001`, `farPlane 1000.0`, filter 60.0/120.0, `detectionIntervalMs = config.defaultDetectionIntervalMs`), `loadCamera` and the camera registry (`cameraParams`, `gCameraID` as file-static), `setup` (`gARControllerID`, frame and luma buffers of `width * height * 4` and `width * height`), the NFT part of `setCamera` (param, resize, `paramLT`, lens; **no** `arCreateHandle` / `ar3DCreateHandle` — they stay in the adapters, D3), `setupAR2` choosing the AR2 calls and settings from `config` (values in Global Constraints), `createKpmHandle`, `addNFTMarkers` (with `refDataSetAll` and `kpmCopyRefDataSet`; create the detector on the first call: `SyncKpmDetector` or, under `#ifdef WEBARKIT_NFT_THREADS`, `ThreadedKpmDetector::create`, otherwise log and return `{}`; call `detector->waitIdle()` before `kpmSetRefDataSet`, and set `lastKpmEndMs = clock()` when that dropped a search, as `_js_td` does), `decompressZFT`, `getNFTData`, and `teardown` in the spec's order (detector first, then KPM handle, then AR2 handle, surface sets, `paramLT`, `refDataSetAll`, filters). Logging: `WEBARKIT_LOG*` with the same messages. Drop `getKpmImageWidth/Height` and `patt_id` (unbound and unused).
- [ ] **Step 4: RUN-NATIVE** — Expected: PASS, plus A1–A3 still PASS.
- [ ] **Step 5: Commit** — `feat(nft): add ARToolKitNFTCore with camera and marker loading`

### Task A5: ARToolKitNFTCore — frames, detection policy and tracking

**Files:**
- Modify: `include/.../ARToolKitNFTCore.h`, `ARToolKitNFTCore.cpp`, tests

**Interfaces:**
- Consumes: A4.
- Produces:
  ```cpp
  void setVideoFrame(const ARUint8 *rgba, const ARUint8 *luma);  // copies; null leaves the buffer
  int detectNFTMarker();     // detect per policy, then track; return value as today per variant
  void setFiltering(bool);
  void setContinuousDetection(bool);
  void setDetectionInterval(double ms);  // <= 0 or NaN → 0
  ```

- [ ] **Step 1: Write the failing tests.** Helper `FakeClock` (a file-static `double` returned by a plain function used as `config.clock`). Frames: `pinball-demo.jpg` as RGBA and luma at 2000 × 1500; a blank frame (zeros); `pinballOnly`, the same photo with the rectangle x ∈ [1096, 1705], y ∈ [380, 1165] (the kuva print's bounding box, from `tests/node/multi-marker.test.js`) filled with RGB (217, 212, 202), luma recomputed.
  - `CoreFrameTest.DetectBeforeMarkersReturnsMinusOne`: after `setup`, no markers: `detectNFTMarker() == -1`.
  - `CoreFrameTest.DetectBeforeAnyFrame`: markers loaded, no `setVideoFrame`: `detectNFTMarker()` does not crash and `markerState(0)->tracking == false`.
  - `CoreTrackingTest.SyncFindsBothMarkers` (single-thread preset): after at most 60 frames of `pinball-demo`, `markerState(0)->tracking` and `markerState(1)->tracking`; `markerState(0)->pose[0][3] < markerState(1)->pose[0][3]` (pinball left of kuva).
  - `CoreTrackingTest.ThreadedFindsBothMarkers` (threaded preset; sleep 10 ms between frames, at most 10 s): same assertions.
  - `CoreTrackingTest.BlankFrameLosesTracking`: after tracking, one blank frame: `tracking == false`, `err == -1.0f`.
  - `CorePolicyTest.IntervalThrottlesWhileSomethingIsTracked` (single-thread preset, `FakeClock`, `pinballOnly` frames): with pinball tracked and interval 300, advancing the clock by 100 ms per frame, KPM runs (observable as `detectNFTMarker() != -1`) on the frame where 300 ms have passed since the last pass and on no frame in between.
  - `CorePolicyTest.ContinuousDetectionOff`: pinball tracked on `pinballOnly` frames, `setContinuousDetection(false)`, then 10 frames of both markers: kuva never tracked; switching it back on finds kuva.
  - `CoreFilterTest.ThreadedPresetNeverFilters`: threaded preset, `setFiltering(true)`, track pinball: `markerState(0)->ftmi == nullptr`.
  - `CoreFilterTest.SingleThreadFilters`: single-thread preset with `withFiltering = true`: after tracking, `markerState(0)->ftmi != nullptr`.
  - `CoreLifecycleTest.AddMarkersWhileSearching` (threaded): start tracking with `{pinball}`, call `detectNFTMarker()` once to start a search, then `addNFTMarkers({kuva})` returns `{1}`; within 10 s both are tracked.
  - `CoreLifecycleTest.TeardownWhileSearching` (threaded): one `detectNFTMarker()` to start a search, then `teardown()` and destruction; no crash.
- [ ] **Step 2: RUN-NATIVE** — Expected: build failure (`setVideoFrame` undeclared).
- [ ] **Step 3: Implement** `setVideoFrame` (copy as `passVideoData` copies), `detectNFTMarker` following the spec's *Per-frame flow* (collect → start if idle and due, collect at once when `start` returns `true` → `trackMarkers`; `lastKpmEndMs = config.clock()` after each finished collection; "due" exactly as `ARToolKitNFT_js.cpp:131-136`), `trackMarkers` from `ARToolKitNFT_js.cpp:175-209` with the AR2 call chosen by `config.ar2Variant` and the filter block run only when `withFiltering && config.poseFilteringSupported`, and the three setters from `ARToolKitNFT_js.cpp:639-653`. Return value: `resultNum` from the last collection this frame, else `-1`.
- [ ] **Step 4: RUN-NATIVE** — Expected: PASS, all suites.
- [ ] **Step 5: Commit** — `feat(nft): run detection and tracking in ARToolKitNFTCore`

### Task A6: Emscripten build check and PR

**Files:**
- Modify: `.github/workflows/test.yml` only if the existing Emscripten job does not build `WebARKitNFT` (check: it builds `WebARKit` with `-DEMSCRIPTEN_COMP=1`; `WEBARKIT_BUILD_NFT` defaults to `OFF`). If not built, add `-DWEBARKIT_BUILD_NFT=ON` to that configure line.

- [ ] **Step 1:** Build the target with Emscripten:
  ```bash
  docker run --rm -v "$PWD:/src" -w /src emscripten/emsdk:4.0.17 bash -c "emcmake cmake -S WebARKit -B build-em -DEMSCRIPTEN_COMP=1 -DWEBARKIT_BUILD_NFT=ON -DWEBARKIT_NFT_THREADS=ON && cmake --build build-em -j --target WebARKitNFT"
  ```
  Expected: builds with no errors (proves the `__EMSCRIPTEN__` clock path and the core compile under emcc). Repeat with `-DWEBARKIT_NFT_THREADS=OFF`.
- [ ] **Step 2:** If Step 1 needed the workflow change, commit it — `chore(ci): build the WebARKitNFT target with Emscripten` (use `chore`, not `ci`).
- [ ] **Step 3:** Push `feat/nft-core` and open a PR against WebARKitLib `dev`, "refs webarkit/jsartoolkitNFT#683". Do not merge: Part B validates it first.

---

## Part B — jsartoolkitNFT

Work on a branch `refactor/nft-core` from `origin/dev`. WASM builds run in `emscripten/emsdk:4.0.17` (**RUN-BUILD**):

```bash
docker run --rm -v "<repo>:/src" -w /src emscripten/emsdk:4.0.17 bash -c "npm run build"
```

then `npm run build-ts` on the host. Vitest runs as `npx vitest run --api.port=51735` (port 63315 can fall in a Windows-reserved range).

### Task B1: Equivalence tool, before touching the bindings

**Files:**
- Create: `tools/compare-builds/scenarios.js`, `tools/compare-builds.js`, `tools/compare-builds/index.html`

**Interfaces:**
- Produces:
  - `scenarios.js` (plain script usable from Node `require` and a browser `<script>`): `runScenarios(ARControllerNFT, frames, { cameraUrl, markerUrls, settle }) → Promise<Record[]>`, where a record is `{ scenario, frame, ret, markers: [{ found, error, pose: number[12] }] }`. Scenarios, each on a fresh controller with `["DataNFT/pinball", "DataNFT/kuva"]` (paths as the examples use them): `both` (20 frames), `pinballOnly` (20), `blank` (5), `bothAgain` (20), each run with filtering on and off and with continuous detection on and off, detection interval `0`; plus one run with interval `60000`. `frames` is `{ both, pinballOnly, blank }`, RGBA `Uint8Array`s of 2000 × 1500 built from `pinball-demo.jpg` exactly as `tests/node/multi-marker.test.js` builds them.
  - `tools/compare-builds.js`: `node tools/compare-builds.js [--self-test] <oldNodeBundle> <newNodeBundle>` runs `runScenarios` on both Node bundles (from `examples/node`, as the tests do), prints the first differing record and exits `1`, or prints `identical (<n> records)` and exits `0`. `--self-test` runs the new side with filtering inverted in every scenario, to prove the tool reports differences.
  - `index.html` (served by `python-server.py`): `?old=<url>&new=<url>&threaded=0|1`; loads each bundle in its own iframe (UMD globals), builds the frames with canvas, runs `runScenarios`, compares; with `threaded=1` it compares only per scenario the set of markers found and the pose of the last frame of each scenario. Result in `window.result = { identical, diffs }` and on the page.

- [ ] **Step 1:** Save the current builds as the reference: `git show origin/dev:dist/ARToolkitNFT_node.js`, `…ARToolkitNFT.js`, `…ARToolkitNFT_simd.js`, `…ARToolkitNFT_td.js`, `…602.ARToolkitNFT_td.js` into `<scratch>/ref-dist/` (keep the `602.` chunk next to `ARToolkitNFT_td.js`).
- [ ] **Step 2:** Self-check, identical inputs: `node tools/compare-builds.js <scratch>/ref-dist/ARToolkitNFT_node.js dist/ARToolkitNFT_node.js` — Expected: `identical`.
- [ ] **Step 3:** Self-check, the tool sees differences: `node tools/compare-builds.js --self-test <scratch>/ref-dist/ARToolkitNFT_node.js dist/ARToolkitNFT_node.js` — Expected: exit `1` with a differing pose.
- [ ] **Step 4:** Browser self-check with `index.html` for the three browser bundles against themselves — Expected: `identical` for ES6 and SIMD. For the threaded build, run the reference against itself three times and record whether the threaded criterion holds; if it does not, write down which scenarios vary and narrow the criterion to the stable ones before Task B4 (note the result in the PR).
- [ ] **Step 5: Commit** — `test: add a tool that compares the tracking output of two builds` (refs #683)

### Task B2: Submodule and build wiring

**Files:**
- Modify: `emscripten/WebARKitLib` (submodule to the head of WebARKitLib `feat/nft-core`), `tools/makem.js`
- Delete: `emscripten/KpmRefDataSetCopy.h`

- [ ] **Step 1:** In `tools/makem.js` add to **both** `MAIN_SOURCES_IMPROVED_ES6` and `MAIN_SOURCES_TD_ES6`: `nft("ARToolKitNFTCore.cpp")`, `nft("SyncKpmDetector.cpp")`, `nft("NFTClock.cpp")` and `path.resolve(WEBARKITLIB_ROOT, "WebARKit/WebARKitLog.cpp")`; to `MAIN_SOURCES_TD_ES6` also `nft("ThreadedKpmDetector.cpp")`, `nft("trackingMod.c")` and `nft("trackingMod2d.c")`; add `-DWEBARKIT_NFT_THREADS` to the `compile_wasm_es6_thread` command only. Change the two `#include "KpmRefDataSetCopy.h"` to `<WebARKitTrackers/WebARKitNFT/KpmRefDataSetCopy.h>`.
- [ ] **Step 2: RUN-BUILD** — Expected: builds (the bindings are unchanged, the core links unused).
- [ ] **Step 3:** `node tools/compare-builds.js <ref>/ARToolkitNFT_node.js dist/ARToolkitNFT_node.js` after `npm run build-ts` — Expected: `identical` (wiring alone changes nothing).
- [ ] **Step 4: Commit** with `build/` and `dist/` — `chore: build the NFT core from WebARKitLib` (refs #683)

### Task B3: Single-thread adapter

**Files:**
- Modify: `emscripten/ARToolKitNFT_js.h`, `emscripten/ARToolKitNFT_js.cpp`

**Interfaces:**
- Consumes: the `ARToolKitNFTCore` API (A4, A5), `singleThreadPreset()`.
- Produces: class `ARToolKitNFT` with exactly the methods `ARToolKitNFT_js_bindings.cpp` binds, same signatures.

- [ ] **Step 1:** Rewrite `ARToolKitNFT` as an adapter holding `ARToolKitNFTCore core{singleThreadPreset(), withFiltering}` plus `arhandle`, `ar3DHandle`, `pixFormat`. Forward every NFT method to the core. Keep in the adapter: `getNFTMarkerInfo` (built from `core.markerState(i)`, `MARKER_INDEX_OUT_OF_BOUNDS` on `nullptr`, the zero pose as `typed_memory_view` of a static `std::array<int, 12>` as today), `getCameraLens` (from `core.cameraLens()`), `passVideoData` (pointers, internal SIMD luma via `webarkitVideoLuma`, then `core.setVideoFrame`), `setLogLevel` (sets `arLogLevel` and `webarkitLogLevel` when `level >= 0`) / `getLogLevel`, the ARHandle methods unchanged, and `setCamera` / `teardown` / destructor in the spec's order (delete `arhandle`/`ar3DHandle` → `core.setCamera` → create them from `core.cameraParamLT()` / `core.cameraParam()`; return `-1` if either creation fails). The default constructor keeps `withFiltering = false`.
- [ ] **Step 2: RUN-BUILD**, `npm run build-ts`.
- [ ] **Step 3:** `node tools/compare-builds.js <ref>/ARToolkitNFT_node.js dist/ARToolkitNFT_node.js` — Expected: `identical`. Then `index.html?old=<ref>/ARToolkitNFT.js&new=/dist/ARToolkitNFT.js&threaded=0` and the same for `ARToolkitNFT_simd.js` — Expected: `identical`. A difference is investigated and fixed (in the adapter, or in the WebARKitLib PR) before continuing; no tolerance.
- [ ] **Step 4:** `npm run test:node` and `npx vitest run --api.port=51735` — Expected: all pass with no test changes. Add `tests/node/adapter.test.js` for Review Focus 2 and 4, on the Node bundle: with pinball and kuva loaded, `ar.getNFTMarker(-1)` and `ar.getNFTMarker(2)` return `-3`; then call the raw binding's `setup` a second time (`const inst = ar.artoolkitNFT.instance; inst.setup(2000, 1500, inst._loadCamera("camera_para.dat"))` — `private` in TS is not enforced at runtime, and `setup` is the bound entry that runs `setCamera`), load pinball again, and `processUntil` it is found on the `both` frame. Run it on the reference bundle first: it must pass there too, so it pins today's behaviour.
- [ ] **Step 5: Commit** with `build/` and `dist/` — `refactor: make the single-thread binding an adapter over ARToolKitNFTCore` (refs #683)

### Task B4: Threaded adapter

**Files:**
- Modify: `emscripten/ARToolKitNFT_js_td.h`, `emscripten/ARToolKitNFT_js_td.cpp`

- [ ] **Step 1:** Same adapter shape as B3 with `threadedPreset()`; keep `_js_td`'s own `getProcessingImage` (no null check, D2) and its default constructor. Remove `trackingInit`, `threadHandle`, `kpmSearchRunning` and the `static_assert` (now in the core).
- [ ] **Step 2: RUN-BUILD**, `npm run build-ts`.
- [ ] **Step 3:** `index.html?old=<ref>/ARToolkitNFT_td.js&new=/dist/ARToolkitNFT_td.js&threaded=1` — Expected: the threaded criterion established in B1 Step 4 holds. Also re-run the B3 comparisons (the single-thread builds must still be `identical`).
- [ ] **Step 4:** `npm run test:node` and `npx vitest run --api.port=51735` — Expected: all pass with no test changes.
- [ ] **Step 5: Commit** with `build/` and `dist/` — `refactor: make the threaded binding an adapter over ARToolKitNFTCore` (refs #683)

### Task B5: Draft PR and real examples

- [ ] **Step 1:** Run `examples/node/example_dist.js` — Expected: it reports the pinball marker found, as on `dev`.
- [ ] **Step 2:** Push `refactor/nft-core`, open a **draft** PR against `dev` titled `refactor: move the NFT logic into ARToolKitNFTCore (WebARKitLib)`, body with the equivalence results (single-thread `identical`, the threaded criterion and its B1 baseline), the line counts before and after for the two bindings, and "refs #683".
- [ ] **Step 3:** Check that the PR's CI is green, including the Python bindings workflows (they compile sources from the same WebARKitLib folder).
- [ ] **Step 4:** Ask the maintainer to try the browser examples with a webcam, especially `examples/ARToolkitNFT_ES6_threading_example.html`.

### Task B6: After the WebARKitLib release

- [ ] **Step 1:** Once the WebARKitLib PR is merged and released (0.11.0, `dev` → `master`), move the submodule to the release commit on `master`.
- [ ] **Step 2: RUN-BUILD**, `npm run build-ts`; re-run the B3 and B4 comparisons and the test suites — Expected: as before.
- [ ] **Step 3: Commit** with `build/` and `dist/` — `chore: update WebARKitLib to 0.11.0`; mark the PR ready for review.
