# Multi-NFT-marker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track several NFT markers at once — each detected as it enters the frame, each tracked with its own pose, each reported lost on its own — in the default, SIMD and threaded builds, without breaking the public JS API.

**Architecture:** Two repositories. In WebARKitLib (the `emscripten/WebARKitLib` submodule) the FREAK matcher stops keeping a single best match: it rejects weak matches with an inlier-ratio test (#631) and returns every match that survives (#635), and `kpmMatching` writes one pose per matched page. In this repo the native binding replaces its single `detectedPage`/`ftmi` pair with a per-marker state array, runs KPM only while some marker is untracked, and moves per-frame tracking out of the `getNFTMarker` getter into `detectNFTMarker`. The TS controllers replace their single found-index/timestamp with a per-marker lost tracker and hand every event its own matrix.

**Tech Stack:** C/C++ compiled with Emscripten via `tools/makem.js`; TypeScript bundled by webpack; Vitest in Playwright Chromium (`vitest.config.ts`); Node + `sharp` for `examples/node`.

**Spec:** `specs/2026-09-22-multi-nft-marker-design.md` (decisions), backed by `specs/2026-09-22-multi-marker-plan.md` (evidence). Read both before starting.

## Global Constraints

- Base branches: this repo `feat/multi-nft-marker` (off `dev` @ `7c25965`, version 1.12.0); WebARKitLib `feat/multi-nft-marker` off WebARKitLib `origin/dev` (which contains `28735ee`).
- Network: plain `git fetch` fails on this machine with an SSL error. Use `git -c http.sslBackend=schannel <cmd>`, or set it once with `git config --global http.sslBackend schannel`.
- Scope: #635, #631, #613, #611. **#612 is out of scope** — `tests/vitest/incremental-markers.test.ts` stays skipped.
- Public JS API: no breaking change. `getNFTMarker` / `lostNFTMarker` event payloads keep the keys `index`, `type`, `marker`, `matrix`, `matrixGL_RH`; `getNFTMarker(i)` keeps returning `{ id, error, found, pose }`, or `-3` (`MARKER_INDEX_OUT_OF_BOUNDS`) for a bad index.
- `PAGES_MAX = 20` bounds every per-marker array.
- **Rebuild before testing.** CI runs against the committed `build/` and `dist/` artifacts. Any commit here that changes `emscripten/`, `tools/makem.js` or the submodule pointer must include the rebuilt `build/` and `dist/` in the same commit (`npm run build` — or `npm run build-docker` — then `npm run build-ts`). A regression shipped in 1.10.1 because this was skipped.
- `npm test` alone proves little (Karma never loads a marker). Verification means `npx vitest run` plus `npm run test-node-example`.
- **Commit messages never put `fix`, `fixes` or `closes` next to an issue number.** Use `Refs #N` here and `Refs webarkit/jsartoolkitNFT#N` in WebARKitLib. Two issues in this set were already auto-closed by accident.
- Pushing branches and opening PRs is not part of this plan. Stop and ask before any push.
- Every commit ends with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Refinements to the spec found while planning

Reading the code in detail changed five points. Each is folded into the tasks below, and Task 7 writes them back into the design spec.

1. **One page is several database entries.** `kpmSetRefDataSet` registers one FREAK keyframe per (page, image scale) — `kpmMatching.cpp:274-297` — so several `db_id`s map to one page. Collecting "every match" yields several per page; `kpmMatching` must keep the best **per page** (Task 3).
2. **After #635, a #631 false positive becomes a phantom marker.** Today kuva has to *beat* pinball to be reported. Once every match is reported, it only has to clear the threshold. Task 1's separability rule therefore demands that *every* wrong-image match falls below the threshold, not merely that the right one wins.
3. **Only `transform_mat` is shared between events.** `arglCameraViewRHf` already allocates a fresh `Float64Array` per call (`ARControllerNFT.ts:549-556`), so `transformGL_RH` is not the problem the spec says it is (Task 5).
4. **Tracking moves out of the getter.** Today `getNFTMarkerInfo(i)` runs `ar2TrackingMod` itself, so every extra `getNFTMarker(i)` call tracks again. With N markers the per-frame work belongs in `detectNFTMarker()`, which `process()` calls once per frame; `getNFTMarkerInfo(i)` becomes a pure read. Its signature does not change (Task 4, Task 6).
5. **The threaded getter reports every index as found.** `ARToolKitNFT_js_td.cpp:122` sets `found: 1` for *any* `markerIndex` whenever *some* page is tracked — with two markers loaded both report found, with the same pose. Task 6 fixes it as part of the restructure.

Also: `ARControllerNFT` has **no `dispose()`** method (the tests' `ar?.dispose?.()` is a no-op), and `initWithDimensions`' 4th argument is `internalLuma`, not filtering — filtering is toggled with `ar.setFiltering(bool)`.

## Review Focus

Failure modes the spec implies that no task's happy-path tests would catch, most likely first. Each has a pinning test in the task named.

1. **A loaded marker that never appears makes KPM run every frame.** Today KPM stops once one marker is tracked; after this change it keeps running while any marker is untracked. Expected: a cost that is measured and bounded, not discovered by users — Task 7 measures it and the user picks `kKpmIntervalFrames`.
2. **Several `db_id`s of one page producing duplicate results/events.** Expected: exactly one `getNFTMarker` event per marker per `process()` — pinned in Task 4 ("fires getNFTMarker exactly once for each marker").
3. **A marker lost and re-acquired.** Expected: `lostNFTMarker` fires again on the second loss — pinned in Task 5 unit test ("reports a marker lost again after it was re-acquired").
4. **A negative or too-large marker index.** With per-marker arrays, `markerStates[-1]` would be undefined behaviour. Expected: `getNFTMarker(-1)` and `getNFTMarker(count)` return `-3` — pinned in Task 4.
5. **Filtering on vs. off.** Per-marker filters exist only when filtering is enabled, and the existing tests never switch it. Expected: both modes track both markers — Task 4's multi-marker suite runs with `setFiltering(true)` and `setFiltering(false)`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/matchers/visual_database-inline.h` | Inlier-ratio rejection (#631); collect every surviving match (#635) | 2, 3 |
| `emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/matchers/visual_database.h` | `minInlierRatio` setter/getter; `matches()` accessor + member | 2, 3 |
| `emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/matchers/matcher_types.h` | `image_match_t` / `image_matches_t` — one verified match per reference image | 3 |
| `emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/facade/visual_database_facade.{h,cpp}` | Expose `matches()` across the pimpl boundary | 3 |
| `emscripten/WebARKitLib/lib/SRC/KPM/kpmMatching.cpp` | One pose per matched page, best `db_id` per page; delete dead loop | 3 |
| `emscripten/NFTMarkerState.h` (new) | Per-marker tracking state shared by both native bindings | 4 |
| `emscripten/ARToolKitNFT_js.{h,cpp}` | Per-marker detection + tracking (default and SIMD builds) | 4 |
| `emscripten/trackingSub.{h,c}` | Worker returns every matched page, not the single best | 6 |
| `emscripten/ARToolKitNFT_js_td.{h,cpp}` | Per-marker detection + tracking (threaded build) | 6 |
| `src/MarkerLostTracker.ts` (new) | Per-marker "lost after grace period" bookkeeping — pure, unit-testable | 5 |
| `src/ARControllerNFT.ts`, `src/ARControllerNFT_simd.ts`, `src/ARControllerNFT_td.ts` | Use the tracker; fresh matrix per event | 5 |
| `tests/vitest/frames.ts` (new) | Two-marker composite frames; `processUntil` helper | 4 |
| `tests/vitest/variants.ts` (new) | The build variants a suite runs against | 4, 6 |
| `tests/vitest/multi-marker.test.ts` (new) | Acceptance suite for simultaneous tracking | 4, 5, 6 |
| `tests/vitest/marker-lost-tracker.test.ts` (new) | Unit tests for `MarkerLostTracker` | 5 |
| `tests/vitest/detection.test.ts` | Un-skip the two #631 tests; correct the stale diagnosis | 2 |
| `vitest.config.ts` | Cross-origin isolation headers for the threaded build | 6 |

The three TS controllers are near-identical copies (`diff` shows 10 and 6 differing lines, none in `process()`). This plan pulls the new bookkeeping into `MarkerLostTracker` so each controller's change is a small, identical edit; merging the controllers themselves is a separate refactor and out of scope.

---

### Task 1: Measure whether #631 has a separating threshold

This task changes no production code. It answers the question the spec flagged as the main risk: is there any inlier ratio that rejects kuva-on-the-pinball-photo while keeping pinball-on-pinball, under **both** the Node (`sharp`) and browser (canvas) JPEG decoders? The only committed output is a measurements section in the design spec.

**Files:**
- Temporary (never committed): `emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/matchers/visual_database-inline.h`, `examples/node/measure_631.js`, `tests/vitest/measure-631.test.ts`
- Modify: `specs/2026-09-22-multi-nft-marker-design.md` (append measurements)

**Interfaces:**
- Consumes: nothing.
- Produces: a decision recorded in the design spec — `DENOMINATOR` (`ref_points` or `hough`) and `kMinInlierRatio` (a float literal) — that Task 2 uses verbatim. Or a STOP.

- [ ] **Step 1: Create the WebARKitLib working branch**

```bash
cd emscripten/WebARKitLib
git -c http.sslBackend=schannel fetch origin
git merge-base --is-ancestor 28735ee origin/dev && echo "origin/dev contains 28735ee"
git checkout -b feat/multi-nft-marker origin/dev
cd ../..
```

Expected: `origin/dev contains 28735ee`, then `Switched to a new branch 'feat/multi-nft-marker'`. If the ancestry check prints nothing, stop and report — the submodule history differs from what this plan assumes.

- [ ] **Step 2: Add temporary instrumentation (do not commit)**

In `visual_database-inline.h`, add `#include <cstdio>` below the existing `#include <matchers/visual_database.h>`. Then, in `query(const keyframe_t*)`, directly after the `TIMED("Find Inliers (2)") { ... }` block and before the `if(inliers.size() >= mMinNumInliers && ...` line (currently line 340), add:

```cpp
            std::printf("[631] image=%d inliers=%d ref_points=%d hough=%d\n",
                        (int)it->first, (int)inliers.size(),
                        (int)it->second->store().size(), (int)hough_matches.size());
```

`it->first` is the `db_id`. The existing `ARLOGi("page %d, image num %d, points - %d")` line in `kpmSetRefDataSet` prints the `db_id` → page order as markers load, in the same order `db_id` is assigned (0, 1, 2 …).

- [ ] **Step 3: Build**

```bash
npm ci
npm run build
npm run build-ts
```

Expected: both finish without errors; `build/artoolkitNFT_ES6_wasm.js` and `dist/ARToolkitNFT_node.js` have fresh timestamps.

- [ ] **Step 4: Write the Node measurement script (do not commit)**

Create `examples/node/measure_631.js`:

```js
// Throwaway: prints the [631] lines for one set of markers against the pinball photo.
// Usage (from examples/node): node measure_631.js DataNFT/pinball DataNFT/kuva
const jsartoolkitNFT = require('../../dist/ARToolkitNFT_node.js')
const sharp = require('sharp')

async function main() {
    const markers = process.argv.slice(2)
    if (markers.length === 0) throw new Error('pass one or more marker paths')
    const controller = await new jsartoolkitNFT.ARControllerNFT(2000, 1500, '/camera_para.dat')
    const ar = await controller._initialize()
    const data = await sharp('pinball-demo.jpg').ensureAlpha().raw().toBuffer()
    const imageData = new Uint8Array(data.buffer)
    console.log(`=== node, loaded: [${markers.join(', ')}]`)
    ar.loadNFTMarkers(markers, function (ids) {
        ids.forEach((id) => ar.trackNFTMarkerId(id))
        ar.process(imageData) // one frame is one KPM pass
        process.exit(0)
    }, function (err) {
        console.error('loadNFTMarkers failed', err)
        process.exit(1)
    })
}

main()
```

- [ ] **Step 5: Run the Node measurements**

```bash
cd examples/node
ls DataNFT
node measure_631.js DataNFT/pinball
node measure_631.js DataNFT/kuva
node measure_631.js DataNFT/pinball DataNFT/kuva
cd ../..
```

If `ls DataNFT` does not list both `pinball.*` and `kuva.*`, use `../DataNFT/pinball` and `../DataNFT/kuva` instead. Save the full output of each run.

- [ ] **Step 6: Write the browser measurement test (do not commit)**

Create `tests/vitest/measure-631.test.ts`:

```ts
import { describe, it } from "vitest";
import { ARControllerNFT } from "../../src/index";
import { CAMERA_PARAM, MARKER_PINBALL, MARKER_KUVA, loadMarkers } from "./helpers";

// Throwaway: prints the [631] lines for each marker set against the pinball photo.
async function pinballPhoto(): Promise<ImageData> {
  const bitmap = await createImageBitmap(
    await (await fetch("/examples/node/pinball-demo.jpg")).blob(),
  );
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

describe("#631 measurement", () => {
  for (const set of [[MARKER_PINBALL], [MARKER_KUVA], [MARKER_PINBALL, MARKER_KUVA]]) {
    it(`browser, loaded: [${set.join(", ")}]`, async () => {
      const frame = await pinballPhoto();
      const ar: any = await ARControllerNFT.initWithDimensions(2000, 1500, CAMERA_PARAM, true);
      const ids = await loadMarkers(ar, set);
      ids.forEach((id) => ar.trackNFTMarkerId(id));
      console.log(`=== browser, loaded: [${set.join(", ")}]`);
      ar.process(frame); // one frame is one KPM pass
    }, 150_000);
  }
});
```

- [ ] **Step 7: Run the browser measurements**

```bash
npx vitest run tests/vitest/measure-631.test.ts
```

Expected: 3 passing tests, with `[631]` and `page %d, image num %d` lines in the console output under each `=== browser` header. Save the output.

- [ ] **Step 8: Tabulate and apply the separability rule**

From the `page … image num … points` lines, map every `db_id` to its marker. For each of the 6 runs (node/browser × 3 marker sets), list every `[631]` line as: decoder, loaded set, `db_id`, marker, inliers, `ref_points`, `hough`, `ratio_ref = inliers / ref_points`, `ratio_hough = inliers / hough`.

Classify each line: the photo shows pinball, so a line is **true** if its `db_id` belongs to pinball and **false** if it belongs to kuva. Only lines with `inliers >= 8` matter (the retained floor rejects the rest).

For each candidate denominator separately (`ratio_ref`, then `ratio_hough`):
- `T` = the smallest, over all runs that loaded pinball, of the **largest** true ratio in that run (the page is found through its best image).
- `F` = the largest false ratio over **all** runs.

The denominator separates iff `F < T`. If both separate, choose the one with the larger `T / F`. Then `kMinInlierRatio = (F + T) / 2`, rounded to 3 decimals.

**If neither separates: STOP.** Record the table (Step 9) and report to the user that #631 needs a second signal, not a constant. Task 2 is then blocked. Tasks 3–6 can still proceed, but three of their tests will stay red while kuva phantom-matches the pinball photo: the two un-skipped #631 tests and Task 5's "reports kuva lost while pinball stays tracked". Do not weaken those tests.

- [ ] **Step 9: Record the measurements in the design spec**

Append to `specs/2026-09-22-multi-nft-marker-design.md`:

```markdown
## Measurements (#631), <date of run>

WebARKitLib `<short sha of HEAD in the submodule>`, jsartoolkitNFT `<short sha>`.

| decoder | loaded | db_id | marker | inliers | ref_points | hough | ratio_ref | ratio_hough | class |
|---|---|---|---|---|---|---|---|---|---|
<one row per [631] line with inliers >= 8>

- ratio_ref: T = <value>, F = <value> → <separates / does not separate>
- ratio_hough: T = <value>, F = <value> → <separates / does not separate>
- **Decision:** DENOMINATOR = `<ref_points | hough>`, `kMinInlierRatio = <value>f` — or: **no separating constant; #631 needs a second signal.**
```

Every `<…>` here is filled with measured values. None may be left in the committed file.

- [ ] **Step 10: Revert the instrumentation and remove the throwaway files**

```bash
git -C emscripten/WebARKitLib checkout -- lib/SRC/KPM/FreakMatcher/matchers/visual_database-inline.h
rm examples/node/measure_631.js tests/vitest/measure-631.test.ts
git -C emscripten/WebARKitLib status --porcelain
git status --porcelain
```

Expected: submodule status empty. Parent status shows only `M specs/2026-09-22-multi-nft-marker-design.md` plus modified `build/`/`dist/` from the instrumented build (and the known untracked `.agent/`, `build_log*.txt`, `mcp-config.json`, and `emscripten/zlib`'s `zconf.h.included`). Restore the instrumented artifacts: `git checkout -- build dist`.

- [ ] **Step 11: Commit the measurements**

```bash
git add specs/2026-09-22-multi-nft-marker-design.md
git commit -m "doc: record #631 inlier-ratio measurements

Refs #631

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Reject weak matches with an inlier ratio (#631)

**Prerequisite:** Task 1 found a separating denominator. If it did not, skip this task.

**Files:**
- Modify: `emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/matchers/visual_database-inline.h:47-72, 340`
- Modify: `emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/matchers/visual_database.h:164-170`
- Modify: `tests/vitest/detection.test.ts:104-190`
- Modify: submodule pointer `emscripten/WebARKitLib`; rebuilt `build/`, `dist/`

**Interfaces:**
- Consumes: `DENOMINATOR` and `kMinInlierRatio` from the Task 1 record.
- Produces: `VisualDatabase::setMinInlierRatio(float)`, `VisualDatabase::minInlierRatio() const`, member `float mMinInlierRatio`. Task 3's acceptance condition includes this ratio test.

- [ ] **Step 1: Un-skip the two #631 tests and correct the stale diagnosis**

In `tests/vitest/detection.test.ts`, change `it.skip("detects the marker that is in the image, and not the other one"` to `it(` and `it.skip("reports found only for the marker that is present"` to `it(`. Delete the two `// SKIPPED — see #631. …` comment lines above them.

Replace the doc comment above `describe("detection with two markers loaded"` — the one ending *"It is the index mapping that is wrong."* — with:

```ts
/**
 * Detection must pick the *right* marker.
 *
 * Both datasets are loaded with the batch `loadNFTMarkers([a, b])` — the working
 * path; loading across separate calls is what #612 breaks — and the same pinball
 * photograph is pushed through. Only the pinball target is in the image, so id 0
 * should be found and id 1 should not.
 *
 * This used to fail (#631): kuva false-positives against the pinball photograph
 * with 32-35 inliers, clearing the matcher's absolute floor of 8. The index
 * mapping was never at fault. The matcher now also requires the inliers to be a
 * minimum fraction of the matched reference image's features; the measurements
 * behind that threshold are in specs/2026-09-22-multi-nft-marker-design.md.
 */
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/vitest/detection.test.ts
```

Expected: FAIL — `detects the marker that is in the image, and not the other one` fails on `expect(byIndex.get(1) ?? 0).toBe(0)` or `expect(byIndex.get(0) ?? 0).toBeGreaterThan(0)`, and `reports found only for the marker that is present` fails on one of its `found` assertions. (The committed build still has the absolute floor only.) The other tests in the file pass.

- [ ] **Step 3: Add the ratio constant and member**

In `visual_database-inline.h`, directly below `static const int kMinNumInliers = 8;`, add (with the Task 1 value in place of `R`):

```cpp
    // An absolute floor alone is trivially cleared by the wrong image: kuva
    // matches the pinball photograph with 32-35 inliers (#631). Also require the
    // inliers to be a minimum fraction of the matched reference image's
    // features. Both tests must pass: on the smallest reference images a ratio
    // alone would be met by a couple of inliers. Measured in
    // specs/2026-09-22-multi-nft-marker-design.md.
    static const float kMinInlierRatio = Rf;
```

(`Rf` means the measured value written as a float literal, e.g. `0.083f`.)

In the constructor, directly below `mMinNumInliers = kMinNumInliers;`, add:

```cpp
        mMinInlierRatio = kMinInlierRatio;
```

In `visual_database.h`, directly below `inline size_t minNumInliers() const { return mMinNumInliers; }`, add:

```cpp
        /**
         * Set/Get the minimum inliers as a fraction of the reference image's features.
         */
        inline void setMinInlierRatio(float r) { mMinInlierRatio = r; }
        inline float minInlierRatio() const { return mMinInlierRatio; }
```

and directly below the member `size_t mMinNumInliers;`, add:

```cpp
        float mMinInlierRatio;
```

- [ ] **Step 4: Apply the ratio test**

In `query(const keyframe_t*)`, replace

```cpp
            if(inliers.size() >= mMinNumInliers && inliers.size() > mMatchedInliers.size()) {
```

with — if Task 1 chose `ref_points`:

```cpp
            const size_t denominator = it->second->store().size();
            const float inlierRatio = denominator > 0 ? (float)inliers.size() / (float)denominator : 0.0f;
            if(inliers.size() >= mMinNumInliers && inlierRatio >= mMinInlierRatio &&
               inliers.size() > mMatchedInliers.size()) {
```

— or, if Task 1 chose `hough`:

```cpp
            const size_t denominator = hough_matches.size();
            const float inlierRatio = denominator > 0 ? (float)inliers.size() / (float)denominator : 0.0f;
            if(inliers.size() >= mMinNumInliers && inlierRatio >= mMinInlierRatio &&
               inliers.size() > mMatchedInliers.size()) {
```

- [ ] **Step 5: Rebuild and run the tests**

```bash
npm run build
npm run build-ts
npx vitest run tests/vitest/detection.test.ts
npm run test-node-example
```

Expected: all tests in `detection.test.ts` PASS, including the two un-skipped ones. The Node example prints `NFT marker detected:` at least once (pinball alone must still be found).

- [ ] **Step 6: Run the full Vitest suite**

```bash
npx vitest run
```

Expected: PASS, with only `incremental-markers.test.ts` (#612) skipped.

- [ ] **Step 7: Commit in WebARKitLib**

```bash
cd emscripten/WebARKitLib
git add lib/SRC/KPM/FreakMatcher/matchers/visual_database-inline.h lib/SRC/KPM/FreakMatcher/matchers/visual_database.h
git commit -m "feat(kpm): require a minimum inlier ratio as well as the absolute floor

A floor of 8 inliers is cleared by the wrong image: kuva matches a
photograph of the pinball target with 32-35 inliers. Matches must now
also reach a minimum fraction of the reference image's features.

Refs webarkit/jsartoolkitNFT#631

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
cd ../..
```

- [ ] **Step 8: Commit in this repo (pointer, tests, rebuilt artifacts)**

```bash
git add emscripten/WebARKitLib tests/vitest/detection.test.ts
git add -A build dist
git status --porcelain
git commit -m "feat: reject weak NFT matches so the right marker is found

Bumps WebARKitLib to require a minimum inlier ratio, un-skips the two
detection tests that pin it, and corrects the test's stale diagnosis.
Rebuilt build/ and dist/ included.

Refs #631

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Before committing, `git status --porcelain` must show nothing staged outside `emscripten/WebARKitLib`, `tests/vitest/detection.test.ts`, `build/`, `dist/`.

---

### Task 3: Return every surviving match, one pose per page (#635)

**Files:**
- Modify: `emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/matchers/matcher_types.h`
- Modify: `emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/matchers/visual_database.h`
- Modify: `emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/matchers/visual_database-inline.h:193-347`
- Modify: `emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/facade/visual_database_facade.h:93`, `visual_database_facade.cpp:150-152`
- Modify: `emscripten/WebARKitLib/lib/SRC/KPM/kpmMatching.cpp:637-684`

**Interfaces:**
- Consumes: the ratio test from Task 2 (if Task 2 was skipped, the acceptance condition is the floor alone).
- Produces:
  - `vision::image_match_t { int id; matches_t inliers; float geometry[9]; }`, `vision::image_matches_t = std::vector<image_match_t>`
  - `VisualDatabase::matches() const -> const image_matches_t&`
  - `VisualDatabaseFacade::matches() const -> const image_matches_t&`
  - `kpmMatching` now sets `camPoseF = 0` on **every** matched page's `KpmResult`, one per page. Task 4 consumes this through `kpmGetResult`.
  - Unchanged: `matchedId()`, `inliers()`, `matchedGeometry()` still return the single best match.

This task has no behavioural test of its own: the binding still tracks one page until Task 4. Its proof is the `Page[%d]` log line appearing once for each matched page, and the full existing suite staying green. Task 4's suite is the behavioural test.

- [ ] **Step 1: Add the match types**

In `matcher_types.h`, directly below `typedef std::vector<match_t> matches_t;`, add:

```cpp
    /**
     * One reference image that survived geometric verification against the query.
     */
    struct image_match_t {
        int id;             // reference image id: the db_id passed to addImage()
        matches_t inliers;  // correspondences consistent with `geometry`
        float geometry[9];  // homography, row-major
    }; // image_match_t

    typedef std::vector<image_match_t> image_matches_t;
```

- [ ] **Step 2: Add the accessor and member to `VisualDatabase`**

In `visual_database.h`, directly below `const float* matchedGeometry() const { return mMatchedGeometry; }`, add:

```cpp
        /**
         * @return Every reference image that passed the inlier tests in the last
         * query(), in database order. matchedId()/inliers()/matchedGeometry()
         * still describe the single best of these.
         */
        const image_matches_t& matches() const { return mMatches; }
```

and directly below the member `float mMatchedGeometry[9];`, add:

```cpp
        image_matches_t mMatches;
```

- [ ] **Step 3: Collect matches in `query()`**

In `visual_database-inline.h`, in `query(const keyframe_t*)`, directly below `mMatchedId = -1;`, add:

```cpp
        mMatches.clear();
```

Replace the acceptance block (from Task 2):

```cpp
            if(inliers.size() >= mMinNumInliers && inlierRatio >= mMinInlierRatio &&
               inliers.size() > mMatchedInliers.size()) {
                CopyVector9(mMatchedGeometry, H);
                mMatchedInliers.swap(inliers);
                mMatchedId = it->first;
            }
```

with:

```cpp
            if(inliers.size() >= mMinNumInliers && inlierRatio >= mMinInlierRatio) {
                // Keep every image that passes, not only the best (#635): with
                // several markers in view, each one has its own match.
                image_match_t match;
                match.id = it->first;
                match.inliers = inliers;
                CopyVector9(match.geometry, H);
                mMatches.push_back(match);

                if(inliers.size() > mMatchedInliers.size()) {
                    CopyVector9(mMatchedGeometry, H);
                    mMatchedInliers.swap(inliers);
                    mMatchedId = it->first;
                }
            }
```

(`match.inliers = inliers` copies before the `swap` empties `inliers`. If Task 2 was skipped, drop `&& inlierRatio >= mMinInlierRatio` from the first line.)

`return mMatchedId >= 0;` at the end of `query()` stays as it is.

- [ ] **Step 4: Expose `matches()` through the facade**

In `visual_database_facade.h`, directly below `const matches_t& inliers() const;`, add:

```cpp
        const image_matches_t& matches() const;
```

In `visual_database_facade.cpp`, directly below the body of `VisualDatabaseFacade::inliers()`, add:

```cpp
    const image_matches_t& VisualDatabaseFacade::matches() const{
        return mVisualDbImpl->mVdb->matches();
    }
```

- [ ] **Step 5: Write one result per matched page in `kpmMatching`**

In `kpmMatching.cpp`, add `#include <map>` next to the file's other standard includes. Then replace everything from

```cpp
const vision::matches_t& matches = kpmHandle->freakMatcher->inliers();
```

down to and including the closing `*/` of the commented-out per-page loop (currently lines 641-684) with:

```cpp
// Every reference image that passed the matcher's tests (#635). Each page was
// registered as several images — one per scale, see kpmSetRefDataSet — so
// several matches can belong to one page. Keep the best-supported per page.
const vision::image_matches_t& imageMatches = kpmHandle->freakMatcher->matches();
std::map<int, const vision::image_match_t*> bestPerPage;
for (const vision::image_match_t& imageMatch : imageMatches) {
    const int pageNo = kpmHandle->pageIDs[imageMatch.id];
    auto best = bestPerPage.find(pageNo);
    if (best == bestPerPage.end() || imageMatch.inliers.size() > best->second->inliers.size()) {
        bestPerPage[pageNo] = &imageMatch;
    }
}
ARLOGd("kpmMatching: %d image match(es) across %d page(s)\n", (int)imageMatches.size(), (int)bestPerPage.size());

for (const auto& entry : bestPerPage) {
    const int pageNo = entry.first;
    const vision::image_match_t& imageMatch = *entry.second;
    // result[] is indexed by page number, as it was before this change.
    if (kpmHandle->result[pageNo].skipF) continue;

    ret = kpmUtilGetPose_binary(kpmHandle->cparamLT,
                                imageMatch.inliers,
                                kpmHandle->freakMatcher->get3DFeaturePoints(imageMatch.id),
                                kpmHandle->freakMatcher->getQueryFeaturePoints(),
                                kpmHandle->result[pageNo].camPose,
                                &(kpmHandle->result[pageNo].error));
    if (ret == 0) {
        kpmHandle->result[pageNo].camPoseF = 0;
        kpmHandle->result[pageNo].inlierNum = (int)imageMatch.inliers.size();
        kpmHandle->result[pageNo].pageNo = pageNo;
        ARLOGi("Page[%d]  pre:%3d, aft:%3d, error = %f\n", pageNo, (int)imageMatch.inliers.size(), (int)imageMatch.inliers.size(), kpmHandle->result[pageNo].error);
    }
}
```

The dead loop is deleted, not adapted: it read `matchedId()` inside the loop and so gave every page the same id.

- [ ] **Step 6: Rebuild against the modified submodule**

```bash
npm run build
npm run build-ts
```

Expected: builds without errors or new warnings in the KPM sources.

- [ ] **Step 7: Verify no regression**

```bash
npx vitest run
npm run test-node-example
```

Expected: the full suite PASSes exactly as after Task 2 (only #612 skipped). The Node example prints `NFT marker detected:` and exactly one `Page[0]` line per KPM pass (one page loaded).

- [ ] **Step 8: Commit in WebARKitLib**

```bash
cd emscripten/WebARKitLib
git add lib/SRC/KPM/FreakMatcher/matchers/matcher_types.h lib/SRC/KPM/FreakMatcher/matchers/visual_database.h lib/SRC/KPM/FreakMatcher/matchers/visual_database-inline.h lib/SRC/KPM/FreakMatcher/facade/visual_database_facade.h lib/SRC/KPM/FreakMatcher/facade/visual_database_facade.cpp lib/SRC/KPM/kpmMatching.cpp
git commit -m "feat(kpm): report every matched page, not only the best one

VisualDatabase::query() now keeps every reference image that passes the
inlier tests, exposed as matches(); matchedId()/inliers() still give the
best. kpmMatching writes one pose per page, keeping the best-supported
image of each page, and the dead per-page loop is removed.

Refs webarkit/jsartoolkitNFT#635

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
cd ../..
```

The submodule pointer is bumped in Task 4, together with the binding change that consumes it. Restore the parent's artifacts for now: `git checkout -- build dist`.

---

### Task 4: Track every marker in the native binding (default + SIMD)

**Files:**
- Create: `emscripten/NFTMarkerState.h`
- Modify: `emscripten/ARToolKitNFT_js.h:1-17, 85, 110`
- Modify: `emscripten/ARToolKitNFT_js.cpp:3-35, 72-160`
- Create: `tests/vitest/frames.ts`, `tests/vitest/variants.ts`, `tests/vitest/multi-marker.test.ts`
- Modify: submodule pointer `emscripten/WebARKitLib`; rebuilt `build/`, `dist/`

**Interfaces:**
- Consumes: Task 3's per-page `KpmResult`s via `kpmGetResult`.
- Produces:
  - `struct NFTMarkerState { bool tracking; ARdouble pose[3][4]; float err; ARFilterTransMatInfo *ftmi; bool filterNeedsReset; }` in `emscripten/NFTMarkerState.h` — reused by Task 6.
  - `ARToolKitNFT::detectNFTMarker()` does KPM for untracked markers **and** AR2 tracking for all tracked markers, once per frame. Return value unchanged: the KPM result count when KPM ran this frame, else `-1`.
  - `ARToolKitNFT::getNFTMarkerInfo(int)` is a pure read of `markerStates[i]`; returns `-3` for `i < 0 || i >= surfaceSetCount`.
  - Test helpers: `COMPOSITE_WIDTH = 3000`, `COMPOSITE_HEIGHT = 2250`, `loadCompositeFrames(): Promise<{ both: ImageData; pinballOnly: ImageData }>`, `processUntil(ar, frame, done, maxFrames?)`, `isFound(ar, index)`, `VARIANTS: { name: string; load: () => Promise<{ ARControllerNFT: any }> }[]`.

- [ ] **Step 1: Write the composite-frame helper**

Create `tests/vitest/frames.ts`:

```ts
/**
 * Frames with two NFT targets in view at once, for the multi-marker suite.
 *
 * The repository has a photograph of the pinball target but none of kuva, so
 * kuva is taken from its own dataset: `kuva.iset` embeds the full-resolution
 * reference image as a single JPEG. The composite keeps the 4:3 aspect of
 * `camera_para.dat` so the camera model is scaled uniformly.
 *
 *   +----------------------+----------+
 *   |                      |          |
 *   |  pinball photograph  |   kuva   |   3000 x 2250
 *   |      2000 x 1500     |  (fit)   |
 *   |                      |          |
 *   +----------------------+----------+
 */

export const COMPOSITE_WIDTH = 3000;
export const COMPOSITE_HEIGHT = 2250;

const PINBALL_PHOTO = "/examples/node/pinball-demo.jpg";
const KUVA_ISET = "/examples/DataNFT/kuva.iset";

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not fetch ${url}: ${response.status}`);
  return response;
}

/** The JPEG embedded in an .iset: from the first SOI (FF D8) to the last EOI (FF D9). */
async function loadKuvaReferenceImage(): Promise<ImageBitmap> {
  const bytes = new Uint8Array(await (await fetchOk(KUVA_ISET)).arrayBuffer());
  let start = -1;
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8) {
      start = i;
      break;
    }
  }
  let end = -1;
  for (let i = bytes.length - 2; i >= 0; i--) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
      end = i + 2;
      break;
    }
  }
  if (start < 0 || end <= start) throw new Error(`${KUVA_ISET}: no embedded JPEG found`);
  return createImageBitmap(new Blob([bytes.slice(start, end)], { type: "image/jpeg" }));
}

export async function loadCompositeFrames(): Promise<{ both: ImageData; pinballOnly: ImageData }> {
  const pinball = await createImageBitmap(await (await fetchOk(PINBALL_PHOTO)).blob());
  const kuva = await loadKuvaReferenceImage();

  const canvas = document.createElement("canvas");
  canvas.width = COMPOSITE_WIDTH;
  canvas.height = COMPOSITE_HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("could not get a 2d context");

  const draw = (withKuva: boolean): ImageData => {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, COMPOSITE_WIDTH, COMPOSITE_HEIGHT);
    ctx.drawImage(pinball, 0, (COMPOSITE_HEIGHT - 1500) / 2, 2000, 1500);
    if (withKuva) {
      const panelWidth = COMPOSITE_WIDTH - 2000;
      const scale = Math.min(panelWidth / kuva.width, COMPOSITE_HEIGHT / kuva.height);
      const w = kuva.width * scale;
      const h = kuva.height * scale;
      ctx.drawImage(kuva, 2000 + (panelWidth - w) / 2, (COMPOSITE_HEIGHT - h) / 2, w, h);
    }
    return ctx.getImageData(0, 0, COMPOSITE_WIDTH, COMPOSITE_HEIGHT);
  };

  return { both: draw(true), pinballOnly: draw(false) };
}

export function isFound(ar: any, index: number): boolean {
  return Boolean(ar.getNFTMarker(index)?.found);
}

/**
 * Push `frame` until `done()` holds, yielding between frames so the threaded
 * build's detection worker can run. Throws if it never holds.
 */
export async function processUntil(
  ar: any,
  frame: ImageData,
  done: () => boolean,
  maxFrames = 120,
): Promise<void> {
  for (let i = 0; i < maxFrames; i++) {
    ar.process(frame);
    if (done()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`condition not met after ${maxFrames} frames`);
}
```

- [ ] **Step 2: Write the variants list**

Create `tests/vitest/variants.ts`:

```ts
/**
 * The builds a suite runs against. The default and SIMD builds compile the same
 * native binding (ARToolKitNFT_js.cpp); the threaded build is added in Task 6 of
 * specs/2026-09-23-multi-nft-marker-implementation-plan.md.
 */
export const VARIANTS: { name: string; load: () => Promise<{ ARControllerNFT: any }> }[] = [
  { name: "wasm", load: () => import("../../src/index") },
  { name: "wasm-simd", load: () => import("../../src/index_simd") },
];
```

- [ ] **Step 3: Write the failing multi-marker suite**

Create `tests/vitest/multi-marker.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { CAMERA_PARAM, MARKER_PINBALL, MARKER_KUVA, loadMarkers } from "./helpers";
import {
  COMPOSITE_WIDTH,
  COMPOSITE_HEIGHT,
  loadCompositeFrames,
  isFound,
  processUntil,
} from "./frames";
import { VARIANTS } from "./variants";

/**
 * Several markers tracked at once (#635, #613, #611).
 *
 * Pinball is on the left of the composite frame and kuva on the right, so both
 * are in view together; the `pinballOnly` frame is the same without kuva.
 * Every test establishes the state it needs with `processUntil`, so the order
 * of tests does not matter.
 */
for (const variant of VARIANTS) {
  for (const filtering of [true, false]) {
    describe(`two markers in view (${variant.name}, filtering ${filtering ? "on" : "off"})`, () => {
      let ar: any;
      let frames: { both: ImageData; pinballOnly: ImageData };

      beforeAll(async () => {
        const { ARControllerNFT } = await variant.load();
        frames = await loadCompositeFrames();
        ar = await ARControllerNFT.initWithDimensions(
          COMPOSITE_WIDTH,
          COMPOSITE_HEIGHT,
          CAMERA_PARAM,
          true,
        );
        ar.setFiltering(filtering);
        const ids = await loadMarkers(ar, [MARKER_PINBALL, MARKER_KUVA]);
        expect(ids).toEqual([0, 1]);
        ids.forEach((id) => ar.trackNFTMarkerId(id));
      }, 150_000);

      it("finds both markers in the same frame", async () => {
        await processUntil(ar, frames.both, () => isFound(ar, 0) && isFound(ar, 1));
        expect(isFound(ar, 0)).toBe(true);
        expect(isFound(ar, 1)).toBe(true);
      });

      it("fires getNFTMarker exactly once for each marker per process()", async () => {
        await processUntil(ar, frames.both, () => isFound(ar, 0) && isFound(ar, 1));
        const seen: number[] = [];
        const onGet = (e: any) => seen.push(e.data.index);
        ar.addEventListener("getNFTMarker", onGet);
        ar.process(frames.both);
        ar.removeEventListener("getNFTMarker", onGet);
        expect(seen.sort()).toEqual([0, 1]);
      });

      it("gives the two markers different poses", async () => {
        await processUntil(ar, frames.both, () => isFound(ar, 0) && isFound(ar, 1));
        const pinballPose = Array.from(ar.getNFTMarker(0).pose as ArrayLike<number>);
        const kuvaPose = Array.from(ar.getNFTMarker(1).pose as ArrayLike<number>);
        // pose is a row-major 3x4 [R|t]; index 3 is the x translation. Pinball
        // is on the left of the frame and kuva on the right.
        expect(pinballPose[3]).toBeLessThan(kuvaPose[3]);
      });

      it("keeps tracking pinball after kuva leaves the frame", async () => {
        await processUntil(ar, frames.both, () => isFound(ar, 0) && isFound(ar, 1));
        await processUntil(ar, frames.pinballOnly, () => !isFound(ar, 1));
        expect(isFound(ar, 0)).toBe(true);
      });

      it("returns MARKER_INDEX_OUT_OF_BOUNDS (-3) for an index outside the loaded markers", () => {
        expect(ar.getNFTMarker(-1)).toBe(-3);
        expect(ar.getNFTMarker(2)).toBe(-3);
      });
    });
  }
}
```

- [ ] **Step 4: Run it to verify it fails**

```bash
npx vitest run tests/vitest/multi-marker.test.ts
```

Expected: FAIL. `finds both markers in the same frame` fails with `condition not met after 120 frames` (only one page can be tracked). `returns MARKER_INDEX_OUT_OF_BOUNDS` fails because `getNFTMarker(-1)` returns an object. If instead *pinball itself* is never found in the composite — every test failing inside `processUntil` including single-marker conditions — that is a fixture problem, not the expected failure: stop and report it rather than changing the assertions.

- [ ] **Step 5: Create the shared per-marker state**

Create `emscripten/NFTMarkerState.h`:

```cpp
#ifndef NFT_MARKER_STATE_H
#define NFT_MARKER_STATE_H

#include <AR/ar.h>
#include <AR/arFilterTransMat.h>

/**
 * Tracking state for one NFT marker (page).
 *
 * The bindings keep one of these per loadable page (PAGES_MAX). It replaces the
 * single `detectedPage` / `ftmi` pair that limited tracking to one marker at a
 * time (#613, #611).
 */
struct NFTMarkerState {
  bool tracking = false;                // AR2 is locked on this page
  ARdouble pose[3][4] = {};             // latest pose, filtered when filtering is on
  float err = -1.0f;                    // AR2 tracking error for `pose`
  ARFilterTransMatInfo *ftmi = nullptr; // this marker's pose filter, created on first use
  bool filterNeedsReset = true;         // restart the filter on (re)acquisition
};

#endif // NFT_MARKER_STATE_H
```

- [ ] **Step 6: Replace the scalar state in the header**

In `emscripten/ARToolKitNFT_js.h`:
- Below `#include "markerDecompress.h"`, add `#include "NFTMarkerState.h"` and `#include <array>`.
- Delete the member `ARFilterTransMatInfo *ftmi;` (line 85).
- Replace the member `int detectedPage;` (line 110) with:

```cpp
    // One state per loadable page; index = page number = marker id.
    std::array<NFTMarkerState, PAGES_MAX> markerStates;

    // While any loaded marker is untracked, KPM runs once every
    // kKpmIntervalFrames frames. While all are tracked it does not run at all.
    static constexpr int kKpmIntervalFrames = 1;
    int framesSinceKpm;

    bool allMarkersTracked() const;
    void trackMarkers();
```

- [ ] **Step 7: Update construction and destruction**

In `emscripten/ARToolKitNFT_js.cpp`, in the default constructor's initializer list, replace

```cpp
      detectedPage(-2),   // -2 Tracking not inited, -1 tracking inited OK, >= 0
                          // tracking online on page.
```

with

```cpp
      framesSinceKpm(0),
```

In `ARToolKitNFT::ARToolKitNFT(bool withFiltering)`, delete the line `ftmi = nullptr;`.

Replace the destructor with:

```cpp
ARToolKitNFT::~ARToolKitNFT() {
  teardown();
  for (auto &state : markerStates) {
    if (state.ftmi) {
      arFilterTransMatFinal(state.ftmi);
      state.ftmi = nullptr;
    }
  }
}
```

- [ ] **Step 8: Make `getNFTMarkerInfo` a pure read**

Replace the whole of `emscripten::val ARToolKitNFT::getNFTMarkerInfo(int markerIndex) { … }` with:

```cpp
emscripten::val ARToolKitNFT::getNFTMarkerInfo(int markerIndex) {
  if (markerIndex < 0 || markerIndex >= this->surfaceSetCount) {
    return emscripten::val(MARKER_INDEX_OUT_OF_BOUNDS);
  }

  // Tracking itself happens once per frame in detectNFTMarker(); this only
  // reports the result, so calling it more than once per frame is harmless.
  const NFTMarkerState &state = markerStates[markerIndex];
  auto NFTMarkerInfo = emscripten::val::object();
  NFTMarkerInfo.set("id", markerIndex);

  if (state.tracking) {
    auto pose = emscripten::val::array();
    int idx = 0;
    for (auto x = 0; x < 3; x++) {
      for (auto y = 0; y < 4; y++) {
        pose.set(idx++, state.pose[x][y]);
      }
    }
    NFTMarkerInfo.set("error", state.err);
    NFTMarkerInfo.set("found", 1);
    NFTMarkerInfo.set("pose", pose);
  } else {
    NFTMarkerInfo.set("error", -1);
    NFTMarkerInfo.set("found", 0);
    NFTMarkerInfo.set("pose", emscripten::val(emscripten::typed_memory_view(12, zeros.data())));
  }

  return NFTMarkerInfo;
}
```

- [ ] **Step 9: Detect untracked markers and track all of them, once per frame**

Replace the whole of `int ARToolKitNFT::detectNFTMarker() { … }` with:

```cpp
bool ARToolKitNFT::allMarkersTracked() const {
  for (int i = 0; i < this->surfaceSetCount; i++) {
    if (!markerStates[i].tracking) return false;
  }
  return true;
}

int ARToolKitNFT::detectNFTMarker() {
  KpmResult *kpmResult = nullptr;
  int kpmResultNum = -1;

  if (this->surfaceSetCount > 0 && !allMarkersTracked() &&
      ++this->framesSinceKpm >= kKpmIntervalFrames) {
    this->framesSinceKpm = 0;

    // Pages already being tracked need no pose from KPM this pass.
    // kpmMatching() clears the skip flags again when it finishes.
    int skipPages[PAGES_MAX];
    int skipNum = 0;
    for (int i = 0; i < this->surfaceSetCount; i++) {
      if (markerStates[i].tracking) skipPages[skipNum++] = i;
    }
    if (skipNum > 0) {
      kpmSetMatchingSkipPage(this->kpmHandle.get(), skipPages, skipNum);
    }

    kpmMatching(this->kpmHandle.get(), this->videoLuma.get());
    kpmGetResult(this->kpmHandle.get(), &kpmResult, &kpmResultNum);

    for (int i = 0; i < kpmResultNum; i++) {
      if (kpmResult[i].camPoseF != 0) continue;
      const int page = kpmResult[i].pageNo;
      if (page < 0 || page >= this->surfaceSetCount) {
        webarkitLOGe("KPM reported page %d, outside 0..%d.", page, this->surfaceSetCount - 1);
        continue;
      }
      NFTMarkerState &state = markerStates[page];
      if (state.tracking) continue;
      ar2SetInitTrans(this->surfaceSet[page], kpmResult[i].camPose);
      state.tracking = true;
      state.filterNeedsReset = true;
    }
  }

  trackMarkers();
  return kpmResultNum;
}

void ARToolKitNFT::trackMarkers() {
  for (int page = 0; page < this->surfaceSetCount; page++) {
    NFTMarkerState &state = markerStates[page];
    if (!state.tracking) continue;

    float trans[3][4];
    float err = -1.0f;
    const int trackResult = ar2TrackingMod(this->ar2Handle, this->surfaceSet[page],
                                           this->videoFrame.get(), trans, &err);
    if (trackResult < 0) {
      webarkitLOGi("Tracking lost on page %d. %d", page, trackResult);
      state.tracking = false;
      state.err = -1.0f;
      continue;
    }

    for (int r = 0; r < 3; r++) {
      for (int c = 0; c < 4; c++) {
        state.pose[r][c] = trans[r][c];
      }
    }
    if (withFiltering) {
      if (!state.ftmi) {
        state.ftmi = arFilterTransMatInit(this->filterSampleRate, this->filterCutoffFrequency);
        state.filterNeedsReset = true;
      }
      if (arFilterTransMat(state.ftmi, state.pose, state.filterNeedsReset ? 1 : 0) < 0) {
        webarkitLOGe("arFilterTransMat error with marker %d.", page);
      }
      state.filterNeedsReset = false;
    }
    state.err = err;
    ARLOGi("Tracked page %d (max %d).\n", page, this->surfaceSetCount - 1);
  }
}
```

The tracking loop reuses one `ar2Handle` for every page, one page after another. AR2 keeps per-page tracking state in each `AR2SurfaceSetT`, not in the handle; Step 11 verifies this empirically.

- [ ] **Step 10: Confirm no stale references remain**

```bash
grep -n "detectedPage\|this->ftmi" emscripten/ARToolKitNFT_js.cpp emscripten/ARToolKitNFT_js.h
```

Expected: no output.

- [ ] **Step 11: Bump the submodule, rebuild, and run the suite**

```bash
git add emscripten/WebARKitLib
npm run build
npm run build-ts
npx vitest run tests/vitest/multi-marker.test.ts
```

Expected: PASS — 5 tests × 4 describes (wasm and wasm-simd, filtering on and off), 20 passing. If `finds both markers` passes but `gives the two markers different poses` fails, suspect the shared `ar2Handle` assumption in Step 9 and report it before changing anything.

- [ ] **Step 12: Run everything**

```bash
npx vitest run
npm run test-node-example
```

Expected: full suite PASS (only #612 skipped); the Node example prints `NFT marker detected:`.

- [ ] **Step 13: Commit**

```bash
git add emscripten/NFTMarkerState.h emscripten/ARToolKitNFT_js.h emscripten/ARToolKitNFT_js.cpp emscripten/WebARKitLib tests/vitest/frames.ts tests/vitest/variants.ts tests/vitest/multi-marker.test.ts
git add -A build dist
git status --porcelain
git commit -m "feat: track every visible NFT marker, not only the first

The binding keeps a tracking state per marker instead of one
detectedPage/ftmi pair. KPM runs while any loaded marker is untracked,
and tracking happens once per frame in detectNFTMarker(), so
getNFTMarker(i) is now a pure read. Bumps WebARKitLib for per-page KPM
results. Adds a multi-marker suite over the default and SIMD builds.
Rebuilt build/ and dist/ included.

Refs #635, #613

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Report each marker lost on its own; one matrix per event (#611)

**Files:**
- Create: `src/MarkerLostTracker.ts`, `tests/vitest/marker-lost-tracker.test.ts`
- Modify: `src/ARControllerNFT.ts:72-73, 156-157, 326-373`
- Modify: `src/ARControllerNFT_simd.ts:72-73, 156-157, 326-373`
- Modify: `src/ARControllerNFT_td.ts:72-73, 156-157, 326-373`
- Modify: `tests/vitest/multi-marker.test.ts`
- Rebuilt `dist/`

**Interfaces:**
- Consumes: Task 4's per-marker `getNFTMarker(i).found`.
- Produces: `class MarkerLostTracker<T>` with `constructor(lostAfterMs = 200)`, `markFound(index: number, now: number, payload: T): void`, `checkLost(index: number, now: number): T | undefined`, `clear(): void`.

- [ ] **Step 1: Write the failing unit tests**

Create `tests/vitest/marker-lost-tracker.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MarkerLostTracker } from "../../src/MarkerLostTracker";

describe("MarkerLostTracker", () => {
  it("does not report a marker that was never found", () => {
    const tracker = new MarkerLostTracker<string>(200);
    expect(tracker.checkLost(0, 10_000)).toBeUndefined();
  });

  it("does not report a marker within the grace period, including its last millisecond", () => {
    const tracker = new MarkerLostTracker<string>(200);
    tracker.markFound(0, 1000, "pose");
    expect(tracker.checkLost(0, 1100)).toBeUndefined();
    expect(tracker.checkLost(0, 1200)).toBeUndefined();
  });

  it("reports a marker lost once, with its last payload, after the grace period", () => {
    const tracker = new MarkerLostTracker<string>(200);
    tracker.markFound(0, 1000, "first");
    tracker.markFound(0, 1050, "last");
    expect(tracker.checkLost(0, 1251)).toBe("last");
    expect(tracker.checkLost(0, 1300)).toBeUndefined();
  });

  it("tracks markers independently", () => {
    const tracker = new MarkerLostTracker<string>(200);
    tracker.markFound(0, 1000, "pinball");
    tracker.markFound(1, 1000, "kuva");
    tracker.markFound(0, 1200, "pinball");
    expect(tracker.checkLost(1, 1300)).toBe("kuva");
    expect(tracker.checkLost(0, 1300)).toBeUndefined();
  });

  it("reports a marker lost again after it was re-acquired", () => {
    const tracker = new MarkerLostTracker<string>(200);
    tracker.markFound(0, 1000, "a");
    expect(tracker.checkLost(0, 1300)).toBe("a");
    tracker.markFound(0, 2000, "b");
    expect(tracker.checkLost(0, 2300)).toBe("b");
  });

  it("forgets every marker on clear()", () => {
    const tracker = new MarkerLostTracker<string>(200);
    tracker.markFound(0, 1000, "a");
    tracker.clear();
    expect(tracker.checkLost(0, 5000)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npx vitest run tests/vitest/marker-lost-tracker.test.ts
```

Expected: FAIL — cannot resolve `../../src/MarkerLostTracker`.

- [ ] **Step 3: Implement `MarkerLostTracker`**

Create `src/MarkerLostTracker.ts`:

```ts
/*
 *  MarkerLostTracker.ts
 *  JSARToolKitNFT
 *
 *  This file is part of JSARToolKitNFT - WebARKit.
 *
 *  JSARToolKitNFT is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 */

/**
 * Decides when a marker counts as lost, separately for every marker index.
 *
 * `process()` sees each marker as found or not found on every frame. One missed
 * frame is not a loss — tracking flickers — so a marker is only reported lost
 * once it has gone unseen for longer than `lostAfterMs`. Before #611 this was a
 * single index and a single timestamp, so with two markers in view only one of
 * them could ever be reported lost.
 *
 * `T` is handed back with the loss; the controllers use the marker's last pose,
 * so a `lostNFTMarker` event says where the marker was last seen.
 */
export class MarkerLostTracker<T> {
  private readonly lastSeen = new Map<number, { time: number; payload: T }>();

  constructor(private readonly lostAfterMs: number = 200) {}

  /** Record that marker `index` was found at time `now` (ms). */
  markFound(index: number, now: number, payload: T): void {
    this.lastSeen.set(index, { time: now, payload });
  }

  /**
   * The last payload recorded for `index`, returned exactly once: on the first
   * call made more than `lostAfterMs` after the marker was last found.
   * Otherwise `undefined`. After reporting, the marker is forgotten until it is
   * found again.
   */
  checkLost(index: number, now: number): T | undefined {
    const entry = this.lastSeen.get(index);
    if (entry === undefined || now - entry.time <= this.lostAfterMs) {
      return undefined;
    }
    this.lastSeen.delete(index);
    return entry.payload;
  }

  /** Forget every marker. */
  clear(): void {
    this.lastSeen.clear();
  }
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

```bash
npx vitest run tests/vitest/marker-lost-tracker.test.ts
```

Expected: 6 passing.

- [ ] **Step 5: Add the failing integration tests**

In `tests/vitest/multi-marker.test.ts`, add `vi` to the vitest import:

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";
```

and append these two tests inside the `describe(...)` block, after the out-of-bounds test:

```ts
      it("gives each getNFTMarker event its own matrix", async () => {
        await processUntil(ar, frames.both, () => isFound(ar, 0) && isFound(ar, 1));
        const events: { ref: Float64Array; copy: number[] }[] = [];
        const onGet = (e: any) =>
          events.push({ ref: e.data.matrix, copy: Array.from(e.data.matrix as Float64Array) });
        ar.addEventListener("getNFTMarker", onGet);
        ar.process(frames.both);
        ar.removeEventListener("getNFTMarker", onGet);

        expect(events.length).toBe(2);
        expect(events[0].ref).not.toBe(events[1].ref);
        // A listener that kept the matrix still sees the values it was given.
        for (const event of events) {
          expect(Array.from(event.ref)).toEqual(event.copy);
        }
      });

      it("reports kuva lost while pinball stays tracked", async () => {
        let clock = 1_000_000;
        const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock);
        try {
          await processUntil(ar, frames.both, () => isFound(ar, 0) && isFound(ar, 1));

          const lost: number[] = [];
          const onLost = (e: any) => lost.push(e.data.index);
          ar.addEventListener("lostNFTMarker", onLost);

          // Remove kuva; advance 50 ms per frame until the loss is reported.
          for (let i = 0; i < 60 && lost.length === 0; i++) {
            clock += 50;
            ar.process(frames.pinballOnly);
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
          expect(lost).toEqual([1]);

          // Afterwards pinball keeps being reported, kuva does not come back,
          // and nothing else is reported lost.
          const kept: number[] = [];
          const onGet = (e: any) => kept.push(e.data.index);
          ar.addEventListener("getNFTMarker", onGet);
          for (let i = 0; i < 10; i++) {
            clock += 50;
            ar.process(frames.pinballOnly);
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
          ar.removeEventListener("getNFTMarker", onGet);
          ar.removeEventListener("lostNFTMarker", onLost);

          expect(kept.length).toBeGreaterThan(0);
          expect(kept.every((index) => index === 0)).toBe(true);
          expect(lost).toEqual([1]);
        } finally {
          nowSpy.mockRestore();
        }
      });
```

- [ ] **Step 6: Run them to verify they fail**

```bash
npx vitest run tests/vitest/multi-marker.test.ts
```

Expected: FAIL. `gives each getNFTMarker event its own matrix` fails on `expect(events[0].ref).not.toBe(events[1].ref)` (both events carry the shared `transform_mat`). `reports kuva lost while pinball stays tracked` fails on `expect(lost).toEqual([1])` with `[]`: pinball's found-branch overwrites the single `nftMarkerFound` every frame, so kuva is never reported. The tests from Task 4 still pass.

- [ ] **Step 7: Update `src/ARControllerNFT.ts`**

Add the import below the file's existing imports:

```ts
import { MarkerLostTracker } from "./MarkerLostTracker";
```

Replace the two fields

```ts
  private nftMarkerFound: boolean; // = false
  private nftMarkerFoundTime: number;
```

with

```ts
  // When each marker was last found, and where; drives lostNFTMarker per marker.
  private markerLostTracker: MarkerLostTracker<{
    matrix: Float64Array;
    matrixGL_RH: Float64Array;
  }>;
```

In the constructor, replace

```ts
    this.nftMarkerFound = false;
    this.nftMarkerFoundTime = 0;
```

with

```ts
    this.markerLostTracker = new MarkerLostTracker(200);
```

In `process()`, replace everything from `// in ms` down to the closing brace of the `for (let i = 0; i < nftMarkerCount; i++) { … }` loop with:

```ts
    const now = Date.now();

    for (let i = 0; i < nftMarkerCount; i++) {
      let nftMarkerInfo: IARToolkitNFT["NFTMarkerInfo"] = this.getNFTMarker(i);

      let markerType = ARToolkitNFT.NFT_MARKER;

      if (nftMarkerInfo.found) {
        let visible: INFTMarker = this.trackNFTMarkerId(i);
        visible.matrix.set(nftMarkerInfo.pose);
        visible.inCurrent = true;
        // A fresh matrix per event: with several markers found in one frame a
        // shared buffer would be overwritten by the next marker while a
        // listener still holds it.
        const matrix = this.transMatToGLMat(visible.matrix, new Float64Array(16));
        const matrixGL_RH = this.arglCameraViewRHf(matrix);
        this.transform_mat = matrix;
        this.transformGL_RH = matrixGL_RH;
        this.markerLostTracker.markFound(i, now, { matrix, matrixGL_RH });
        this.dispatchEvent({
          name: "getNFTMarker",
          target: this,
          data: {
            index: i,
            type: markerType,
            marker: nftMarkerInfo,
            matrix: matrix,
            matrixGL_RH: matrixGL_RH,
          },
        });
      } else {
        const lastSeen = this.markerLostTracker.checkLost(i, now);
        if (lastSeen) {
          this.dispatchEvent({
            name: "lostNFTMarker",
            target: this,
            data: {
              index: i,
              type: markerType,
              marker: nftMarkerInfo,
              matrix: lastSeen.matrix,
              matrixGL_RH: lastSeen.matrixGL_RH,
            },
          });
        }
      }
    }
```

- [ ] **Step 8: Make the identical edit in `src/ARControllerNFT_simd.ts`**

Apply exactly the four edits of Step 7 to `src/ARControllerNFT_simd.ts` — the import `import { MarkerLostTracker } from "./MarkerLostTracker";`; the field replacement; the constructor replacement; and the `process()` loop replacement with the same code block as Step 7. The surrounding code is identical to `ARControllerNFT.ts` (lines 300-375 differ only in a doc-comment word).

- [ ] **Step 9: Make the identical edit in `src/ARControllerNFT_td.ts`**

Apply exactly the four edits of Step 7 to `src/ARControllerNFT_td.ts`, same as Step 8.

- [ ] **Step 10: Confirm no stale references remain**

```bash
grep -n "nftMarkerFound\|MARKER_LOST_TIME" src/ARControllerNFT.ts src/ARControllerNFT_simd.ts src/ARControllerNFT_td.ts
```

Expected: no output.

- [ ] **Step 11: Run the tests**

```bash
npx vitest run tests/vitest/marker-lost-tracker.test.ts tests/vitest/multi-marker.test.ts
```

Expected: PASS — 6 unit tests and 7 tests × 4 describes (28). No native rebuild is needed: Vitest compiles `src/` directly.

- [ ] **Step 12: Rebuild `dist/` and run everything**

```bash
npm run build-ts
npx vitest run
npm run test-node-example
```

Expected: full suite PASS (only #612 skipped); Node example prints `NFT marker detected:`.

- [ ] **Step 13: Commit**

```bash
git add src/MarkerLostTracker.ts src/ARControllerNFT.ts src/ARControllerNFT_simd.ts src/ARControllerNFT_td.ts tests/vitest/marker-lost-tracker.test.ts tests/vitest/multi-marker.test.ts
git add -A dist
git status --porcelain
git commit -m "feat: report each NFT marker lost on its own

The controllers tracked found/lost with one index and one timestamp, so
with two markers in view only one could be reported lost. A
MarkerLostTracker now does this per marker, and lostNFTMarker carries
that marker's last pose. Each getNFTMarker event also gets its own
matrix instead of a shared buffer the next marker overwrites. Applied
to the default, SIMD and threaded controllers. Rebuilt dist/ included.

Refs #611

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Track every marker in the threaded build

**Files:**
- Modify: `emscripten/trackingSub.h`, `emscripten/trackingSub.c`
- Modify: `emscripten/ARToolKitNFT_js_td.h:1-19, 85, 115`
- Modify: `emscripten/ARToolKitNFT_js_td.cpp:3-35, 72-183`
- Modify: `tests/vitest/variants.ts`, `vitest.config.ts`
- Rebuilt `build/`, `dist/`

**Interfaces:**
- Consumes: `NFTMarkerState` (Task 4); Task 3's per-page `KpmResult`s; Task 5's controller changes (already in `ARControllerNFT_td.ts`).
- Produces:
  - `typedef struct { int page; float trans[3][4]; float error; } TrackingInitResult;`, `#define TRACKING_INIT_MAX_RESULTS 20`
  - `int trackingInitGetResults(THREAD_HANDLE_T*, TrackingInitResult results[], int maxResults, int *resultNum)` — `0` still running, `1` finished (`*resultNum` may be 0), `-1` error. **Replaces** `trackingInitGetResult`, whose only caller is this binding.
  - Threaded `detectNFTMarker()` drives the worker and tracks every tracked page; `getNFTMarkerInfo(i)` is a pure read, identical to Task 4's.

The worker already runs one search at a time, so the threaded build needs no frame interval: a new search starts on the first frame after the previous one is collected.

- [ ] **Step 1: Add the threaded variant to the suite**

In `tests/vitest/variants.ts`, add to the array:

```ts
  { name: "wasm-threaded", load: () => import("../../src/index_td") },
```

and change the doc comment's last sentence to: `The threaded build (ARToolKitNFT_js_td.cpp) detects on a worker thread.`

In `vitest.config.ts`, at the top level of the object passed to `defineConfig` — a sibling of `test`, not inside it — add:

```ts
  // The threaded build needs SharedArrayBuffer, which browsers only provide to
  // cross-origin isolated pages.
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
```

- [ ] **Step 2: Pin cross-origin isolation**

Append to `tests/vitest/multi-marker.test.ts`, at the end of the file:

```ts
describe("test page isolation", () => {
  it("is cross-origin isolated, so the threaded build can use SharedArrayBuffer", () => {
    expect(globalThis.crossOriginIsolated).toBe(true);
  });
});
```

- [ ] **Step 3: Run the suite to verify the threaded variant fails**

```bash
npx vitest run tests/vitest/multi-marker.test.ts
```

Expected: `test page isolation` PASSes. If it fails, the headers are not reaching the test page — stop and report; do not skip the threaded variant. The `wasm-threaded` describes FAIL: `finds both markers in the same frame` times out (the worker returns only its best page), and `returns MARKER_INDEX_OUT_OF_BOUNDS` fails for `-1`. The wasm and wasm-simd describes still pass.

- [ ] **Step 4: Widen the worker interface**

In `emscripten/trackingSub.h`, replace the declaration

```c
int trackingInitGetResult( THREAD_HANDLE_T *threadHandle, float trans[3][4], int *page );
```

with

```c
/* Most pages one search can report. Must equal PAGES_MAX in ARToolKitNFT_js_td.h. */
#define TRACKING_INIT_MAX_RESULTS 20

typedef struct {
    int   page;          /* page number of the matched marker */
    float trans[3][4];   /* its initial pose */
    float error;         /* KPM pose error */
} TrackingInitResult;

/*
 * Collect the result of the search started by trackingInitStart(): every page
 * KPM matched, up to maxResults.
 * Returns 0 while the search is still running, 1 once it has finished (with
 * *resultNum set, possibly to 0), or -1 on error.
 */
int trackingInitGetResults( THREAD_HANDLE_T *threadHandle, TrackingInitResult results[], int maxResults, int *resultNum );
```

- [ ] **Step 5: Store every result in the worker**

In `emscripten/trackingSub.c`, in `typedef struct { … } TrackingInitHandle;`, replace the three members

```c
    float                   trans[3][4];    // Transform containing pose of tracked image.
    int                     page;           // Assigned page number of tracked image.
    int                     flag;           // Tracked successfully.
```

with

```c
    TrackingInitResult      results[TRACKING_INIT_MAX_RESULTS]; // Every matched page.
    int                     resultNum;                          // How many of results[] are set.
```

In `trackingInitInit`, replace `trackingInitHandle->flag      = 0;` with `trackingInitHandle->resultNum = 0;`.

Replace the whole of `int trackingInitGetResult( … ) { … }` with:

```c
int trackingInitGetResults( THREAD_HANDLE_T *threadHandle, TrackingInitResult results[], int maxResults, int *resultNum )
{
    TrackingInitHandle     *trackingInitHandle;
    int                     n;

    if (!threadHandle || !results || !resultNum || maxResults <= 0) {
        ARLOGe("trackingInitGetResults(): Error: NULL argument or maxResults <= 0.\n");
        return (-1);
    }
    if( threadGetStatus( threadHandle ) == 0 ) return 0;
    threadEndWait( threadHandle );
    trackingInitHandle = (TrackingInitHandle *)threadGetArg(threadHandle);
    if (!trackingInitHandle) return (-1);

    n = trackingInitHandle->resultNum < maxResults ? trackingInitHandle->resultNum : maxResults;
    memcpy(results, trackingInitHandle->results, n * sizeof(TrackingInitResult));
    *resultNum = n;
    return 1;
}
```

In `trackingInitMain`, delete the local `float err;`, and replace the loop body between `kpmMatching(kpmHandle, imageLumaPtr);` and `threadEndSignal(threadHandle);` with:

```c
        trackingInitHandle->resultNum = 0;
        for( i = 0; i < kpmResultNum; i++ ) {
            if( kpmResult[i].camPoseF != 0 ) continue;
            if( trackingInitHandle->resultNum >= TRACKING_INIT_MAX_RESULTS ) {
                ARLOGe("trackingInitMain(): more than %d pages matched; ignoring the rest.\n", TRACKING_INIT_MAX_RESULTS);
                break;
            }
            TrackingInitResult *result = &trackingInitHandle->results[trackingInitHandle->resultNum++];
            result->page  = kpmResult[i].pageNo;
            result->error = kpmResult[i].error;
            for (j = 0; j < 3; j++) for (k = 0; k < 4; k++) result->trans[j][k] = kpmResult[i].camPose[j][k];
        }
```

- [ ] **Step 6: Confirm the old function has no other caller**

```bash
grep -rn "trackingInitGetResult\b" emscripten/ --include=*.c --include=*.cpp --include=*.h
```

Expected: only the call in `ARToolKitNFT_js_td.cpp` (replaced in Step 9). If anything else calls it, stop and report.

- [ ] **Step 7: Replace the scalar state in the threaded header**

In `emscripten/ARToolKitNFT_js_td.h`:
- Below `#include "markerDecompress.h"`, add `#include "NFTMarkerState.h"` and `#include <array>`.
- Directly below `const int PAGES_MAX = 20; …`, add:

```cpp
static_assert(PAGES_MAX == TRACKING_INIT_MAX_RESULTS,
              "the detection worker must be able to report every page");
```

- Delete the member `ARFilterTransMatInfo *ftmi;` (line 85).
- Replace the member `int detectedPage;` (line 115) with:

```cpp
    // One state per loadable page; index = page number = marker id.
    std::array<NFTMarkerState, PAGES_MAX> markerStates;

    // True between trackingInitStart() and collecting its results.
    bool kpmSearchRunning;

    bool allMarkersTracked() const;
    void trackMarkers();
```

- [ ] **Step 8: Update construction and destruction**

In `emscripten/ARToolKitNFT_js_td.cpp`, replace the initializer

```cpp
      detectedPage(-2),   // -2 Tracking not inited, -1 tracking inited OK, >= 0
                          // tracking online on page.
```

with

```cpp
      kpmSearchRunning(false),
```

Delete any remaining `ftmi = nullptr;` line in the constructors. If the destructor calls `arFilterTransMatFinal(this->ftmi);`, replace that call with:

```cpp
  for (auto &state : markerStates) {
    if (state.ftmi) {
      arFilterTransMatFinal(state.ftmi);
      state.ftmi = nullptr;
    }
  }
```

- [ ] **Step 9: Replace the threaded getter and detector**

Replace the whole of `emscripten::val ARToolKitNFT::getNFTMarkerInfo(int markerIndex) { … }` (currently lines 72-148) with the exact function from Task 4 Step 8.

Replace the whole of `int ARToolKitNFT::detectNFTMarker() { … }` (the one whose body is a commented-out block) with:

```cpp
bool ARToolKitNFT::allMarkersTracked() const {
  for (int i = 0; i < this->surfaceSetCount; i++) {
    if (!markerStates[i].tracking) return false;
  }
  return true;
}

int ARToolKitNFT::detectNFTMarker() {
  if (!this->threadHandle) {
    webarkitLOGe("Error: threadHandle\n");
    return -1;
  }

  int resultNum = -1;

  // Collect the previous search, if it has finished.
  if (this->kpmSearchRunning) {
    TrackingInitResult results[PAGES_MAX];
    int n = 0;
    const int ret = trackingInitGetResults(this->threadHandle, results, PAGES_MAX, &n);
    if (ret != 0) {
      // Finished (1) or failed (-1): either way the worker is free again.
      this->kpmSearchRunning = false;
    }
    if (ret == 1) {
      resultNum = n;
      for (int i = 0; i < n; i++) {
        const int page = results[i].page;
        if (page < 0 || page >= this->surfaceSetCount) {
          webarkitLOGe("Detected bad page %d.\n", page);
          continue;
        }
        NFTMarkerState &state = markerStates[page];
        if (state.tracking) continue;
        webarkitLOGi("Detected page %d.\n", page);
        ar2SetInitTrans(this->surfaceSet[page], results[i].trans);
        state.tracking = true;
        state.filterNeedsReset = true;
      }
    }
  }

  // Start a new search while any marker is untracked. The worker is idle here,
  // so setting skip pages cannot race with it; kpmMatching() clears them.
  if (!this->kpmSearchRunning && this->surfaceSetCount > 0 && !allMarkersTracked()) {
    int skipPages[PAGES_MAX];
    int skipNum = 0;
    for (int i = 0; i < this->surfaceSetCount; i++) {
      if (markerStates[i].tracking) skipPages[skipNum++] = i;
    }
    if (skipNum > 0) {
      kpmSetMatchingSkipPage(this->kpmHandle.get(), skipPages, skipNum);
    }
    trackingInitStart(this->threadHandle, this->videoLuma.get());
    this->kpmSearchRunning = true;
  }

  trackMarkers();
  return resultNum;
}

void ARToolKitNFT::trackMarkers() {
  for (int page = 0; page < this->surfaceSetCount; page++) {
    NFTMarkerState &state = markerStates[page];
    if (!state.tracking) continue;

    float trans[3][4];
    float err = -1.0f;
    if (ar2Tracking(this->ar2Handle, this->surfaceSet[page], this->videoFrame.get(), trans, &err) < 0) {
      webarkitLOGi("Tracking lost on page %d.\n", page);
      state.tracking = false;
      state.err = -1.0f;
      continue;
    }
    for (int r = 0; r < 3; r++) {
      for (int c = 0; c < 4; c++) {
        state.pose[r][c] = trans[r][c];
      }
    }
    state.err = err;
    ARLOGi("Tracked page %d (max %d).\n", page, this->surfaceSetCount - 1);
  }
}
```

The threaded build keeps using `ar2Tracking` and applies no pose filter, exactly as before this change.

- [ ] **Step 10: Confirm no stale references remain**

```bash
grep -n "detectedPage\|this->ftmi\|trackingInitGetResult\b" emscripten/ARToolKitNFT_js_td.cpp emscripten/ARToolKitNFT_js_td.h emscripten/trackingSub.c emscripten/trackingSub.h
```

Expected: no output.

- [ ] **Step 11: Rebuild and run the suite**

```bash
npm run build
npm run build-ts
npx vitest run tests/vitest/multi-marker.test.ts
```

Expected: PASS — 7 tests × 6 describes (wasm, wasm-simd, wasm-threaded × filtering on/off) plus the isolation test: 43 passing.

- [ ] **Step 12: Run everything**

```bash
npx vitest run
npm run test-node-example
```

Expected: full suite PASS (only #612 skipped); Node example prints `NFT marker detected:`.

- [ ] **Step 13: Commit**

```bash
git add emscripten/trackingSub.h emscripten/trackingSub.c emscripten/ARToolKitNFT_js_td.h emscripten/ARToolKitNFT_js_td.cpp tests/vitest/variants.ts tests/vitest/multi-marker.test.ts vitest.config.ts
git add -A build dist
git status --porcelain
git commit -m "feat: track every visible NFT marker in the threaded build

The detection worker reported only its single best page, and the
threaded getter reported every marker index as found whenever any page
was tracked. The worker now returns every matched page; detection and
tracking run once per frame in detectNFTMarker() with the per-marker
state shared with the default build. The multi-marker suite now covers
the threaded build, with the test page cross-origin isolated.
Rebuilt build/ and dist/ included.

Refs #635, #613, #611

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Measure the cost of an unseen marker; record what changed

Review Focus 1: with this change, a loaded marker that is never in view keeps KPM running every frame (`kKpmIntervalFrames = 1`), where 1.12.0 stopped running it once one marker was tracked. This task measures that cost and hands the choice of interval to the user; the spec deliberately left it to measurement.

**Files:**
- Temporary (never committed): `tests/vitest/measure-kpm-cost.test.ts`
- Modify: `emscripten/ARToolKitNFT_js.h` (`kKpmIntervalFrames`) — only if the user picks a value other than 1
- Modify: `specs/2026-09-22-multi-nft-marker-design.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a recorded measurement, the user's chosen `kKpmIntervalFrames`, and the spec updated with the planning refinements.

- [ ] **Step 1: Write the throwaway cost measurement**

Create `tests/vitest/measure-kpm-cost.test.ts`:

```ts
import { describe, it } from "vitest";
import { ARControllerNFT } from "../../src/index";
import { CAMERA_PARAM, MARKER_PINBALL, MARKER_KUVA, loadMarkers } from "./helpers";
import { COMPOSITE_WIDTH, COMPOSITE_HEIGHT, loadCompositeFrames, isFound, processUntil } from "./frames";

// Throwaway: ms per process() with pinball tracked, with and without a second,
// unseen marker loaded.
describe("KPM cost of an unseen marker", () => {
  for (const set of [[MARKER_PINBALL], [MARKER_PINBALL, MARKER_KUVA]]) {
    it(`loaded: [${set.join(", ")}]`, async () => {
      const { pinballOnly } = await loadCompositeFrames();
      const ar: any = await ARControllerNFT.initWithDimensions(COMPOSITE_WIDTH, COMPOSITE_HEIGHT, CAMERA_PARAM, true);
      const ids = await loadMarkers(ar, set);
      ids.forEach((id) => ar.trackNFTMarkerId(id));
      await processUntil(ar, pinballOnly, () => isFound(ar, 0));

      const samples: number[] = [];
      for (let i = 0; i < 60; i++) {
        const t0 = performance.now();
        ar.process(pinballOnly);
        samples.push(performance.now() - t0);
      }
      samples.sort((a, b) => a - b);
      const median = samples[30];
      const p90 = samples[54];
      console.log(`[kpm-cost] loaded=[${set.join(", ")}] median=${median.toFixed(1)}ms p90=${p90.toFixed(1)}ms`);
    }, 150_000);
  }
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run tests/vitest/measure-kpm-cost.test.ts
```

Expected: 2 passing, each printing a `[kpm-cost]` line. Run it three times and keep all six lines.

- [ ] **Step 3: Ask the user to choose the interval**

Present the six `[kpm-cost]` lines to the user with the ratio `median([pinball, kuva]) / median([pinball])`, and ask which `kKpmIntervalFrames` to ship (1 keeps today's value: a marker entering view is found on the very next frame; N trades up to N-1 frames of detection latency for roughly 1/N of the extra cost). **Wait for the answer.** Do not choose.

- [ ] **Step 4: Apply the chosen interval (only if it is not 1)**

In `emscripten/ARToolKitNFT_js.h`, set `static constexpr int kKpmIntervalFrames = <user's value>;`. Then:

```bash
npm run build
npm run build-ts
npx vitest run
```

Expected: full suite PASS. (`processUntil` allows 120 frames, far more than any sensible interval needs.)

- [ ] **Step 5: Remove the throwaway test**

```bash
rm tests/vitest/measure-kpm-cost.test.ts
```

- [ ] **Step 6: Record the measurement and the planning refinements in the spec**

Append to `specs/2026-09-22-multi-nft-marker-design.md`:

```markdown
## Implementation notes

Found while planning (`specs/2026-09-23-multi-nft-marker-implementation-plan.md`)
and folded into the implementation:

- **One page is several database entries** — one FREAK keyframe per (page, image
  scale). `kpmMatching` keeps the best-supported entry per page.
- **After #635 a #631 false positive would be a phantom marker**, not a wrong
  winner, so the inlier-ratio threshold had to reject *every* wrong-image match.
- **Only `transform_mat` was shared between events**; `arglCameraViewRHf` already
  returned a fresh matrix.
- **Tracking moved out of `getNFTMarkerInfo`** into `detectNFTMarker`, once per
  frame; the getter is a pure read with an unchanged signature.
- **The threaded getter reported every index as found** whenever any page was
  tracked; fixed by the same restructure.

## KPM cost of an unseen marker, <date>

<the six [kpm-cost] lines>

Shipped `kKpmIntervalFrames = <value>`, chosen by <user> on <date>.
```

Every `<…>` is filled in; none may remain in the committed file.

- [ ] **Step 7: Commit**

If Step 4 changed the interval:

```bash
git add emscripten/ARToolKitNFT_js.h specs/2026-09-22-multi-nft-marker-design.md
git add -A build dist
git status --porcelain
git commit -m "feat: set the KPM detection interval from measurement

Refs #635

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Otherwise:

```bash
git add specs/2026-09-22-multi-nft-marker-design.md
git commit -m "doc: record multi-marker implementation notes and KPM cost

Refs #635

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the last task

Both repositories hold local commits only: WebARKitLib `feat/multi-nft-marker` (Tasks 2-3) and this repo's `feat/multi-nft-marker` (Tasks 1-7), whose submodule pointer references WebARKitLib commits that exist nowhere else yet. The WebARKitLib branch has to be pushed and merged first, or a clean clone of this branch will not build. That order, and whether to open the PRs at all, is the user's decision.
