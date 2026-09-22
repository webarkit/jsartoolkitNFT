# Multi-marker support: state of play and plan

**Date:** 2026-09-22
**Issues:** #635, #631, #612, #613, #611

This picks up where the 1.12.0 and `artoolkitnft` 0.0.13 releases left off. It exists so the
work can resume on another machine without re-deriving anything — every claim below was
measured, and the measurements are recorded.

## The short version

Multi-marker is **five issues that are one problem**, and they stack bottom-up:

| # | layer | status |
|---|---|---|
| **#635** | KPM writes one result per frame — WebARKitLib | blocker for everything below |
| **#631** | a false positive can steal that one result — WebARKitLib | independent, same file |
| **#613** | `detectedPage` is a scalar — `ARToolKitNFT_js.cpp` | blocked by #635 |
| **#611** | `lostNFTMarker` fires for one — same scalar | blocked by #635 |
| **#612** | markers cannot be loaded incrementally | independent, but pointless before #635 |

**Start with #635.** Fixing #613's scalar alone changes nothing, because there would still be
only one populated `kpmResult` entry to loop over.

## What was established, with evidence

Run `node tools/makem.js` for a full build; `ARLOGi` at `kpmMatching.cpp:294` and the
`Page[%d] pre:…` line both print at INFO level, so **no `--debug-logs` build is needed** to see
the `db_id` table and the matched page.

### #631 — the original diagnosis was wrong

It was recorded as an index-mapping fault. It is not. `db_id` assignment and `pageIDs[]` are
correct; `mMatchedId = it->first` is the same `db_id` passed to
`addFreakFeaturesAndDescriptors`.

The real behaviour: **kuva false-positives against the pinball photograph**, with the same
result whether or not pinball is also loaded.

| loaded | build | matched | inliers | error |
|---|---|---|---|---|
| `[pinball]` | node | Page[0] | 36 | 4.98 |
| `[kuva]` | node | Page[0] | **32** | 1.17 |
| `[pinball, kuva]` | node | Page[0] | 36 | 4.98 |
| `[pinball]` | browser | Page[0] | 33 | 6.30 |
| `[kuva]` | browser | Page[0] | **35** | 1.688 |
| `[pinball, kuva]` | browser | Page[1] | **35** | 1.688 |

Node and browser disagree only because `sharp` and canvas `getImageData` decode the JPEG
differently. It is a knife-edge: node's pinball 36 beats kuva 32; browser's kuva 35 beats
pinball 33. **The false positive is present in both.**

Root cause: `FreakMatcher/matchers/visual_database-inline.h:55`

```cpp
static const int kMinNumInliers = 8;
```

An absolute floor of 8 is trivially cleared. Note **error thresholding would also pick wrong** —
kuva's error against the pinball photo (1.688) is *lower* than pinball's own true match (6.30).
An inlier **ratio** against the reference image's feature count looks more promising, given the
reference images range from 636 points down to 6.

The earlier "kuva alone refuses to match" measurement was an artefact of the old
`matched_image_id != 0` guard: kuva alone matches at `db_id` **0**, and `0 != 0` is false, so
the hit was silently discarded.

### #635 — one marker per frame

`visual_database-inline.h` keeps only the running maximum:

```cpp
if(inliers.size() >= mMinNumInliers && inliers.size() > mMatchedInliers.size()) {
    mMatchedId = it->first;
}
```

and `kpmMatching.cpp` consumes a single `matchedId()` and writes one result. The **original
per-page loop is still present, commented out** directly below it — but it reused one
`matchedId()` for every page, so it cannot simply be uncommented.

Scope: `query()` needs to collect per-image matches rather than keep a maximum, and
`kpmMatching` needs to write a result per page.

### #612 — incremental loading

The offset fix is done and verified (the native log reports "Assigned page no. 1." on the second
call). What still fails: **`kpmSetRefDataSet()` is not idempotent** — in the BINARY_FEATURE path
it appends every page to `kpmHandle->freakMatcher` via `addFreakFeaturesAndDescriptors()` and
never clears, so a second call re-adds pages and throws. Retaining the accumulated dataset is
necessary but not sufficient; the matcher state has to be rebuilt, probably via
`createKpmHandle()` before setting the accumulated set.

The failure shape matters: the native exception surfaces inside an XHR callback, so
`loadNFTMarker` never calls back at all. Without the timeout in `loadMarker()` the tests hang
rather than fail.

There is a parked WIP commit `5609a26` on `fix/incremental-nft-markers` (local, unpushed — it
may only exist on the machine where it was made).

## Working method

Fixes for #635 and #631 land in **WebARKitLib first**, then arrive here via a submodule bump —
the same route as WebARKitLib#67 → #633.

`emscripten/WebARKitLib` has its own `dev`/`master` split with the same convention. WebARKitLib#70
(sync automation) is still open.

## Tests

Nine tests are skipped and are the acceptance criteria:

- `tests/vitest/detection.test.ts` — two tests for #631
- `tests/vitest/incremental-markers.test.ts` — one `describe.skip` wrapping seven tests for #612

Un-skip them with the fix; passing is the proof. Note `npm test` proves little on its own — the
Karma suite never loads a marker. Verify against `examples/node/example_dist.js`.

**Rebuild before testing.** CI runs against the committed `build/` artifacts, so a change under
`emscripten/` or `tools/makem.js` passes against stale WASM unless rebuilt and committed on the
branch. A regression shipped exactly this way in 1.10.1.

## Everything else currently open

Not part of multi-marker, listed so nothing is lost:

| # | |
|---|---|
| #651 | libjpeg fetched over plain HTTP with no checksum, compiled into published wheels — **security** |
| #643 | npm package ships 16.3 MB including an untracked local `coverage/` |
| #629 | open PR from a first-time contributor, awaiting their reply |
| #630 | `recalculateCameraLens()` not proxied |
| #616 | plan removal of the legacy `js/artoolkitNFT.api.js` |
| #602 | CI hardening — largely done, Chromium now from Google's `.deb` |
| #584 | validate the WebARKitLib#39 matcher determinism fix |
| #580 | Codecov upload (the lcov already exists) |
| #579 | expand the Vitest harness to all seven targets, retire Karma |

### One open question worth five minutes

The published macOS wheels are tagged `macosx_10_14_x86_64.macosx_15_0_arm64` — claiming **Intel
support that both READMEs say does not exist**. One of the two is wrong. `lipo -archs` on the
extension inside a wheel settles it. Worth resolving before an Intel user finds out first.

## A trap worth remembering

Two issues in this set were closed by accident, by commit messages that *mentioned* a fix:

- `does *not* fix #631` → closed #631
- `The PR that fixes #612 un-skips…` → closed #612

GitHub's parser matches `fix #N` with no understanding of negation or future tense. **Never write
`fix`/`fixes`/`closes` next to an issue number unless you mean it** — use "see #N" or "refs #N".
