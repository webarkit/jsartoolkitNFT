# NFT tracker facade and worker wrapper (#720, project 2)

**Date:** 2026-10-25
**Issue:** #720, phases 3 to 5 (project 2 of 3)
**Builds on:**
- #740: `configure()` / `getRuntimeSettings()` on the core;
- #742: the Vite build and the module pthread worker;
- #736: Promise-based marker loading with `NFTLoadError`.

**Status:** design agreed in discussion; this document is the written spec, awaiting approval

## Summary

A new, additive entry point next to `ARControllerNFT`. It turns the NFT tracker into a data-oriented object:
- **`createNFTTracker(config)`:** the tracker on the same thread;
- **`createNFTTrackerWorker(config, opts)`:** the same API, running in a Web Worker, which picks the default, SIMD or threaded build by itself;
- **`configure(patch)`**, which is always live;
- **`addNFTTargets(sources)`**, which returns one result per source;
- **`process(frame, timestampMs)`**, which returns a `FrameResult`: per-marker poses, plus exactly one `found` and one `lost` transition;
- **`cameraMatrix`** and **`projectionFor(viewport)`**;
- **`dispose()`**.

Pose filtering is built in and per marker, reset on loss: `'none'`, `'native'`, OneEuro, or a custom filter module loaded by URL, including inside the worker.

webarkit-studio is the first consumer, then ARnft and aframe-nft. Their migration is project 3. Its `ArtkSession` (`src/runtime/trackers/artk-session.ts`) is the prototype of this facade, built on today's API.

## Why

ARnft, aframe-nft and webarkit-studio each rebuilt the same layer on top of `ARControllerNFT`, each with its own bugs:
- found/lost logic;
- pose filtering;
- projection rescaling;
- marker loading;
- the worker protocol.

ARnft, for example, has one shared filter that is never reset, and sends `lost` on every frame. The user's main pain in webarkit-studio is the worker and the found/lost logic. The facade absorbs that layer once, with data in and data out, so the worker protocol is generic.

## Goals, non-goals, anti-goals

**Goals**

- **G1. `createNFTTracker(config)`** on all four entry points, each bound to its build: default, `_simd`, `_td` and `_node`. `createNFTTrackerWorker(config, opts)` on the three browser entry points.
- **G2. `process(frame, timestampMs)`** returns a `FrameResult`:
  - `targets`, one entry per loaded target: `{ id, found, pose, error }`. `pose` is a column-major 4×4 right-handed GL matrix, or `null`.
  - `transitions`: exactly one `found` on the rising edge, and exactly one `lost` once a marker has been unseen for longer than `lostTimeout`.
  - `time` and `processMs`.
- **G3. Filtering per marker,** reset on `lost`:
  - `'none'`;
  - `'native'`: ARToolKit's filter, through `configure({ filtering })`;
  - `{ type: 'oneEuro', minCutOff, beta, dCutOff?, warmUp? }`;
  - `{ module: string, options?: unknown }`: a custom filter loaded by URL. It works in the worker and in the same thread.

  OneEuro is implemented **through the same `PoseFilterModule` interface** as custom filters.
- **G4. `addNFTTargets(sources, opts?)`** resolves to one `TargetLoad` per source, in order: `{ status: 'loaded', info }` or `{ status: 'error', url, reason, message }`. It never rejects for a per-source failure, and never yields an `undefined` id. `info` gives the size in pixels, dpi **and millimetres**, and `origin: 'corner' | 'center'` decides where the pose origin sits.
- **G5. Geometry:**
  - `cameraMatrix` is always consistent with `near` / `far`;
  - `projectionFor({ width, height, fit: 'contain' | 'cover' }, geometry?)` returns the projection for a viewport showing the source video, which replaces the three hand-written letterbox and rescale versions in the consumers.
  - The camera side describes where the video sits in the processing frame with an exported `FrameGeometry` (D17).
- **G6. `configure(patch)`** is live. It forwards the core settings to #740's `configure()`, and handles the facade settings itself: `lostTimeout`, `filter` and `logLevel`. Unknown keys throw.
- **G7. All inputs and outputs are structured-cloneable,** so the worker wrapper is a thin, generic relay.
- **G8. `dispose()`** releases the WASM state. It is idempotent; after `dispose()`, the methods throw a clear error.
- **G9. One ES6 example** is ported to `createNFTTrackerWorker`, and the README gets a facade section plus a "writing a pose filter" section.

**Non-goals**

- **`removeNFTTargets()`.** A real slot release needs a WebARKitLib core change, deferred by the user. Removing without recreating the session would help webarkit-studio, but it is not needed now.
- **`Uint8Array` target sources** (in-memory datasets). `addNFTTargets` takes URLs or paths, as `ARToolkitNFT.addNFTMarkers` does. The loader of #685 keeps bytes separate from URLs, so this can be added later.
- **Changing `ARControllerNFT`**, its events or the legacy APIs.
- **The shared result contract with `@webarkit/nft-tracker`** (#720 phase 7) and the `{ R, t }` pose form.
- **Migrating ARnft, aframe-nft or webarkit-studio** (project 3).
- **An ESM browser build** of the main bundles.

**Anti-goals** (failure even if the tests pass)

- **A consumer has to write its own found/lost edge detection or filter reset** to use the facade correctly.
- **A worker message carries a function or a class instance.** Everything that crosses `postMessage` must be plain data.
- **The facade and `ARControllerNFT` behave differently for the same frames.** The poses must be the same, and found/lost must be the same with the same `lostTimeout`.
- **Loading the worker downloads more than one WASM build.**

## Approaches

**Building the facade on `ARToolkitNFT` or on `ARControllerNFT`.** The user chose `ARToolkitNFT`. The controller has its own events, caches and found/lost logic, which the facade replaces with data. Building on top of it would stack two found/lost layers. On `ARToolkitNFT`, the controller stays untouched.

**Packaging the worker side.** The user chose **A**.
- **A. One worker file per build (chosen):** `dist/NFTTracker.worker.js`, `dist/NFTTracker_simd.worker.js` and `dist/NFTTracker_td.worker.js`. Each is an ES module bundling the worker host and its build.
  - Pro: only one WASM build is downloaded, and it follows the same Vite pattern.
  - Pro: inside the td worker, the pthread worker `ARToolkitNFT_td.worker.js` resolves against the worker file's own URL in `dist/`.
  - Con: three more files of about 700 KB each.
- **B. One worker host that `import()`s the chosen build.** It needs three new ESM browser bundles of the builds: more files than A, and a format we do not ship today.
- **C. One worker file containing all three builds:** about 2.1 MB always downloaded. Rejected.

**Custom filters in a worker.** A function cannot cross `postMessage`, so the worker receives a module URL and imports it. A spike (worktree `.claude/worktrees/spike-filter`, 4/4 in Chromium, cross-origin isolated) confirmed:
- Vite leaves `import(/* @vite-ignore */ url)` intact;
- the module loads in a module worker, with one filter per marker and `reset()` on `lost`;
- a missing module or a missing export reports a clear error.

## Decisions

**user** means agreed in the discussion; **design** means this document's call, open to review.

- **D1 (user).** No `removeNFTTargets` now. Marker sizes in millimetres are computed in JS.
- **D2 (user).** The facade sits on `ARToolkitNFT` (the variant class is injected, like the base classes after #734). `ARControllerNFT` is unchanged.
- **D3 (user). Filters:** `'none' | 'native' | { type: 'oneEuro', … } | { module, options }`, one per marker, reset on `lost`.
  - OneEuro ships built in, written as a `PoseFilterModule`.
  - Custom modules work in the worker (level 3) and in the same thread.
  - On the same thread, a factory can also be passed directly: `{ create: (options) => PoseFilter }`. The worker rejects that form with a clear error, because a function cannot cross `postMessage`.
- **D4 (user). Worker packaging A.** `createNFTTrackerWorker` picks the build:
  - `td` if `crossOriginIsolated`;
  - otherwise `simd` if WASM SIMD is supported (a feature test);
  - otherwise `default`.

  `opts.build: 'auto' | 'default' | 'simd' | 'td'` overrides the choice.
  - **`opts.workerBase`** (design, after the builder check) is the URL of the **folder** that holds the worker files: `NFTTracker*.worker.js` and `ARToolkitNFT_td.worker.js`. The choice among the three builds therefore still works. It replaces the single-file `workerUrl` of the discussion, which could not name three files.
  - Without it, the folder resolves with the bundle-URL rule (next to the script that loads the bundle). Re-bundled apps such as webarkit-studio, a Vite app, will normally pass it.
  - `createNFTTrackerWorker` is the same implementation on all three browser entry points, and auto-selects among all three builds whichever entry imported it. The main-thread bundle does not decide which build the worker loads.
- **D5 (user). The file layout** is `src/tracker/`:
  - `NFTTracker.ts`, `types.ts`, `foundLost.ts`, `geometry.ts`;
  - `filters/PoseFilter.ts`, `filters/oneEuro.ts`, `filters/loadFilter.ts`;
  - `worker/protocol.ts`, `worker/host.ts`, `worker/createNFTTrackerWorker.ts`.

  The index files export `createNFTTracker`, `createNFTTrackerWorker` (browser only) and the types.
- **D6 (design, after the builder check). `process()` input:**
  - `ImageData`, `ImageBitmap`, or `{ data: Uint8ClampedArray | Uint8Array, width, height }` (RGBA).
  - **No luma-only input.** The core's AR2 tracking reads the RGBA frame (`videoFrame`), and KPM reads the luma, so both are needed. A gray-only form would leave AR2 with a stale frame.
  - **Who fits the frame to the processing size** is decided under **D17**.
  - In the worker, the frame is **transferred**, not copied: an `ImageBitmap`, or the `ArrayBuffer` of the data.
- **D7 (design). Time is an input.** `process(frame, timestampMs)` uses the caller's time for `lostTimeout` and the filters. This makes found/lost and filtering reproducible in tests, as #720 asks.
- **D8 (design). Found/lost:** `foundLost.ts` reimplements `MarkerLostTracker`'s rule:
  - a marker is lost once unseen for longer than `lostTimeout`, default 200 ms;
  - the `found` edge comes on the first tracked frame after being lost, or at the start.

  `MarkerLostTracker` stays as it is for the controller.
  - **Within the grace window** (untracked, but `lostTimeout` not yet expired), `targets[i].found` is `false` and `pose` is `null` (design, after the builder check). `targets` reports **this frame's raw tracking**, and only `transitions` is debounced.
  - This matches webarkit-studio's `ArtkSession`, the reference, and the controller, whose `getNFTMarker` event fires only on tracked frames.
  - A consumer that wants to hold the last pose until `lost` keeps it itself, which is a one-liner.
  - The filters are fed only tracked poses.
- **D9 (design). Shared pose helpers.** The facade needs the controller's GL conversion: `transMatToGLMat` followed by `arglCameraViewRHf`, the same matrix as `matrixGL_RH` in the controller's events.
  - These pure functions move to a shared module, and `ARControllerNFTBase` / `_node` import them, with no behaviour change.
  - **The image copy is not simply shared** (corrected after the builder check):
    - the browser version reads `image.data` and honours `internalLuma`;
    - the Node version takes the raw pixel array, allocates per frame, and always computes luma in JS.
  - The facade gets its own copy routine, parameterised by input form and luma path. The controllers keep theirs.
  - The reason for sharing the GL conversion: a second copy would make the poses of the two APIs drift apart, and the anti-goal requires them to match.
- **D9b (design, after the builder check). The luma path is the WASM one** (`internalLuma = true`, CCIR601 weights in WASM), as webarkit-studio uses. It is faster, and it needs no per-frame JS loop in the worker. The controller defaults to the JS loop (`(3r+4g+b)>>3`), which gives slightly different poses. So **the pose-equality test runs the controller with `internalLuma = true`**. On Node, the facade uses the path the Node build supports; the builder checks whether `lumaInternal` works there.
- **D10 (design, corrected after the builder check). `addNFTTargets` loads one source at a time.**
  - **The name is the user's choice:** `addNFTTargets`. "Target" is used throughout the facade (`targets`, `TargetLoad`, `TargetInfo`, `TargetResult`, later `removeNFTTargets`). There are two reasons:
    - `addMarkers`, #720's sketch, recalls the square pattern-marker APIs of jsartoolkit5 and its relatives;
    - "target" is the term `@webarkit/nft-tracker` uses (`TargetDb`), which eases #720 phase 7's shared contract, where a consumer can switch trackers without renaming.
  - **No name clash:** it does not reuse `ARToolkitNFT.addNFTMarkers`, which keeps its batch, all-or-nothing behaviour (it rejects with an `NFTLoadError`). The facade resolves to one `TargetLoad` per source instead.
  - The core and the controller keep "marker" (`getNFTMarker`, `nftMarker`): the facade translates.
  - **Browser:** through `ARToolkitNFT.addNFTMarkers([source])`, Promise-style, which rejects with an `NFTLoadError`.
  - **Node:** `ARToolkitNFT_node` is a separate class whose `addNFTMarkers` never throws (it calls `onError2` and returns `[]`). The facade uses its `tryAddNFTMarkers`, currently marked `@internal`, which is promoted to an internal API shared with the facade, to get the `NFTLoadError` kind.
  - Node accepts only extension-less prefixes relative to the working directory, with no `.zft` and no file lists, as today.
  - Each source gets its own result, and a failure stays local to that source.
  - Cost: KPM rebuilds its matcher once per marker instead of once per batch, which is acceptable for the few markers a scene uses (the limit is 20).
  - `reason` maps from `NFTLoadError.kind`:
    - `http`, `network` and `missing` become `'network'`;
    - `format` becomes `'format'`. This covers `.zft` decompress and decode failures only. A corrupt `.fset`/`.iset`/`.fset3` fails in native registration as `rejected`.
    - `rejected` becomes `'capacity'` when the loaded count is already 20. Otherwise it becomes `'unknown'`, with a message saying the dataset may be unreadable.
    - `argument` becomes `'unknown'`.
  - `id`s are the ones the core returns: stable for the tracker's lifetime, and never reused, since there is no remove.
- **D11 (design). `origin: 'center'`:** the pose is post-multiplied by a translation of half the marker's size in millimetres, computed from `getNFTData()`'s width, height and dpi (mm = px / dpi × 25.4). This is the formula each consumer writes today. `'corner'` (the default) is ARToolKit's native origin.
  - `dpi` is an `int` in the core (`nftMarker`), so the millimetre sizes inherit its truncation, as they do for consumers today. The geometry tests use the same truncated value.
- **D12 (design). `projectionFor(viewport)`** starts from `cameraMatrix`, which is built for the processing frame. It scales the x and y terms so the frame maps onto the viewport:
  - `contain`: letterbox, the whole frame visible;
  - `cover`: the frame fills the viewport and is cropped.

  This is the math ARnft, aframe-nft and webarkit-studio each write by hand. The builder takes the formula from `ArtkSession` and ARnft-threejs, unifies it, and tests it against hand-computed matrices.
- **D13 (design). The worker wrapper API** mirrors `NFTTracker`. Every method returns a Promise:
  - `process(frame, t)` returns `Promise<FrameResult>`, and the frame is transferred;
  - `configure`, `addNFTTargets` and `dispose` relay the call;
  - `cameraMatrix` is a property updated after `configure` and after init;
  - `projectionFor` runs on the main thread from the cached `cameraMatrix`, with no round trip.
  - One `process` runs at a time. A `process()` call made while one is in flight resolves with `{ skipped: true }`, without queueing, so a consumer feeding camera frames never builds up latency. This is the common pattern; the builder documents it.
- **D14 (design). Custom filter module contract,** exported as types from `src/tracker/filters/PoseFilter.ts`:

```ts
export interface PoseFilter { filter(timeMs: number, pose: Float64Array): Float64Array; reset(): void; }
export interface PoseFilterModule { createPoseFilter(options: unknown): PoseFilter; }
```

  - A module must export `createPoseFilter`.
  - Errors are clear: a module that fails to load, a missing export, or a `createPoseFilter` that throws all reject `createNFTTracker` / `createNFTTrackerWorker`, or `configure({ filter })`, with an `Error` naming the module URL.
  - `examples/filters/average-filter.js` is a template to copy.
  - **Under COEP:** a module from another origin needs CORS plus `Cross-Origin-Resource-Policy` headers. The README says so; same-origin modules need nothing.
- **D15 (design). Tests in a worker.** Vitest's browser mode rewrites `import()` in the JS files it serves (`wrapDynamicImport`), which breaks inside a worker. The worker tests load the built worker file as text and start it from a `Blob` URL, as the spike does. The builder records this in a test comment.
  - The td worker test works because of D16's `mainScriptUrlOrBlob`: the test passes `workerBase` pointing at `/dist/`.
- **D16 (design, corrected after the builder check). Building the three worker bundles** extends `vite.lib.config.mjs` / `tools/build-ts.mjs` with three new ES-format entries, `src/tracker/worker/host_<variant>.ts`, each importing its build.
  - **No `import.meta.url` define for the worker bundles.** They are ES modules, so the real `import.meta.url` already resolves next to the file. The UMD treatment would break it.
  - **The pthread worker:** the facade td worker emits the Emscripten glue as its pthread worker. If that output is byte-identical to `ARToolkitNFT_td.worker.js` from the UMD td build, both share the file (verify in the build). Otherwise it gets its own name (`NFTTracker_td.pthread.js`), so neither build overwrites the other.
  - **The host sets `mainScriptUrlOrBlob`.** The page-side wrapper sends the resolved `workerBase` in the init message. The td host passes the pthread worker URL to the module as `mainScriptUrlOrBlob`, which the glue honours. This makes the pthread worker independent of `import.meta.url`, so it also works when the host is started from a Blob URL (D15) or re-bundled. `initARToolkitNFT_td` must accept the Module options, and the builder checks this.
  - `main.yml`'s release list and `.npmignore` / `npm pack` include the new files.
- **D17 (user). The camera side does the letterboxing, not the facade (option B).**
  - **Frames:** `process()` takes frames that are exactly `config.width` × `config.height`, and throws `RangeError` otherwise. Fitting the camera video into the processing frame (letterbox, portrait rotation) is the camera side's job:
    - today ARnft's `CameraViewRenderer`, aframe-nft's `cameraViewRenderer` and webarkit-studio's own code;
    - later a shared `@webarkit/camera-view` package (ARnft issue).
  - **The meeting point is one exported plain-data type:**

```ts
export interface FrameGeometry {
  frameWidth: number; frameHeight: number;            // the processing frame (pw x ph)
  videoWidth: number; videoHeight: number;            // the source video (vw x vh)
  x: number; y: number; width: number; height: number; // where the video was drawn (ox, oy, w, h)
  rotated: boolean;                                    // portrait video drawn rotated 90 degrees
}
```

  - **`projectionFor(viewport, geometry?)`:** with a geometry, it undoes the letterbox and the rotation, then fits the source video to the viewport (`contain` / `cover`). Without one, the processing frame itself is treated as the source.
  - **The reasons** (the user's decision, after looking at ARnft's `CameraViewRenderer`):
    - camera handling and letterboxing are the same for any tracker;
    - the facade could not honour `rotatePortrait`, because it never sees the original video;
    - a facade-side letterbox would duplicate `getProcessGeometry` and fight the renderers.
  - The geometry fields map one to one onto `getProcessGeometry()`'s `{ rot, w, h, pw, ph, ox, oy }` plus the video size.
  - D12's formula is therefore the inverse of `getProcessGeometry`. The tests check it against ARnft's and webarkit-studio's current projection code for the same inputs.
- **D18 (design, after the builder check). Filter defaults and keys:**
  - **The default `filter` is `'native'`.** Every build constructs the core with native filtering on, so this matches the controller out of the box, and the pose-equality anti-goal holds with defaults.
  - `'none'`, OneEuro and custom filters turn native filtering **off** (`configure({ filtering: false })`), so poses are never filtered twice.
  - **`filtering` is not a facade key.** The facade takes only `filter`, and passing `filtering` throws `TypeError`, with a message pointing to `filter`. That gives one way to say it.
  - **`logLevel`:** the facade accepts any level >= 0, as `setLogLevel` does. Levels 0-4 go through `configure()`. A level above 4, used to silence everything, goes through `setLogLevel()`, because the core's `configure()` refuses it.
  - **The `'native'` reset is the core's.** The native filter resets on the core's own first untracked frame (`filterNeedsReset`), not after the facade's `lostTimeout`. The facade cannot change this, and the README says so. The JS filters (OneEuro and custom) reset on the facade's `lost` transition.

## Current state

- **`ARToolkitNFT` (via `ARToolkitNFTBase`):**
  - `loadCamera`, `setup`;
  - `addNFTMarkers(urls, …)`: Promise-based since #736, with `NFTLoadError` kinds;
  - `passVideoData` through the controller's `_copyImageToHeap`;
  - `detectNFTMarker`, `getNFTMarker(i)` (`found`, `pose` 3×4, `error`), `getNFTData(i)` (width, height, dpi);
  - `configure` / `getRuntimeSettings` (#740), `getCameraLens`, `recalculateCameraLens`, `teardown`.
- **`ARControllerNFTBase.process()`:**
  - copies the image to the heap and calls `detectNFTMarker()`;
  - for each marker, builds `matrix` with `transMatToGLMat`, then `matrixGL_RH` with `arglCameraViewRHf`;
  - feeds `MarkerLostTracker`;
  - dispatches `getNFTMarker` on every tracked frame and `lostNFTMarker` once after 200 ms.
- **The Node variant** (`ARToolkitNFT_node`) loads markers in place through NODEFS. Its `addNFTMarkers` is synchronous inside.
- **webarkit-studio** (`ArtkSession` + `jsartoolkit-nft.worker.ts` + `nft-protocol.ts`): per-marker filters with reset, found/lost from events, `processMs`, a `configure` that rebuilds the lens, and a `load` / `configure` / `process` → `ready` / `lens` / `result` protocol. It is the reference behaviour.

## Testing

- **Unit tests, in Node and in a browser page:**
  - `foundLost`: transitions with explicit times, the `lostTimeout` edge, several markers;
  - `geometry`: mm sizes, `origin: 'center'`, `projectionFor` contain and cover against hand-computed matrices;
  - filters: OneEuro (warm-up, reset), the custom module loader (load, missing export, throwing factory), and the per-marker reset on `lost`.
- **The facade on every browser build** (`tests/vitest/tracker-*.test.ts`, looping over VARIANTS) and on Node (`tests/node/tracker.test.js`), on the pinball photo:
  - `addNFTTargets` gives loaded results plus an error result for a missing URL, and never `undefined`;
  - `process` finds the marker, and the `found` transition fires exactly once;
  - hiding the marker (a blank frame) gives exactly one `lost` after `lostTimeout`;
  - `configure({ lostTimeout })` is live;
  - the **poses equal the controller's `matrixGL_RH`** for the same frames (the anti-goal);
  - `dispose()` makes later calls throw.
- **The worker:** start each worker bundle from a Blob URL (D15) and run init, `addNFTTargets`, `process` until found, and a custom filter module, on default and SIMD; td needs cross-origin isolation, which the suite provides.
  - `workerUrl` works.
  - The build choice follows `crossOriginIsolated` and SIMD support. Test the selection function directly, with stubbed feature tests.
- **`dist-paths` and the release list** cover the new worker files. `npm pack` includes them.
- **Manual:** the ported ES6 example runs on the worker; serve it with `python-server.py`.

## Recording the reasons

Every non-obvious choice carries its reason in a code comment, the commit body and a "change → reason" table in the PR:
- D6 (input sizes and transfer);
- D9 (why the helpers are shared);
- D10 (one source at a time, and the reason mapping);
- D11 and D12 (the formulas);
- D13 (dropping frames instead of queueing);
- D14 (the module contract and COEP);
- D15 (the Blob-loaded worker in tests);
- D16.

## Delivery

- **Branch:** `feat/720-tracker-facade` from `dev`.
- **One PR to `dev`:** `feat: data-oriented NFT tracker facade and worker wrapper (#720)`.
- `dist/` and `types/` are rebuilt and committed.
- The PR body says "refs #720", because project 3 is still open.

## Risks

- **Poses diverging from the controller:** D9 and the equality test guard it.
- **Worker size:** three more bundles of about 700 KB in the npm package. They are needed by approach A, and only one is downloaded at run time.
- **Latency:** `process()` in the worker is asynchronous, so D13's frame dropping keeps it bounded. Measure `processMs` against the controller in the example.
- **The Node variant's synchronous loading** behind an asynchronous `addNFTTargets`: wrap it, and keep one result per source.

## Left to the builder

- Internal names, and how the variant class is injected (follow `ARToolkitNFTBase`).
- Where the shared pose helpers live.
- The worker protocol's message names (plain data, versioned by a `type` field).
- The OneEuro implementation: depend on `@webarkit/oneeurofilter-ts`, or keep a small local copy.
  - The parameter units must match webarkit-studio's (`minCutOff`, `beta`, `warmUp`).
  - aframe-nft divides `minCutOff` by 1000, which the README notes.
- Which ES6 example to port.
- The test file names, following the AGENTS.md placement rules.
- The commit split.
