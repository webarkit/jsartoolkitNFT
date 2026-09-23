# Multi-NFT-marker: design

**Date:** 2026-09-22
**Baseline:** `dev` @ `7c25965` (1.12.0), WebARKitLib @ `28735ee`
**Issues:** #635, #631, #613, #611 — **#612 explicitly out of scope**

Builds on `specs/2026-09-22-multi-marker-plan.md`, which remains the record of *evidence*;
this document is the record of *decisions*.

## Intent

Let an application load several NFT markers and have all of them tracked at the same time,
with markers picked up as they enter the frame and released individually as they leave.
Today exactly one marker can be tracked, and once it is, detection stops entirely.

Success means: with N markers loaded and several visible, `getNFTMarker` fires for each
visible marker every frame with its own pose, and `lostNFTMarker` fires for each marker
independently as it disappears — without a breaking change to the public JS API.

## Decisions taken

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Full stack in one spec: WebARKitLib matcher **and** the JS-facing layer | `query()`'s new return shape determines what `detectedPage` can become; splitting them designs the interface twice |
| Runtime model | Track N simultaneously, **detect continuously** | Detecting only when idle never picks up a marker that arrives while another is held |
| KPM cadence | Adaptive throttle on the **main loop** — not the tracking thread | Keeps the feature working in the non-threaded targets; the thread stays an option, not a prerequisite |
| Threaded (`_td`) target | In scope, but **phased last** | Its thread API is single-page by signature; that risk should not block the non-threaded path |
| #612 incremental loading | Out of scope | Independent, and its WIP commit `5609a26` is not on this machine |
| Branch base | `feat/multi-nft-marker` off `dev` | Not built on the parked `WebARKit/NFT` relocation |

## Two corrections to the prior plan

The plan models this as "#635 unblocks a scalar". Reading the code at 1.12.0 shows two
further blockers it does not account for. Both are load-bearing.

**1. Detection is gated off entirely once anything is tracked.**
`emscripten/ARToolKitNFT_js.cpp:143` wraps the whole KPM call in
`if (this->detectedPage == -2)`. So even with #635 delivering N results, KPM never runs
again after the first successful frame until tracking is lost. **#635 alone buys nothing
here.** The gate is a second, independent single-marker assumption living in the same
function as the scalar.

**2. The `_td` variant is a different architecture, not a copy.**
`emscripten/ARToolKitNFT_js_td.cpp:163` has its entire `detectNFTMarker()` body commented
out and returns `-1` unconditionally. Detection happens instead inside `getNFTMarkerInfo`
as a three-state machine on `detectedPage` (`-2` start → `-1` awaiting → `>=0` tracking),
driven by the worker. `detectedPage` is therefore overloaded as *both* page index and
detection state. And the worker interface is single-page by signature —
`emscripten/trackingSub.h`:

```c
int trackingInitGetResult(THREAD_HANDLE_T *threadHandle, float trans[3][4], int *page);
```

One `int *page`, one `trans`. The multi-result work of Phase 2 stops at that boundary.

## Design

### Native matcher (WebARKitLib)

`VisualDatabase::query()` holds one winner across three members — `mMatchedId`,
`mMatchedInliers`, `mMatchedGeometry` — and keeps a running maximum at
`lib/SRC/KPM/FreakMatcher/matchers/visual_database-inline.h:340`:

```cpp
if(inliers.size() >= mMinNumInliers && inliers.size() > mMatchedInliers.size()) {
    CopyVector9(mMatchedGeometry, H);
    mMatchedInliers.swap(inliers);
    mMatchedId = it->first;
}
```

Collapse those three scalars into one `std::map<id_t, Match>`, where `Match` carries the
inliers and geometry currently held loose. `query()` inserts an entry for every reference
image clearing the threshold rather than overwriting a maximum.

`matchedId()`, `inliers()` and `matchedGeometry()` (`visual_database.h:151-161`) stay,
returning the best entry — they have callers outside this path, and preserving them keeps
the change additive. Add `matches()` for the new consumer.

`kpmMatching.cpp:642` then loops that collection instead of reading one `matchedId()`. The
surrounding code already works per image id — `get3DFeaturePoints(matched_image_id)`,
`pageIDs[matched_image_id]`, and a `result[]` array indexed by page — so the loop body is
close to what is already written.

The commented-out per-page loop at `kpmMatching.cpp:664-684` **cannot** be revived as-is:
it calls `matchedId()` *inside* the loop and so hands every page the same id. Delete it
rather than adapt it.

### Rejection threshold (#631)

The measured failure is that kuva false-positives against the pinball photograph, in both
node and browser builds, whether or not pinball is also loaded. The floor it clears is
`visual_database-inline.h:55`:

```cpp
static const int kMinNumInliers = 8;
```

Error thresholding cannot fix this: kuva scores **1.688** against the pinball photo, a
*better* error than pinball's own true match at **6.30**. An inlier ratio against the
reference image's own feature count is the right primary signal.

**Retain the absolute floor as well; do not replace it.** Reference images range from 636
feature points down to 6. On a 6-point reference a pure ratio is meaningless — two inliers
is 33%. Both tests must pass.

**Risk, stated plainly.** The browser row is the tight one: kuva scores 35 inliers against
pinball while pinball's own true match scores 33 — the false positive currently *wins* on
the exact quantity being thresholded. A ratio changes the denominator and may separate
them, but **there may be no constant that does.** Measure before choosing a number, and
treat "no clean separator exists" as a real outcome that escalates to needing a second
signal rather than a better constant. This is why Phase 1 lands alone.

### Native binding layer

In `emscripten/ARToolKitNFT_js.h`:

- `int detectedPage` (`:110`) → per-marker state array, sized by the existing
  `PAGES_MAX = 20` (`:19`), keeping the `-2`/`-1` sentinels **per marker** rather than
  globally.
- `ARFilterTransMatInfo *ftmi` (`:85`) → one filter per marker. A single filter fed by N
  markers' poses produces meaningless smoothing.

The gate at `ARToolKitNFT_js.cpp:143` becomes the adaptive throttle: run KPM when at least
one loaded marker is **not** currently tracked, skip it when all are, throttled to every N
frames otherwise. `kpmSetMatchingSkipPage` (already used at `kpmMatching.cpp:348`) excludes
already-tracked pages, so each KPM pass gets cheaper as more markers are held — the right
cost curve. N is tunable; pick a default by measurement, not taste.

> **Correction, 2026-09-23.** The "cheaper as more markers are held" claim above is false in the
> FREAK (binary) path this port uses. `kpmMatching()` still extracts the frame's features, and
> `freakMatcher->query()` still matches them against every keyframe, tracked pages included;
> `skipF` only skips the pose computation for a skipped page afterwards. A pass costs about the
> same however many markers are held. And the throttle ended up measured in time, not frames: see
> "Detection policy (decided 2026-09-23)" below.

`getNFTMarkerInfo(markerIndex)` already takes an index and returns `found`/`pose`, so its
signature is unchanged — only its internal guard moves from the shared scalar to that
marker's own state.

### JS layer

The public API needs **no breaking change**. `ARControllerNFT.process()` already loops all
markers and dispatches `getNFTMarker` with an `index`. Two fixes, in each controller:

- `nftMarkerFound` (`ARControllerNFT.ts:72`, declared `boolean` but assigned a marker
  *index* at `:338`) and the single `nftMarkerFoundTime` become a per-index map, so
  `lostNFTMarker` fires per marker and its `MARKER_LOST_TIME` grace period is tracked
  independently. This closes #611. The existing comment at the lost-branch — *"for now
  this marker found/lost events handling is for one marker at a time"* — marks the exact
  spot.
- `transform_mat` (`:142`) and `transformGL_RH` are single instance fields reused across
  loop iterations, so when N markers are found in one frame every dispatched event hands
  consumers **the same mutating reference**. Correct at dispatch, wrong a moment later.
  Each dispatch needs its own matrix. *(Not listed in the prior plan.)*

Because both changes are additive, #613 and #611 close without a major version bump.

### Variant rollout

The same scalars exist in parallel copies, and fixing one is how this silently regresses:

| Layer | Files |
|---|---|
| Native | `ARToolKitNFT_js.cpp`, `ARToolKitNFT_js_td.cpp` |
| TS | `ARControllerNFT.ts`, `ARControllerNFT_simd.ts`, `ARControllerNFT_td.ts` |

"Lands in every variant" is an acceptance criterion, not a follow-up. The three TS
controllers are near-identical; whether to fix the loop three times or extract it once is
left to the implementation plan, but doing it three times without noting the duplication is
not acceptable.

## Phases

Each phase is independently verifiable and lands on its own.

1. **#631 threshold** — WebARKitLib. Ratio plus retained floor, measured against the
   recorded node/browser numbers. Un-skips the two `detection.test.ts` tests. Lands alone
   because it is the one phase that can fail outright.
2. **#635 multi-result** — WebARKitLib. `query()` collects; `kpmMatching` writes per page.
   No externally observable change yet; verified via the `Page[%d] pre:` INFO logs, which
   print without a `--debug-logs` build.
3. **Submodule bump + multi-marker** — this repo, main + simd. Per-marker `detectedPage`
   and `ftmi`, throttled gate, per-marker lost events, per-dispatch matrices. #613 and #611
   close here.
4. **`_td`** — widen `trackingInitGetResult` to carry N pages; revive `detectNFTMarker`.

Phases 1 and 2 land in WebARKitLib first and arrive here via a submodule bump — the same
route as WebARKitLib#67 → #633.

## Acceptance

- `tests/vitest/detection.test.ts:146` and `:163` un-skipped and passing (Phase 1).
- All of Phases 1–3 verified against `examples/node/example_dist.js`. `npm test` alone
  proves little — the Karma suite never loads a marker.
- A new test asserting two markers tracked simultaneously, and each emitting
  `lostNFTMarker` independently. No such test exists today.
- The feature demonstrably works in main, simd **and** `_td` builds by end of Phase 4.

`tests/vitest/incremental-markers.test.ts` stays skipped — that is #612.

## Process constraints

**Rebuild before testing.** CI runs against the committed `build/` artifacts, so a change
under `emscripten/` or `tools/makem.js` passes against stale WASM unless rebuilt and
committed on the branch. A regression shipped exactly this way in 1.10.1.

**Never write `fix`/`fixes`/`closes` next to an issue number unless you mean it.** Two
issues in this set were already closed by accident by commit messages that merely mentioned
them — GitHub's parser understands neither negation nor future tense. Use `Refs #N`.

## Known context

The `WebARKit/NFT` source relocation — moving `lib/SRC/KPM` to `WebARKit/NFT` under a
`webarkit::nft` namespace — is parked on `feature-NFT-WebARKitLib` (`d3f0489`) and
WebARKitLib `feat-NFT` (`da96f12`), and is deliberately **not** the base for this work. It
moves both files this spec targets, so whichever lands second will need the other ported
across. That cost was accepted in exchange for a clean baseline.

## Measurements (#631), 2026-09-23

WebARKitLib `28735ee`, jsartoolkitNFT `52c318e`.

Instrumentation: a temporary `std::printf("[631] image=%d inliers=%d ref_points=%d
hough=%d\n", ...)` directly after `TIMED("Find Inliers (2)")` in
`visual_database-inline.h`'s `query()`, printing before the existing `mMinNumInliers`
comparison. `db_id` (`image` above) is a global index over every loaded reference image,
assigned in load order: pinball occupies 0–8 (9 images), and when kuva is loaded after it,
kuva occupies 9–22 (14 images); loaded alone, kuva occupies 0–13. `page %d, image num %d,
points - %d` (from `kpmSetRefDataSet`, unchanged) confirms the page a `db_id` belongs to.
Six runs: node (`sharp` decoder) and browser (canvas decoder) × three loaded sets (pinball
alone, kuva alone, both), one frame of `examples/node/pinball-demo.jpg` each. All emitted
`[631]` lines have `inliers >= 8`, so none are excluded by the retained floor.

| decoder | loaded | db_id | marker | inliers | ref_points | hough | ratio_ref | ratio_hough | class |
|---|---|---|---|---|---|---|---|---|---|
| node | pinball | 0 | pinball | 28 | 636 | 33 | 0.044 | 0.848 | true |
| node | pinball | 1 | pinball | 36 | 648 | 41 | 0.056 | 0.878 | true |
| node | pinball | 2 | pinball | 34 | 615 | 38 | 0.055 | 0.895 | true |
| node | pinball | 4 | pinball | 26 | 590 | 33 | 0.044 | 0.788 | true |
| node | kuva | 0 | kuva | 32 | 399 | 36 | 0.080 | 0.889 | false |
| node | kuva | 1 | kuva | 26 | 395 | 32 | 0.066 | 0.813 | false |
| node | kuva | 2 | kuva | 24 | 357 | 35 | 0.067 | 0.686 | false |
| node | pinball+kuva | 0 | pinball | 28 | 636 | 33 | 0.044 | 0.848 | true |
| node | pinball+kuva | 1 | pinball | 36 | 648 | 41 | 0.056 | 0.878 | true |
| node | pinball+kuva | 2 | pinball | 34 | 615 | 38 | 0.055 | 0.895 | true |
| node | pinball+kuva | 4 | pinball | 26 | 590 | 33 | 0.044 | 0.788 | true |
| node | pinball+kuva | 9 | kuva | 32 | 399 | 36 | 0.080 | 0.889 | false |
| node | pinball+kuva | 10 | kuva | 26 | 395 | 32 | 0.066 | 0.813 | false |
| node | pinball+kuva | 11 | kuva | 24 | 357 | 35 | 0.067 | 0.686 | false |
| browser | pinball | 0 | pinball | 23 | 636 | 32 | 0.036 | 0.719 | true |
| browser | pinball | 1 | pinball | 29 | 648 | 40 | 0.045 | 0.725 | true |
| browser | pinball | 2 | pinball | 33 | 615 | 39 | 0.054 | 0.846 | true |
| browser | pinball | 4 | pinball | 27 | 590 | 34 | 0.046 | 0.794 | true |
| browser | kuva | 0 | kuva | 35 | 399 | 36 | 0.088 | 0.972 | false |
| browser | kuva | 1 | kuva | 26 | 395 | 31 | 0.066 | 0.839 | false |
| browser | kuva | 2 | kuva | 26 | 357 | 36 | 0.073 | 0.722 | false |
| browser | pinball+kuva | 0 | pinball | 23 | 636 | 32 | 0.036 | 0.719 | true |
| browser | pinball+kuva | 1 | pinball | 29 | 648 | 40 | 0.045 | 0.725 | true |
| browser | pinball+kuva | 2 | pinball | 33 | 615 | 39 | 0.054 | 0.846 | true |
| browser | pinball+kuva | 4 | pinball | 27 | 590 | 34 | 0.046 | 0.794 | true |
| browser | pinball+kuva | 9 | kuva | 35 | 399 | 36 | 0.088 | 0.972 | false |
| browser | pinball+kuva | 10 | kuva | 26 | 395 | 31 | 0.066 | 0.839 | false |
| browser | pinball+kuva | 11 | kuva | 26 | 357 | 36 | 0.073 | 0.722 | false |

- ratio_ref: T = 0.054 (33/615, browser pinball's own best match), F = 0.088 (35/399, browser
  kuva against the pinball photo) → does not separate (F > T)
- ratio_hough: T = 0.846 (33/39, browser pinball), F = 0.972 (35/36, browser kuva) → does not
  separate (F > T)
- **Decision: no inlier ratio separates the two, and none should.**
  `examples/node/pinball-demo.jpg` is a photo of a printed sheet carrying **both** targets:
  pinball is the left print, kuva — the room with plants and a square ARToolKit marker,
  `kuva.iset`'s embedded 640x480 reference JPEG — is the right print, rotated 90°. Kuva's
  matches are true detections, not false positives: that is why kuva matches at three
  consistent scales, with more inliers, a higher ratio, and a lower pose error than pinball.
  **#631 is not a matcher defect.** The "only pinball is in the image" premise of the #631
  tests was wrong. No threshold is added — the ratio work above stops here, and Task 2 of
  the implementation plan (adding a `kMinInlierRatio` constant) is dropped. The two #631
  tests in `tests/vitest/detection.test.ts` are to be rewritten to expect **both** markers
  found, once multi-marker tracking lands. Consequence for the rest of this spec:
  `pinball-demo.jpg` is itself a two-marker frame, which makes it a useful fixture for the
  multi-marker acceptance tests in the Phases below rather than a single-marker one.

## Implementation notes

Found while planning or executing `specs/2026-09-23-multi-nft-marker-implementation-plan.md`, and
folded into the implementation:

- **#631 was not a matcher defect.** `examples/node/pinball-demo.jpg` photographs a printed sheet
  carrying both targets — pinball on the left, kuva on the right, rotated 90° — so kuva's matches
  are true detections (see "Measurements (#631)"). No inlier-ratio threshold was added (plan Task 2
  dropped). The two #631 tests now expect both markers, and the photo serves as the suite's
  two-marker frame; its "pinball only" variant paints the kuva print out.
- **One page is several database entries** — one FREAK keyframe per (page, image scale).
  `kpmMatching` keeps the best-supported entry per page.
- **Tracking moved out of `getNFTMarkerInfo`** into `detectNFTMarker`, once per frame; the getter is
  a pure read with an unchanged signature.
- **Only `transform_mat` was shared between events**; `arglCameraViewRHf` already returned a fresh
  matrix. A side effect of the fix: `getTransformationMatrix()` now returns a new array each frame a
  marker is found, instead of one array mutated in place.
- **`addNFTMarkers` is now bounded by `PAGES_MAX` in total**, not per call, in both the default and
  threaded bindings, because the new per-marker arrays are indexed by the running marker count. The
  threaded binding returns an empty result instead of calling `exit()`.
- **The threaded getter reported every index as found** whenever any page was tracked; fixed by the
  same restructure.
- **A fourth TS controller, `ARControllerNFT_node.ts`,** got the same per-marker lost events.
- **Not covered: the Node package's native binding.** `dist/ARToolkitNFT_node.js` is built from the
  legacy `emscripten/ARToolKitJS.cpp`, which still tracks one page natively. Porting it is follow-up
  work.

## KPM cost of an unseen marker, 2026-09-23

Median / p90 ms per `process()` with pinball tracked (2000x1500 frame, pinball-only view), with and
without a second, unseen marker (kuva) loaded:

```
[kpm-cost] loaded=[/examples/DataNFT/pinball] median=8.1ms p90=8.7ms
[kpm-cost] loaded=[/examples/DataNFT/pinball, /examples/DataNFT/kuva] median=326.8ms p90=346.6ms

[kpm-cost] loaded=[/examples/DataNFT/pinball] median=9.2ms p90=10.3ms
[kpm-cost] loaded=[/examples/DataNFT/pinball, /examples/DataNFT/kuva] median=324.8ms p90=345.7ms

[kpm-cost] loaded=[/examples/DataNFT/pinball] median=8.4ms p90=9.9ms
[kpm-cost] loaded=[/examples/DataNFT/pinball, /examples/DataNFT/kuva] median=332.4ms p90=348.6ms
```

Ratio median([pinball, kuva]) / median([pinball]), per run: 40.3, 35.3, 39.6.

Shipped `kKpmIntervalFrames = 1` (plan default: a marker entering view is found on the next frame).
Whether to raise it is left to the maintainer, given the numbers above.

> **Superseded, 2026-09-23:** the frame-count throttle was replaced by a time-based one; see
> "Detection policy (decided 2026-09-23)".

## Detection policy (decided 2026-09-23)

The numbers above made the "every frame" default untenable: with several markers loaded and one
in view — the common case — every frame paid a full KPM pass (~320 ms at 2000x1500, ~40x the
tracking-only frame) where 1.12.0 had stopped detecting. The final branch review laid out the
options, and the maintainer chose "throttled, with an opt-out":

- **While no marker is tracked:** detect on every frame, as in 1.12.0.
- **While at least one marker is tracked and at least one loaded marker is not:** detect at most
  once per interval, measured in **time** (milliseconds), not frames, so the cost does not depend
  on the frame rate.
- **While every loaded marker is tracked:** do not detect (unchanged).

Two runtime setters on every controller:

- `setContinuousDetection(enabled)`, default `true`. With `false`, once any marker is tracked no
  detection runs until tracking is lost: exactly the 1.12.0 behaviour.
- `setDetectionInterval(ms)`, the interval above; `0` means every frame, negative values count as
  `0`.

Defaults: **300 ms** in the default and SIMD builds (`ARToolKitNFT_js.{h,cpp}`: members
`continuousDetection`, `detectionIntervalMs`, `lastKpmTimeMs`, timed with `emscripten_get_now()`;
the frame counter `kKpmIntervalFrames` is gone). **0** in the threaded build
(`ARToolKitNFT_js_td.{h,cpp}`), whose default behaviour is unchanged: it already detects on a
worker, one search at a time, off the main thread. It applies the same gate to *starting* a worker
search — collecting a finished one is never throttled — so an app can set an interval there to
save worker CPU. The Node controller has both setters for API parity; its legacy single-marker
binding (`ARToolKitJS.cpp`) always behaves as `setContinuousDetection(false)`, so they only log a
one-time warning.

A pass still costs the full detection time on the frame where it runs; the interval bounds how
often that happens, not how long it takes. See the measurements below.

**`kpmSetProcMode(KpmProcHalfSize)` is not a safe way to cut that cost.** In the FREAK (binary)
path, `kpmMatching()` resizes the luma buffer but still calls `freakMatcher->query(imageLuma, xsize,
ysize)` with the *full-size* dimensions, and the pose is computed from
`getQueryFeaturePoints()` — the unscaled query points — rather than from the rescaled
`inDataSet.coord`. Both are wrong for any mode other than `KpmProcFullSize`. Fixing that is
WebARKitLib work, out of scope here.

## Detection cost at camera sizes, 2026-09-23

Harness: `tests/vitest/kpm-cost.test.ts` (committed as `describe.skip`; its header says how to run
it). Default build, Chromium via Playwright, frames drawn from `examples/node/pinball-demo.jpg`
with `loadCompositeFrames(scale)`, kuva painted out (`pinballOnly`), pinball tracked. 60
`process()` calls per case, paced at ~30 fps like a camera (the interval is measured in time).
Policy (a) `setDetectionInterval(0)`: a detection pass on every frame while kuva is unseen.
Policy (b) the defaults: continuous detection, 300 ms.

**At 320x240 pinball is not detected at all** (200 frames, either loaded set): the print is too
small in the photo. Scanning upward, 340x255 (scale 0.17) is the smallest size where it is, so it
stands in for 320x240. Two runs, ms per `process()`:

```
run A
[kpm-cost] 320x240 loaded=[pinball] pinball NOT found in 200 frames
[kpm-cost] 320x240 loaded=[pinball,kuva] pinball NOT found in 200 frames
[kpm-cost] 340x255 loaded=[pinball] interval=0: median=1.8ms p90=2.2ms max=2.7ms (n=60, frames without pinball=0)
[kpm-cost] 340x255 loaded=[pinball] defaults (interval=300): median=1.8ms p90=2.1ms max=3.5ms (n=60, frames without pinball=0)
[kpm-cost] 340x255 loaded=[pinball,kuva] interval=0: median=34.6ms p90=37.5ms max=40.6ms (n=60, frames without pinball=0)
[kpm-cost] 340x255 loaded=[pinball,kuva] defaults (interval=300): median=1.8ms p90=33.5ms max=38.1ms (n=60, frames without pinball=0)
[kpm-cost] 640x480 loaded=[pinball] interval=0: median=2.2ms p90=2.6ms max=3.4ms (n=60, frames without pinball=0)
[kpm-cost] 640x480 loaded=[pinball] defaults (interval=300): median=2.3ms p90=2.7ms max=3.5ms (n=60, frames without pinball=0)
[kpm-cost] 640x480 loaded=[pinball,kuva] interval=0: median=75.2ms p90=83.8ms max=85.3ms (n=60, frames without pinball=0)
[kpm-cost] 640x480 loaded=[pinball,kuva] defaults (interval=300): median=2.4ms p90=76.5ms max=85.2ms (n=60, frames without pinball=0)

run B
[kpm-cost] 320x240 loaded=[pinball] pinball NOT found in 200 frames
[kpm-cost] 320x240 loaded=[pinball,kuva] pinball NOT found in 200 frames
[kpm-cost] 340x255 loaded=[pinball] interval=0: median=1.8ms p90=2.2ms max=2.5ms (n=60, frames without pinball=0)
[kpm-cost] 340x255 loaded=[pinball] defaults (interval=300): median=1.8ms p90=2.0ms max=2.1ms (n=60, frames without pinball=0)
[kpm-cost] 340x255 loaded=[pinball,kuva] interval=0: median=35.0ms p90=38.1ms max=40.0ms (n=60, frames without pinball=0)
[kpm-cost] 340x255 loaded=[pinball,kuva] defaults (interval=300): median=1.9ms p90=34.4ms max=37.7ms (n=60, frames without pinball=0)
[kpm-cost] 640x480 loaded=[pinball] interval=0: median=2.2ms p90=2.5ms max=2.9ms (n=60, frames without pinball=0)
[kpm-cost] 640x480 loaded=[pinball] defaults (interval=300): median=2.3ms p90=2.4ms max=3.8ms (n=60, frames without pinball=0)
[kpm-cost] 640x480 loaded=[pinball,kuva] interval=0: median=83.1ms p90=92.9ms max=104.8ms (n=60, frames without pinball=0)
[kpm-cost] 640x480 loaded=[pinball,kuva] defaults (interval=300): median=2.4ms p90=75.7ms max=86.2ms (n=60, frames without pinball=0)
```

Reading it:

- With only the visible marker loaded, nothing is detected and a frame costs ~2 ms at both sizes.
- With an unseen marker loaded and detection on every frame, a frame costs ~35 ms at 340x255 and
  ~75-83 ms at 640x480 — over one 30 fps frame budget (33 ms) even at the smallest usable size.
- With the 300 ms default, the median frame is back to ~2 ms; a pass still lands about once per
  300 ms (roughly every ninth frame at 30 fps), which is what the p90 and max show — the cost of a
  pass is unchanged, only how often it runs.
- Intermediate sizes from the same session (one run each, same harness): 400x300 58 ms, 480x360
  78 ms, 560x420 95 ms median per frame with detection every frame; ~2 ms median with the
  default.
