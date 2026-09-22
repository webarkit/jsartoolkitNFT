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
