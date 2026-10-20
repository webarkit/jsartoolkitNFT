# Python binding on ARToolKitNFTCore

**Date:** 2026-10-16
**Issue:** #693 (follow-up of #683 / #697)
**Status:** design agreed in discussion; this document is the written spec, awaiting approval

## Summary

Port the native part of the Python bindings, `python-bindings/ARToolKitNFT_py.cpp` and its
header, onto WebARKitLib's `ARToolKitNFTCore`, as #697 did for the two Embind bindings. The
pybind11 class becomes a thin adapter. The core does all the NFT work: camera, markers, frame
buffers, per-marker state, KPM detection policy and AR2 tracking. The adapter converts between
numpy, `dict` and `list` on one side and the core's C++ types on the other.

After this, the NFT logic exists once, in WebARKitLib. Today the Python binding is the last
copy outside it: an older one that still tracks a single marker.

The Python API stays as it is, with three additions taken from the JS bindings:
`setFiltering`, `setContinuousDetection` and `setDetectionInterval`. Two things that
`ARControllerNFT` already expects but the native code breaks today start working as a side
effect: tracking several markers at once, and loading markers in more than one call.

## Why

The NFT logic was kept in three near-copies: the single-thread Embind binding, the threaded
one and the Python one. #697 moved the first two onto the core. Every fix since then goes into
the core once, except for Python, which keeps its own `detectedPage` logic. A fix to tracking or
detection has to be redone there by hand, or Python silently falls behind. The goal of this
work is to end that.

## Goals, non-goals, anti-goals

**Goals**

- G1. `ARToolKitNFT_py.cpp` holds no NFT logic of its own. There is no detection policy, no
  per-marker state and no AR2 or KPM calls in it. Everything goes through `ARToolKitNFTCore`.
- G2. A Python user tracking one marker gets the same results as with 0.0.14. This is checked
  frame by frame. The one deliberate exception is the AR2 thresholds (D10).
- G3. Every method of today's native class and of `ARControllerNFT` keeps its name, arguments
  and return shape. `example.py` and the existing `test_arcontrollerNFT.py` run unchanged.
  The one exception is `test_process_image`: it asserts nothing today, and it is rewritten
  (see "Found on the way").
- G4. `setFiltering`, `setContinuousDetection` and `setDetectionInterval` are available on
  the native class and on `ARControllerNFT`, under the same names and with the same meaning as
  in JS (`src/ARControllerNFT.ts`).
- G5. These work, and tests prove it:
  - several markers tracked at the same time;
  - markers loaded in several `loadNFTMarker(s)` calls, with distinct ids;
  - an over-limit load that returns an error instead of terminating Python.

**Non-goals**

- The threaded detector in Python. The adapter uses the single-thread preset, as 0.0.14
  does (D4).
- Loading `.zft` archives from Python (`decompressZFT`).
- `recalculateCameraLens`. JS has it since #630; Python can gain it later.
- Fixing the bugs in the pure-Python layer listed under "Found on the way". They go in a
  separate issue (D9).
- Changing `ARControllerNFT`'s events, its luma conversion or its async loading.
- Removing the threshold, debug-mode and image-processing methods. They have no effect on NFT,
  but #659 governs their future for JS, and Python follows that.
- Intel macOS wheels, new platforms or new Python versions.
- Releasing. The PR does not bump the version (D8).

**Anti-goals.** Any of these makes the work a failure, even if everything else passes.

- Someone tracking one marker in Python upgrades and gets different poses without being told.
- A copy of the NFT logic survives in the adapter, for example its own idea of which marker
  is tracked, or its own detection timing.
- A new way for the binding to terminate the interpreter (`exit`, `abort`, an unhandled C++
  exception). 0.0.14 has one, `exit(-1)` on too many markers, and this work removes it.

## Decisions

"User" means the maintainer decided it in the design discussion. "Mine" is the author's call,
open to correction in review.

| # | Decision | By |
|---|---|---|
| D1 | The point of the work is a single copy of the NFT logic. Multi-marker tracking and incremental loading in Python are welcome side effects, not the aim. | User |
| D2 | Single-marker results must not change for existing users. This is checked frame by frame against 0.0.14 with a frozen clock. Multi-marker results are checked against the Node build, which runs the same core. | User |
| D3 | `setFiltering`, `setContinuousDetection` and `setDetectionInterval` are added in this PR, on the native class and on `ARControllerNFT`, with the JS names. | User |
| D4 | The adapter uses `singleThreadPreset()`: the sync KPM detector and the `ar2*Mod` tracking functions, with no worker thread and no `WEBARKIT_NFT_THREADS`. This is what 0.0.14 does, and what the single-thread JS binding uses. | Mine |
| D5 | Everything else in the API stays as it is (G3). The native constructor gains an optional `withFiltering=False`, as in JS. Filtering stays off by default: 0.0.14 never compiles its filter (`WITH_FILTERING` is not defined by `setup.py`), and the core keeps it off by default too. | Mine |
| D6 | The comparison with 0.0.14 is a script in `tools/` that is run by hand before the merge and whose output goes in the PR, like `tools/compare-builds.js`. It is not a permanent CI job, because it would depend forever on a wheel or a tag from the past. The multi-marker checks that do not need a reference are pytest tests in CI. | Mine |
| D7 | `python-bindings/test.py` is deleted. It imports `jsartoolkitNFT`, a module that no longer exists, calls `getNFTMarkerInfo`, which is not bound, and CI does not run it. | Mine |
| D8 | The next Python release is **0.1.0**, because it brings new functions. The PR does not bump `pyproject.toml` or `setup.py`; the release does, following the usual Python release flow. | Mine |
| D9 | The bugs found in the pure-Python layer go in a separate issue, not in this PR. The exception is the test that never asserts anything (see below), which the new tests replace. | Mine |
| D10 | Python uses the core's AR2 thresholds (5.0 / 0.5), the values it had before a debugging change in 2025. Single-marker equivalence is checked against 0.0.14 with only those two values restored. See the next section. | User |

## The AR2 thresholds (D10)

The core configures AR2 the way the JS bindings always have:

| Setting | 0.0.14 (Python) | Core (JS) |
|---|---|---|
| `ar2SetTrackingThresh` | **2.0** | **5.0** |
| `ar2SetSimThresh` | **0.3** | **0.50** |
| `ar2SetSearchFeatureNum` | 16 | 16 |
| `ar2SetSearchSize` | 6 | 6 (single-thread preset) |
| `ar2SetTemplateSize1/2` | 6 / 6 | 6 / 6 |

Python had JS's values until commit 34d3bf9 ("trying to debug the issue", 2025-11-11, merged
with #431). That commit changed them to 2.0 and 0.3, with the comments "Lowering tolerance"
and "Increase similarity tolerance", and gave no other reason. The core does not expose these
settings. Its config (`NFTTrackingConfig`) has no field for them, and the AR2 handle is private.

**Where the values came from.** They were part of a debugging session, and they never fixed
the bug they were tried on.

1. On 2025-03-07, in #431, the maintainer noted that the tests passed but the marker was
   never detected.
2. Commit 34d3bf9 is a debugging pass on that problem. Along with the threshold change it
   added:
   - logging of buffer sizes, first bytes and KPM results;
   - image rotations and flips in `example.py` (commented out);
   - new controller dimensions;
   - `setGrayData`.
3. The real cause was found in commit 4504963 (2026-05-27). The width and height given to
   `ARControllerNFT()` did not match the image, so the frame reached C++ scrambled and KPM
   found zero inliers. 8682ab8 and 3a81f68 then derived the controller size from the image.
4. The thresholds were never restored.

They could not have fixed that bug in the first place: they act on AR2 tracking, which only
starts after KPM has found the marker.

**Decided: A** (the maintainer, 2026-10-16). The two options as they were weighed:

- **A. Python uses the core's values (5.0 / 0.5).** There is then one engine with one
  behaviour. Single-marker poses do change compared with 0.0.14, because tracking accepts
  matches differently. The release notes must say so (anti-goal 1). The 0.0.14 comparison then
  uses a reference built from tag `python/0.0.14` with only these two values changed to 5.0 /
  0.5. That isolates the port from the threshold change: the port must match the patched
  reference exactly. A second, informational run against the unpatched 0.0.14 shows how much
  the thresholds alone move the poses.
- **B. The core makes the thresholds configurable, and Python keeps 2.0 / 0.3.** This adds
  `trackingThresh` and `simThresh` to `NFTTrackingConfig` (or a `pythonPreset()`), which is a
  WebARKitLib PR and a release (0.11.1 or 0.12.0) before this PR can merge. Single-marker
  results stay identical to the unpatched 0.0.14. The logic is still single, but Python and JS
  keep tracking differently by configuration.

A was chosen for three reasons:

- the 2.0 / 0.3 values are a leftover from debugging;
- JS users have run 5.0 / 0.5 throughout;
- B would keep a behavioural difference that D1 is meant to remove.

The 0.1.0 release notes present the change as the removal of that leftover, and they give the
measured effect on poses from the informational run below.

## Current state, measured

`ARToolKitNFT_py.cpp` (631 lines) and `ARToolKitNFT_py.h` (124 lines), on `dev` at d45b3c9.
The comparison is with WebARKitLib 0.11.0 (c3ede5d), the submodule pin.

**The same with one marker** (read from both sources; the comparison proves it):

- **Detection cadence.**
  - 0.0.14 runs `kpmMatching` on every frame while `detectedPage == -2`, which means nothing
    is tracked.
  - The core detects on every frame while no marker is tracked, and never while all loaded
    markers are tracked (`ARToolKitNFTCore::detectNFTMarker`). With one marker the cadence is
    the same; the interval and continuous-detection settings only matter while some markers
    are tracked and others are not.
- **Detection and tracking in the same frame.**
  - 0.0.14 detects in `detectNFTMarker()` (`ar2SetInitTrans`) and tracks in
    `getNFTMarkerInfo()` (`ar2TrackingMod`).
  - The core detects and then tracks inside `detectNFTMarker()`. `ARControllerNFT.process()`
    calls `detectNFTMarker()` and then `getNFTMarker(i)` for each marker, so the per-frame
    order of AR2 calls is the same.
- **Tracking loss** happens in the same frame in both, and that frame reports `found: 0`.
- **The pose and error values.** Both use the `float trans[3][4]` and `float err` from
  `ar2TrackingMod`; the core widens them to `ARdouble`, which is exact.
- **The filter** is off in both (D5).
- **`detectNFTMarker()`'s return value.**
  - 0.0.14 returns the KPM result count when a pass ran, else -1.
  - The core returns the count of the pass collected in that call, else -1.
  - For the sync detector, these are the same.

**Different, and intended:**

- **Per-marker state.**
  - 0.0.14 has one `detectedPage` and takes the best KPM result: the most inliers, then the
    lowest error.
  - The core keeps an `NFTMarkerState` per page and starts tracking every page KPM found.
- **Marker loading.**
  - In 0.0.14, each `addNFTMarkers()` call numbers its markers from 0, overwrites
    `surfaceSet[i]`, and replaces the KPM reference data with only the new batch. A second
    `loadNFTMarker` therefore returns id 0 again and replaces the first marker.
  - The core appends: ids continue across calls, and it hands KPM the reference data of every
    marker loaded so far.
- **The marker limit.**
  - In 0.0.14, a single call with 20 or more paths calls `exit(-1)`, which kills the
    interpreter.
  - The core refuses a load that would bring the total past `PAGES_MAX` (20). It returns an
    empty list, changes nothing and logs an error.
- **Calling `getNFTMarker(i)` twice in a frame.**
  - In 0.0.14 this tracks twice, because tracking happens inside it.
  - In the core it only reports. This matters only to code that drives the native class
    directly; `ARControllerNFT` calls it once per marker per frame.
- **`teardown()`.**
  - In 0.0.14 it frees the frame buffers and the camera and AR2 handles, and keeps the
    markers and the KPM handle.
  - The core's `teardown()` frees everything, so `markerCount()` becomes 0, while
    `getNFTData()` still answers for the old markers.
  - Nothing in `ARControllerNFT` calls `teardown()`.

**Different, and decided:** the AR2 thresholds go back to 5.0 / 0.5 (D10).

### Found on the way (out of scope, D9)

In `python-bindings/src/artoolkitnft/arcontrollerNFT.py` and its tests:

- **`lostNFTMarker` is broken in two ways.**
  - `MARKER_LOST_TIME = 200` is compared with `time.time()` differences, which are in seconds.
    The event therefore comes 200 s after the last sighting, not 200 ms.
  - `self.nftMarkerFound` starts as `False`, and in Python `False == 0`. So for marker 0,
    `elif self.nftMarkerFound == i` is true on every frame where marker 0 is not found, and
    `lostNFTMarker` fires on every such frame, including before the marker was ever seen.
- **`_copyImageToHeap` prints the whole flattened frame and luma** (`print("videoFrame:", ...)`)
  on every `process()` call.
- **`test_process_image` never asserts anything.** It registers its `getNFTMarker` listener
  after calling `process()`, so the assertions never run. Moving the listener is not enough.
  The asserts read `id` and `found` at the top level of the event, but the event carries
  `index`, `type`, `marker`, `matrix` and `matrixGL_RH`, with `found` inside `marker`. Moved
  as it is, the test would fail. It is rewritten as new test 1 below (mine). Being a test of
  this work's behaviour, it stays in this PR and is not left for the D9 issue.

## Design

### Native adapter

`ARToolKitNFT_py.h` and `ARToolKitNFT_py.cpp` are rewritten along the lines of
`emscripten/ARToolKitNFT_js.h` and `ARToolKitNFT_js.cpp`:

- Members:
  - `ARToolKitNFTCore core`, constructed with `singleThreadPreset()` and `withFiltering`;
  - `width` and `height`, for the size checks in `passVideoData`;
  - `ARHandle *arhandle` and `AR3DHandle *ar3DHandle`, for the threshold, debug and
    image-processing methods only.
- Nothing else. `detectedPage`, `surfaceSet`, `kpmHandle`, `ar2Handle`, `ftmi`, `paramLT`,
  the frame buffers, the camera registry and the id counters all go, because the core owns
  them.
- The header's own `nftMarker` struct and `PAGES_MAX` go too. The core's header defines both,
  with the same fields, and pybind11 binds the core's `nftMarker`.
- `arhandle` keeps a pointer to the core's `paramLT`. It is therefore deleted before anything
  that makes the core free `paramLT` (`setup()`, `teardown()`, the destructor), and created
  again from `core.cameraParamLT()` after `setup()` when that is not null. This is the same
  rule as `deleteARHandles()` and `createARHandles()` in the JS adapter.

Method by method:

| Python method | Today | On the core |
|---|---|---|
| `ARToolKitNFT()` | | `ARToolKitNFT(withFiltering=False)`; the core uses `singleThreadPreset()` |
| `loadCamera(path)` | own registry | `ARToolKitNFTCore::loadCamera` |
| `setup(w, h, cameraId)` | own buffers + `setCamera` | delete the AR handles, `core.setup`, recreate the handles if `cameraParamLT()` is set; return the id |
| `setupAR2()` | own AR2 + KPM handles | `core.setupAR2()` |
| `addNFTMarkers(paths)` | own loading, see above | `core.addNFTMarkers(paths)` |
| `getNFTData(i)` | `nftMarkers.at(i)` | `core.getNFTData(i)`. An out-of-range index raises `IndexError`, as `std::out_of_range` does today |
| `passVideoData(frame, luma)` | size checks, copy | same size checks and `-1` on mismatch, then `core.setVideoFrame(frame, luma)`; return 0 |
| `detectNFTMarker()` | KPM when nothing is tracked | `core.detectNFTMarker()` |
| `getNFTMarker(i)` | tracks, then reports | reports `core.markerState(i)` as a dict, in the same shape as today (below) |
| `getCameraLens()` | numpy array of 16 doubles | the same, from `core.cameraLens()` |
| `set/getProjectionNearPlane`, `set/getProjectionFarPlane` | own fields | core |
| `setLogLevel(l)` | `arLogLevel` | `arLogLevel` and `webarkitLogLevel` (the core logs with both), with the same `l >= 0` guard; `getLogLevel` returns `arLogLevel` |
| `teardown()` | partial | delete the AR handles, then `core.teardown()` |
| `set/getThreshold`, `set/getThresholdMode`, `setDebugMode`, `getDebugMode`, `getProcessingImage`, `set/getImageProcMode` | on `arhandle` | unchanged, on the adapter's `arhandle` |
| **`setFiltering(bool)`** | — | `core.setFiltering` |
| **`setContinuousDetection(bool)`** | — | `core.setContinuousDetection` |
| **`setDetectionInterval(ms)`** | — | `core.setDetectionInterval` |

The `getNFTMarker(i)` dict keeps today's exact shape:

- out of range: `{"error": -3}` (`MARKER_INDEX_OUT_OF_BOUNDS`);
- tracked: `{"id": i, "error": err, "found": 1, "pose": [12 floats]}`;
- not tracked: `{"id": i, "error": -1, "found": 0, "pose": [0.0] * 12}`.

`NFT_MARKER` stays as a module attribute.

The per-frame `ARLOGi` dumps in today's `passVideoData` (array dimensions, first bytes) are
not carried over; the JS adapter does not have them either (mine). The size-check error logs
stay.

**Threads and the GIL.** The core is not thread-safe, and `ARControllerNFT` calls
`loadCamera` and `addNFTMarkers` through `run_in_executor`, on worker threads. Today every
bound method holds the GIL for its whole duration, which serialises the calls. The adapter
keeps that, and no method gets `py::call_guard<py::gil_scoped_release>` (mine). Releasing the
GIL for speed is out of scope.

### `ARControllerNFT`

It gains three methods that forward to the native object, with the docstrings adapted from
the TSDoc of `src/ARControllerNFT.ts`:

- `setFiltering(enable)`
- `setContinuousDetection(enabled)`
- `setDetectionInterval(ms)`

Nothing else changes in it (non-goals).

### Build

`setup.py` adds these sources from `../emscripten/WebARKitLib`, the same set that
`tools/makem.js` uses for `MAIN_SOURCES_IMPROVED_ES6`, minus the Embind file:

- `WebARKit/WebARKitTrackers/WebARKitNFT/ARToolKitNFTCore.cpp`
- `WebARKit/WebARKitTrackers/WebARKitNFT/SyncKpmDetector.cpp`
- `WebARKit/WebARKitTrackers/WebARKitNFT/NFTClock.cpp`
- `WebARKit/WebARKitTrackers/WebARKitNFT/markerDecompress.c`. The core's `decompressZFT`
  references it. It needs only zlib, which every platform already links.
- `WebARKit/WebARKitLog.cpp`, with `WebARKit/include` added to `include_dirs` for
  `<WebARKitLog.h>`.

`trackingMod.c` and `trackingMod2d.c` are already compiled. `ARUtil/thread_sub.c`, which the
core references for `threadGetCPU()`, is already in the ARUtil glob.
`ThreadedKpmDetector.cpp` is not compiled, and `WEBARKIT_NFT_THREADS` is not defined.

The core has been compiled so far only by gcc (WebARKitLib's native tests) and by Emscripten.
This PR is the first time MSVC and Apple clang compile it, in `build-python.yml` on Windows and
macOS. At least one failure is expected. On Windows, `<AR/config.h>` includes `<windows.h>`
without `NOMINMAX`. Its `max` macro then breaks `std::numeric_limits<int>::max()` in
`ARToolKitNFTCore::setup()` (MSVC error C2589).

How portability problems are handled (mine):

- **Build-flag workarounds belong in `setup.py`.** An example is defining `NOMINMAX` on Windows
  for the core's sources only, through the existing compile hook in `setup.py`; defining it
  for ARToolKit's C sources is not needed and is avoided.
- **Source changes to the core go to WebARKitLib.** They are its own PR and a patch release
  (0.11.x). The `NOMINMAX` case also gets its upstream fix, `(std::numeric_limits<int>::max)()`,
  so that the workaround can be removed later; that fix does not block this PR.
- **If the submodule has to move before the merge:**
  - The bump goes first, on `dev`, as its own PR. It changes the core that the committed
    `build/` and `dist/` were compiled from, so that PR rebuilds and commits them and runs the
    JS checks, as `CLAUDE.md` requires.
  - This PR then rebases on it. The Node comparison needs `dist/ARToolkitNFT_node.js` built
    from the same core as the Python binding.

## Errors

- No method raises a Python exception where 0.0.14 returns a value. Failures keep their
  current form:
  - `-1` from `setup`, `setupAR2`, `loadCamera` and `passVideoData`;
  - an empty list from `addNFTMarkers`;
  - `{"error": -3}` from `getNFTMarker`.
- `getNFTData` with a bad index raises `IndexError`, as today.
- The over-limit load returns an empty list (G5) instead of `exit(-1)`.

## Testing and verification

### pytest, in CI (`test_arcontrollerNFT.py`, all three OS)

The existing tests stay and must pass unchanged (G3). New tests, all on
`python-bindings/pinball-demo.jpg`. It is the same photo as `examples/node/pinball-demo.jpg`:
a printed sheet with pinball on the left and kuva on the right, rotated. The "pinball only"
frame is that photo with the kuva print painted over with a flat fill (`#d9d4ca`), over the
polygon `KUVA_PRINT` in `tests/vitest/frames.ts`: (1128, 380), (1705, 452), (1705, 1165),
(1096, 1100).

1. **Single-marker detection.**
   - Load pinball and feed the photo for a few frames.
   - `getNFTMarker` events arrive with `ev["index"] == 0`, `ev["marker"]["found"] == 1` and a
     real pose, meaning 12 finite values, not all zero, with a non-zero translation, as
     `expectRealPose` checks in `tests/vitest/legacy.ts`.
   - This is the rewritten `test_process_image`.
2. **Incremental loading.**
   - `loadNFTMarker(pinball)` returns `[0]` and `loadNFTMarker(kuva)` returns `[1]`.
   - `getNFTData(1)` has kuva's size and dpi, not pinball's.
3. **Multi-marker tracking.**
   - Load the two markers in two calls and play the two-marker photo: both are found.
   - Then play the pinball-only frame: kuva is lost and pinball stays found.
4. **Over the limit.**
   - Loading more paths than the remaining room under `PAGES_MAX` returns `[]`.
   - The interpreter survives, and the markers loaded before still detect.
5. **The three settings.**
   - `setContinuousDetection(False)`: pinball is tracked on the pinball-only frame, then kuva
     appears in the two-marker photo, and kuva is not detected while pinball stays tracked.
     With `True` and interval 0, kuva is detected.
   - `setDetectionInterval(60000)` behaves like continuous detection off, within one test.
   - `setFiltering(True)` changes the poses after the first tracked frame compared with
     `False` on the same frames. On a still photo this relies on AR2's frame-to-frame jitter,
     the same effect that `compare-builds --self-test` relies on. Play enough frames for the
     difference to show.

The asserts for (3) and (5) use frames played in a fixed order, so they do not depend on the
machine's speed, the same reasoning as the interval 0 and 60000 runs in
`tools/compare-builds/scenarios.js`.

### Equivalence with 0.0.14 (one-off, before the merge; D2, D6)

A script in `tools/` drives the **native classes directly**. It does not use
`ARControllerNFT`, so the luma conversion and the events stay out of the comparison. The
script:

- **Reference:** the binding built from tag `python/0.0.14`, with only the two AR2 thresholds
  changed to 5.0 / 0.5 (D10). It is built from source in the same container as the new
  one. The tag pins the same WebARKitLib commit (c3ede5d), and its `python-bindings/` is
  identical to `dev` at d45b3c9. Reference and candidate therefore differ only where intended.
  If the submodule moves before the merge (see Build), the reference keeps c3ede5d, and any
  difference has to be traced to that move or to the port.
- **Candidate:** the binding built from the PR branch.
- **Input:** both receive byte-identical RGBA and luma buffers from one decoding of the photo,
  so the JPEG decoder cannot introduce a difference.
- **Marker:** pinball only, because single-marker results are what G2 is about. 0.0.14 cannot
  track two.
- **Phases:**
  1. two-marker photo, 20 frames (kuva is in view but not loaded);
  2. pinball only, 20 frames;
  3. flat grey, 5 frames (tracking is lost);
  4. two-marker photo, 20 frames (re-detection).
- **Record per frame:** `detectNFTMarker()`'s return value, plus `found`, `error` and the 12
  pose values from `getNFTMarker(0)`. This is the record of `compare-builds`, with one marker.
- **Determinism:**
  - `ar2SelectTemplate` reseeds `rand()` with `time(NULL)`, so each side runs in its own
    process under libfaketime with a frozen wall clock (for example
    `FAKETIME="2026-01-01 00:00:00"`).
  - `FAKETIME_DONT_FAKE_MONOTONIC=1` leaves the core's steady clock alone; with one marker it
    is never read for a decision.
  - Linux only, in a one-off `ubuntu:24.04` container. The 0.0.14 manylinux wheels need glibc
    2.39.
- **Guards, as in `compare-builds`:**
  - The script refuses to report "identical" if the reference never finds pinball, never
    loses it in phase 3 and never finds it again in phase 4, because two bindings that track
    nothing compare identical.
  - A self-test runs the candidate with filtering on and must report a difference.
- **Pass:** every record identical. Any difference blocks the merge until it is explained.
- **Informational second run:** against the unpatched 0.0.14 wheel from PyPI. It gives the
  size of the change that the threshold switch alone brings, for the release notes.
- **The PR description holds:**
  - the commands;
  - the sha256 of both extension modules;
  - the verdict and the number of frames on which the reference found pinball.

### Multi-marker, against the Node build (one-off, before the merge; D2)

The Node build (`dist/ARToolkitNFT_node.js`) runs the same core. The script:

- **Runs:** the five runs of `tools/compare-builds/scenarios.js`, with the same phases:
  - filtering on and off × continuous detection on and off, at interval 0;
  - one run with interval 60000.
- **Same input on both sides:**
  - The Node side writes its records and the exact RGBA and luma bytes it fed each frame,
    through a small addition to `compare-builds` or a separate Node script (the builder's
    choice).
  - The Python side drives the native class with those bytes and writes records in the same
    format.
- **Pass:**
  - The found set is identical on every frame.
  - The poses are close, but not necessarily bit-identical. Emscripten's `rand()` (musl) and
    glibc's produce different sequences from the same seed, so `ar2SelectTemplate` can pick
    different templates, and the compilers differ too.
  - The tolerance is measured, not assumed, and written in the PR with the largest
    difference seen.
  - A frame whose found set differs must be explained before the merge.

### Manual

- `python example.py` runs.
- One wheel, built locally on Windows, imports and detects pinball. The CI wheels for the
  three OS come from `build-python.yml` on the PR.

## Documentation

- `python-bindings/README.md` gains a short usage section that covers:
  - several markers, loaded in one call or many;
  - the three settings and their defaults: filtering off, continuous detection on, interval
    300 ms.
- The 0.1.0 release notes state the threshold change and its measured effect
  (anti-goal 1).

## Recording the reasons

Every behaviour change and every non-obvious choice in this work carries its reason. A reader
of the code, the history or the release must not have to come back to this document, or to
the person who decided, to learn why something changed. This is a requirement from the
maintainer.

Where the reasons go:

- **Code comments**, where a future reader could otherwise undo the change by "fixing" it
  back.
  - Reasons in the code survive the squash merge, which can drop individual commit bodies.
- **Commit message bodies.** Conventional Commits, with the why in the body and not only the
  what.
- **The PR description.** It holds a table of every change against 0.0.14: the change, its
  reason and its evidence (a commit, an issue, or a comparison result).
  - The PR is squashed, so this is the durable record of the whole change.
- **The 0.1.0 release notes**, for every change a user can see.

The changes and the reason each one records:

| Change | Reason to record | Where |
|---|---|---|
| AR2 thresholds 2.0 / 0.3 → 5.0 / 0.5 | The 2.0 / 0.3 values came from the debugging pass 34d3bf9 on "marker never detected" (#431, 2025-03-07). The real cause was a controller size that did not match the image, fixed in 4504963. The thresholds act on AR2 only after KPM has found the marker, so they could not have fixed it. 5.0 / 0.5 is what Python had before and what JS uses. | Adapter comment where the core is constructed (the AR2 settings come from `singleThreadPreset()`); commit; PR; release notes, with the measured effect |
| Per-frame `ARLOGi` dumps in `passVideoData` removed | They were added by the same debugging pass 34d3bf9; the size checks from 4504963 replaced their purpose. | Commit; PR |
| Marker ids continue across `loadNFTMarker(s)` calls, and KPM keeps every marker | In 0.0.14 a second load returned id 0 again and replaced the first marker: the same bug that #612 reported for JS and #666 fixed there. | Commit; PR; release notes |
| Over-limit load returns `[]` instead of `exit(-1)` | A library must not terminate its host interpreter. This is the same rule as D6 of `specs/2026-10-09-nft-core-design.md`. | Adapter comment or docstring of `addNFTMarkers`; commit; PR; release notes |
| `getNFTMarker(i)` only reports, and tracking happens in `detectNFTMarker()` | The core tracks once per frame, so calling `getNFTMarker` more than once per frame is harmless. In 0.0.14 each call tracked again. | Adapter comment (as in `ARToolKitNFT_js.cpp`); PR; release notes, under native-class changes |
| `teardown()` also frees the markers | The core's lifecycle: `teardown()` frees everything, and `setup()` + `setupAR2()` start over. | PR; release notes, under native-class changes |
| Three new settings | Parity with JS (D3). The default values and their meaning come from the TSDoc of `src/ARControllerNFT.ts`. | Docstrings; README; release notes |
| Single-thread preset only | 0.0.14 has no worker thread, and the threaded detector is not needed for parity (D4). | Adapter comment; PR |
| GIL held for every call | The core is not thread-safe, and `ARControllerNFT` calls `loadCamera` and `addNFTMarkers` from executor threads. The GIL serialises them. | Adapter comment next to the bindings; PR |
| `NOMINMAX` for the core's sources on Windows | `<AR/config.h>` includes `<windows.h>`, whose `max` macro breaks `std::numeric_limits<int>::max()` in the core (C2589). The upstream fix is linked so the workaround can be removed later. | `setup.py` comment; commit; PR |
| `test.py` deleted | It imports a module that no longer exists (`jsartoolkitNFT`), calls a method that is not bound, and is not run by CI. | Commit; PR |
| `test_process_image` rewritten | It registered its listener after `process()` and read keys the event does not have, so it never asserted anything. | Test docstring; commit; PR |

## Delivery

0. **Only if needed: a submodule bump** to a WebARKitLib patch release. It is its own PR on
   `dev`, with `build/` and `dist/` rebuilt (see Build).
1. **The PR.** One PR against `dev`, titled `feat: port the Python binding onto
   ARToolKitNFTCore`, holding:
   - this document;
   - the adapter;
   - `setup.py`;
   - `ARControllerNFT`'s three methods;
   - the tests;
   - the `tools/` script;
   - the README;
   - the deletion of `test.py`.
2. **Closing #693.** The PR body says "Closes #693". A PR merged into `dev` does not close
   issues, so the dev → master release PR repeats it, or #693 is closed by hand after the
   merge.
3. **The separate issue (D9).** It holds the pure-Python-layer bugs and is opened with the
   maintainer's OK.
4. **Release.** Python 0.1.0 follows later, through the usual flow:
   - the version bump;
   - a TestPyPI rehearsal;
   - dev → master as a merge commit;
   - the tag `python/0.1.0`.

## Risks

- **MSVC or Apple clang reject something in the core.** One case is already known: the
  `windows.h` `max` macro (see Build). A build-flag workaround keeps the cost low. A real
  source problem costs a WebARKitLib patch release, plus a submodule-bump PR with rebuilt JS
  artifacts, before the merge. The PR's Windows and macOS CI shows it on day one.
- **The 0.0.14 comparison finds a difference that the thresholds do not explain.** For
  example, the core's handling of the KPM reference data (`refDataSetAll`, the skip pages)
  could give KPM results in a different order. That is a finding to explain or fix, not to
  tolerate: G2 is the user's requirement.
- **Native-class users who relied on the 0.0.14 side effects:** tracking inside
  `getNFTMarker`, or markers kept across `teardown()`. This is unlikely, since the documented
  API is `ARControllerNFT`, and the release notes mention it.
- **The Node comparison's tolerance hides a real difference.** This is mitigated by requiring
  identical found sets and reporting the largest pose difference, not only a pass.

## Left to the builder

- **The adapter's code layout** and its pybind11 details: argument names, docstrings, the
  `withFiltering` keyword.
- **The two scripts:**
  - names and file layout;
  - how the Node side writes its frames and records;
  - how the reference 0.0.14 is built in the container.
- **The comparison's numbers:** the tolerance value and frame counts beyond those above.
- **The fixtures** for the pytest frames: generate the pinball-only frame in the test, or
  commit it.
- **The portability fixes themselves**, within the policy under Build.
