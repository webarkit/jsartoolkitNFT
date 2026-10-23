# Promise-based NFT marker loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NFT marker loading end in exactly one outcome in every variant: the real ids, or one error. Use `fetch`, an `AbortSignal` and an asynchronous `.zft` probe in the browser (#685, #676).

**Architecture:** One `NFTLoadError` module and two pure helpers in `Utils` (`fetchBinary`, `hexToBytes`) feed a per-marker loader and a batch `addNFTMarkers` in `ARToolkitNFTBase`. `ARControllerNFTBase` applies the callback rule on top of the batch. The Node classes and the legacy `js/` APIs get the same contract in their own copies. The variant subclasses are not edited (D20).

**Tech Stack:** TypeScript (ESNext target, `strict`), webpack (`npm run build-ts`), Emscripten 4.0.17 in Docker for the legacy relink, Vitest browser mode (Playwright Chromium), `node --test`.

**Spec:** `specs/2026-10-21-promise-nft-marker-loading-design.md` (as updated for #735). Decision numbers (D1 to D20) refer to it. Read it before any task.

## Global Constraints

- PR to `dev`, titled `feat: make NFT marker loading Promise-based with fetch (#685)`. Commit types: `feat`, `fix`, `perf`, `doc`, `refactor`, `test`, `style`, `chore`.
- Branch `feat/685-promise-nft-marker-loading`, which already carries the design and this plan.
- Do not edit `src/ARToolkitNFT.ts`, `_simd.ts`, `_td.ts`, `src/ARControllerNFT.ts`, `_simd.ts`, `_td.ts`. No instance field, override or loading code goes in a variant subclass (D20).
- No change to `emscripten/**` or WebARKitLib (non-goal, D17).
- No `AbortSignal.any()` (D12: it needs Safari 17.4).
- No default timeout. `signal` and `probeZFT` exist in the browser builds only (D4).
- A call that passes `onSuccess` or `onError` never rejects. A call with no callbacks rejects on failure (D8).
- The `onError` code is the HTTP status for `kind: "http"`, otherwise `-1`.
- An abort rejects with `signal.reason`, not wrapped (D10).
- A probe that gets any HTTP error status falls back to the three files. Only a rejected `fetch` is an error (D6).
- Every behaviour change carries its reason in a code comment, the commit body, the PR's change → reason table and the release notes. Mandatory comments: D6, D8, D9, D11, D12, the hex decoder, and the legacy `onerror` fix.
- `dist/` and `types/` are committed. Rebuild with `npm run build-ts` only in Task 6, and revert rebuild noise as AGENTS.md says. `build/` legacy artifacts are rebuilt in Task 5.
- Each new or changed method has a test that calls it and asserts on the outcome. Break the implementation once and watch the test fail.

## Review Focus

1. **A file-list URL with a query or hash** (`/x/pinball.fset?v=2`): the stored name must be `<prefix>.fset`. Take the extension from the URL's path, not from `split(".").pop()` on the whole string. Tested in Task 2.
2. **Two concurrent calls on one instance, without `await` between them:** both resolve, with distinct consecutive ids, and no prefix is shared. Tested in Task 2.
3. **A callback that throws:** the Promise rejects with that error, and `onError` is not called. Tested in Task 3.
4. **`loadNFTMarker` given a `string[]`** (one marker as an explicit file list): resolves to `[id]` and calls `onSuccess(id)`. Tested in Task 3.
5. **Abort after the call has settled:** the caller's signal fires later and nothing happens. The listener was removed, and the result and the FS are unchanged. Tested in Task 2.

---

### Task 1: `NFTLoadError` and the byte helpers

**Files:**
- Create: `src/NFTLoadError.ts`
- Modify: `src/Utils.ts` (add two static methods; removals happen in Task 2)
- Modify: `src/abstractions/CommonInterfaces.ts` (add `NFTLoadOptions`)
- Test: `tests/vitest/load-helpers.test.ts`

**Interfaces:**
- Produces:
  - `export type NFTLoadErrorKind = "http" | "network" | "missing" | "format" | "rejected" | "argument";`
  - `export class NFTLoadError extends Error { readonly name = "NFTLoadError"; readonly kind: NFTLoadErrorKind; readonly url?: string; readonly status?: number; constructor(kind: NFTLoadErrorKind, message: string, opts?: { url?: string; status?: number; cause?: unknown }) }`. Pass `cause` to `super(message, { cause })`.
  - `export function errorCode(err: unknown): number`: `err.status` when `err` is an `NFTLoadError` of kind `"http"`, else `-1`. Use `err?.name === "NFTLoadError"`, not `instanceof`.
  - `export function withCallbacks<T>(work: Promise<T>, onSuccess: ((v: T) => void) | undefined, onError: ((code: number) => void) | undefined, empty: T): Promise<T>`: the D8 rule for the browser. With no callbacks it returns `work`. Otherwise, on success it calls `onSuccess?.(v)` and resolves `v`. On failure it calls `onError(errorCode(e))`, or `console.error(e)` when there is no `onError`, and resolves `empty`. A throw from `onSuccess` or `onError` rejects the returned Promise and is never routed to `onError`.
  - `Utils.fetchBinary(url: string, signal?: AbortSignal): Promise<Uint8Array>`. A non-OK response throws `NFTLoadError("http", …, { url, status })`. A rejected `fetch` throws `NFTLoadError("network", …, { url, cause })`, except when `signal?.aborted`, in which case the original rejection propagates.
  - `Utils.hexToBytes(hex: Uint8Array): Uint8Array`. Two ASCII hex digits per byte, both cases, with no intermediate string. Odd length or a non-hex byte throws `RangeError`.
  - `export interface NFTLoadOptions { signal?: AbortSignal; probeZFT?: boolean }` in `CommonInterfaces.ts`.

- [ ] **Step 1: Write the failing tests** in `tests/vitest/load-helpers.test.ts`:
  - `hexToBytes decodes upper and lower case`: `hexToBytes(ascii("00ff7Fa0"))` equals `Uint8Array [0, 255, 127, 160]`. `ascii` is a local `TextEncoder` helper.
  - `hexToBytes rejects odd length and non-hex`: `ascii("abc")` and `ascii("zz")` both throw `RangeError`.
  - `fetchBinary returns the bytes`: `await fetchBinary("/examples/DataNFT/zft/pinball.zft")` has `byteLength > 0`.
  - `fetchBinary maps a 404`: `/examples/DataNFT/missing.fset` rejects with `{ name: "NFTLoadError", kind: "http", status: 404, url: "/examples/DataNFT/missing.fset" }`.
  - `fetchBinary maps a rejected fetch`: stub `globalThis.fetch` with `vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))`. It rejects with `kind: "network"`, and `cause` is the `TypeError`.
  - `fetchBinary passes an abort through`: an already-aborted `AbortController` makes it reject with `name: "AbortError"`.
  - `withCallbacks`: four cases. (a) No callbacks with a rejected work rejects. (b) `onError` only, with a 404 `NFTLoadError`, calls `onError(404)` once and resolves `[]`. (c) `onSuccess` only, with a rejected work, calls `console.error` (spy) and resolves `[]`. (d) An `onSuccess` that throws rejects with that error, and `onError` is not called.
  - `NFTLoadError keeps its cause`: `new NFTLoadError("format", "m", { cause: c }).cause === c`, and `name === "NFTLoadError"`.
- [ ] **Step 2: Run them and watch them fail:** `npx vitest run tests/vitest/load-helpers.test.ts`. Expected: FAIL (the imports do not exist).
- [ ] **Step 3: Implement** the Interfaces above. Put a comment on `hexToBytes` saying it replaces `Uint8ArrayToStr` + `match(/.{1,2}/g)` + `parseInt`, which built two intermediate strings and an array per descriptor file.
- [ ] **Step 4: Run them and watch them pass:** the same command. Expected: all PASS.
- [ ] **Step 5: Commit:** `feat: add NFTLoadError, fetchBinary and a direct hex decoder (#685)`. The body gives the reasons: `cause` is kept; `fetchBinary` needs no module, so it can be unit-tested and #720 can reuse it.

### Task 2: The browser loader and batch in `ARToolkitNFTBase`

**Files:**
- Modify: `src/ARToolkitNFTBase.ts`: `loadCamera` (478); replace `addNFTMarkers` (509-653) and `ajax` (668-699)
- Modify: `src/abstractions/IARToolkitNFT.ts`: `addNFTMarkers` and `loadCamera` signatures
- Modify: `src/Utils.ts`: remove `fetchRemoteData`, `fetchRemoteDataCallback`, `checkZFT`, `Uint8ArrayToStr`
- Modify: `package.json`, `package-lock.json`: remove `axios` (`npm uninstall axios`)
- Modify: `tests/vitest/marker-limit.test.ts`
- Test: `tests/vitest/marker-loading.test.ts` (toolkit part)

**Interfaces:**
- Consumes: Task 1, all of it.
- Produces:
  - `ARToolkitNFTBase.addNFTMarkers(urls: Array<string | string[]>, callback?: (ids: number[]) => void, onError?: (code: number) => void, opts?: NFTLoadOptions): Promise<number[]>`, with the same signature in `IARToolkitNFT`.
  - `ARToolkitNFTBase.loadCamera(urlOrData: Uint8Array | string): Promise<number>`. It rejects with the `NFTLoadError` from `fetchBinary`.
  - Private, in the base only:
    - `loadMarkerSource(source: string | string[], signal: AbortSignal, probeZFT: boolean, written: string[]): Promise<string>`. It takes `"/markerNFT_" + this.markerNFTCount++` first, returns that prefix, and pushes every FS path it writes into `written`.
    - `storeZFT(bytes: Uint8Array, prefix: string, url: string, written: string[]): void`. It decompresses, decodes and writes `.fset`, `.iset` and `.fset3`. A failure throws `NFTLoadError("format")`.
    - `storeFile(bytes: Uint8Array, path: string, written: string[]): void`.
  - No new instance field is needed: `written` is per call. If one is added, it goes in the base constructor (D20).

The batch follows the spec's "The batch" steps 1 to 8 exactly. Two pieces of the algorithm the signatures do not determine:

```ts
// D11: wait for every load, aborted or not, before cleanup.
const results = await Promise.allSettled(
  urls.map((u) => this.loadMarkerSource(u, inner.signal, probe, written).catch((e) => {
    failure ??= e; inner.abort(); throw e;
  })),
);
// failure reported = caller's signal.reason if the caller aborted, else the first recorded failure
```

```ts
// probe (D6): any HTTP status -> three files; a rejected fetch -> NFTLoadError "network"
const res = await fetch(url + ".zft", { signal }); // catch: rethrow abort, else network
if (res.ok) storeZFT(new Uint8Array(await res.arrayBuffer()), prefix, url + ".zft", written);
else /* fall back to .fset/.iset/.fset3 via fetchBinary */;
```

The public `addNFTMarkers` is `withCallbacks(this.runBatch(urls, opts), callback, onError, [])`. Here `runBatch` is the private Promise-style batch, so the D8 rule lives in one helper. Extensions of file-list URLs come from `new URL(u, location.href).pathname` (Review Focus 1). `_addNFTMarkers` is wrapped in `try`: a throw becomes `rejected` with `cause` (D16). `vec.delete()` and `ret.delete()` run in `finally`.

- [ ] **Step 1: Write the failing tests** in `tests/vitest/marker-loading.test.ts`. The `toolkit` part reaches the wrapper as `(ar as any).artoolkitNFT` on a controller from `initWithDimensions(VIDEO_WIDTH, VIDEO_HEIGHT, CAMERA_PARAM, true)`.
  - Loop over `VARIANTS`:
    - `resolves with the real ids across calls`: `await tk.addNFTMarkers([MARKER_PINBALL])` gives `[0]`, then `[MARKER_KUVA]` gives `[1]`.
    - `settles after loading`: right after the `await`, `tk.getNFTData(1)` has `width > 0`.
    - `loads an explicit .zft with one request`: spy on `fetch`; `"/examples/DataNFT/zft/pinball.zft"` resolves to one id, and the spy is called once.
    - `probes .zft with one request`: `"/examples/DataNFT/zft/pinball"`; the spy is called once, with `…/pinball.zft`.
    - `falls back after a 404 probe`: `MARKER_PINBALL`; the spy URLs are `.zft`, `.fset`, `.iset` and `.fset3`.
  - On `VARIANTS[0]` only:
    - `rejects a 404 in Promise style`: `"/examples/DataNFT/missing"` with `probeZFT: false` rejects `{ kind: "http", status: 404 }`.
    - `callback style reports once`: the same URL; `onError` is called once with `404`, and the call resolves `[]`.
    - `two failing files give one onError`: `["/x/a.fset", "/x/a.iset", "/x/a.fset3"]` (all 404) calls `onError` once.
    - `network failure does not hang`: stub `fetch` to reject for `.iset`; it rejects `kind: "network"` within 5 s.
    - `403 probe falls back`: stub a `.zft` → 403; the three-file requests follow and resolve.
    - `probeZFT false makes no .zft request`: assert on the spy.
    - `junk .zft is format`: stub `.zft` → 200 with `new Uint8Array([1, 2, 3])`; it rejects `kind: "format"`.
    - `already-aborted signal`: rejects `name: "AbortError"`, and `fetch` is not called.
    - `abort during download`: on a fresh controller, abort after the first `fetch` call (a stub that awaits a gate). It rejects `AbortError`. A later `addNFTMarkers([MARKER_PINBALL])` resolves `[0]`, because nothing from the aborted call was registered.
    - `timeout`: `AbortSignal.timeout(50)` with a never-resolving stub rejects `name: "TimeoutError"`.
    - `FS cleanup`: after a failing call, `tk.FS.readdir("/")` has no entry starting with the prefixes the call used (`/markerNFT_<n>`, `/tempMarkerNFT_<n>`).
    - `empty inputs`: `[]` and `[""]` reject `kind: "argument"`, and `fetch` is not called.
    - `query string in a file list` (RF1): the three pinball files with `?v=2` resolve to one id.
    - `concurrent calls` (RF2): `Promise.all` of two calls (pinball, kuva) resolves to two single-id arrays whose ids are `{0, 1}`.
    - `late abort is ignored` (RF5): resolve with a controller's signal, then `abort()`. The result is unchanged, and `getNFTData(0)` still works.
    - `loadCamera 404`: `tk.loadCamera("/examples/Data/missing.dat")` rejects `{ name: "NFTLoadError", kind: "http" }`.
- [ ] **Step 2: Update `marker-limit.test.ts`**: the 19-marker batch now rejects. `await expect(loadMarkers(ar, batch)).rejects.toThrow()`. Also call `tk.addNFTMarkers(batch)` directly and expect `{ kind: "rejected" }`. The two loaded markers stay addressable (keep the existing `getNFTMarker` assertions).
- [ ] **Step 3: Run them and watch them fail:** `npx vitest run tests/vitest/marker-loading.test.ts tests/vitest/marker-limit.test.ts`. Expected: FAIL (`addNFTMarkers` returns an array, not a Promise).
- [ ] **Step 4: Implement** the Interfaces and the batch. Add the D6, D11 and D12 comments where those choices are made. Remove the four `Utils` methods and `axios`. Fix `loadCamera`'s `new Error(msg, error)`.
- [ ] **Step 5: Run the browser suite:** `npm run test:vitest`. Expected: everything PASSes, including `variant-constants.test.ts` unchanged and the existing callback-style suites (G5).
- [ ] **Step 6: Check the variant files are untouched:** `git diff --stat -- src/ARToolkitNFT.ts src/ARToolkitNFT_simd.ts src/ARToolkitNFT_td.ts`. Expected: no output.
- [ ] **Step 7: Commit:** `feat: load NFT markers with fetch and report one outcome (#685)`. The body lists the defects fixed (hangs, fake ids, double `.zft` download, fragmented `onError`, refusal sent to `onSuccess([])`, leaked `vec`/`ret`, stale FS files) and why D6, D11 and D12 were chosen.

### Task 3: The browser controller and the shared abstract

**Files:**
- Modify: `src/ARControllerNFTBase.ts:640-710` (`loadNFTMarker`, `loadNFTMarkers`)
- Modify: `src/abstractions/AbstractARControllerNFT.ts:95-104`
- Modify: `src/index.ts`, `src/index_simd.ts`, `src/index_td.ts`: export `NFTLoadError`, and `NFTLoadOptions` as a type
- Test: `tests/vitest/marker-loading.test.ts` (controller part)

**Interfaces:**
- Consumes: `ARToolkitNFTBase.addNFTMarkers` (Task 2), `withCallbacks` (Task 1).
- Produces:
  - `ARControllerNFTBase.loadNFTMarkers(urls: Array<string | string[]>, onSuccess?: (ids: number[]) => void, onError?: (code: number) => void, opts?: NFTLoadOptions): Promise<number[]>`
  - `ARControllerNFTBase.loadNFTMarker(url: string | string[], onSuccess?: (id: number) => void, onError?: (code: number) => void, opts?: NFTLoadOptions): Promise<number[]>`
  - `AbstractARControllerNFT` uses the subset in the spec's "Browser controller" section: `string` URLs, optional callbacks, `Promise<number[]>`.

Both controller methods call `addNFTMarkers` with **no** callbacks and apply `withCallbacks` once. `nftMarkerCount += ids.length` runs only on success, before `onSuccess`. Add the D8 comment here. The JSDoc shows Promise style (`try`/`catch`, `err.kind`) and callback style.

- [ ] **Step 1: Write the failing tests** in the same file, on the `controller` describe:
  - Loop over `VARIANTS`: `loadNFTMarkers resolves the real ids and counts them`. `await ar.loadNFTMarkers([MARKER_PINBALL])` gives `[0]`. Then `loadNFTMarker(MARKER_KUVA, onSuccess)` resolves `[1]`, and `onSuccess` got `1`. `process(blankFrame())` does not throw (`nftMarkerCount` is 2).
  - On `VARIANTS[0]`:
    - `no callbacks rejects with NFTLoadError`: a missing URL gives `{ kind: "http" }`.
    - `onSuccess only resolves [] and logs`: a `console.error` spy is called once.
    - `a failed load does not count`: load pinball, then a missing URL rejects; `(ar as any).nftMarkerCount` is `1`.
    - `string[] for loadNFTMarker` (RF4): the three pinball file URLs resolve `[0]`, and `onSuccess(0)`.
    - `a throwing callback rejects` (RF3): `onSuccess` throws `new Error("boom")`. The call rejects with `boom`, and `onError` is not called.
    - `opts reach the toolkit`: an already-aborted signal rejects `AbortError`.
    - `entry point exports`: `(await import("../../src/index")).NFTLoadError` is a function, and so are those of `index_simd` and `index_td`.
- [ ] **Step 2: Run them and watch them fail:** `npx vitest run tests/vitest/marker-loading.test.ts`.
- [ ] **Step 3: Implement** the Interfaces above.
- [ ] **Step 4: Run** `npm run test:vitest` and `npx tsc --noEmit -p .`. Expected: PASS, and no type errors (the Node controller still has its `@ts-ignore` until Task 4).
- [ ] **Step 5: Check the variant controllers are untouched:** `git diff --stat -- src/ARControllerNFT.ts src/ARControllerNFT_simd.ts src/ARControllerNFT_td.ts`. Expected: no output.
- [ ] **Step 6: Commit:** `feat: make ARControllerNFT.loadNFTMarker(s) resolve after loading (#685)`. The body explains D8.

### Task 4: Node

**Files:**
- Modify: `src/ARToolkitNFT_node.ts:481-527`
- Modify: `src/ARControllerNFT_node.ts:758-825` (both methods; delete the commented-out code and the two `//@ts-ignore`)
- Modify: `src/abstractions/IARToolkitNFT_node.ts` (if `tryAddNFTMarkers` is declared there)
- Modify: `src/index_node.ts`: export `NFTLoadError`
- Test: `tests/node/marker-loading.test.js`

**Interfaces:**
- Consumes: `NFTLoadError`, `errorCode` (Task 1). The `AbstractARControllerNFT` subset (Task 3).
- Produces:
  - `ARToolkitNFT_node.tryAddNFTMarkers(urls: string[]): number[]`. It throws `NFTLoadError`: `argument` (an empty list or an empty URL), `missing` (with `url` = the missing file), or `rejected` (with `cause` if `_addNFTMarkers` threw). Mark it `@internal` in the JSDoc: the controller uses it.
  - `ARToolkitNFT_node.addNFTMarkers(urls: string[], callback?, onError2?): number[]`. It is unchanged in shape and still synchronous (D9). It wraps `tryAddNFTMarkers`: on failure it logs, calls `onError2?.(errorCode(e))`, and returns `[]`. It never throws (D16).
  - `ARControllerNFT_node.loadNFTMarkers(urls: string[], onSuccess?: (ids: number[]) => void, onError?: (code: number) => void): Promise<number[]>` and `loadNFTMarker(url: string, onSuccess?: (id: number) => void, onError?: (code: number) => void): Promise<number[]>`. They are not `async`: callbacks run before the method returns (D9), and the result is a settled Promise. The D8 rule is applied synchronously. A throwing callback gives a rejected Promise. An empty URL gives `onError(-1)` plus a logged message.

- [ ] **Step 1: Write the failing tests** in `tests/node/marker-loading.test.js`. Set up as `multi-marker.test.js` does: `process.chdir(EXAMPLE_DIR)`, `require("../../dist/ARToolkitNFT_node.js")`, `initWithDimensions`, and the paths `DataNFT/pinball` and `DataNFT/kuva`.
  - `returns a Promise with the real ids, callbacks already run`: `const p = ar.loadNFTMarkers(["DataNFT/pinball"], cb)`. Before awaiting, `cb` has been called with `[0]`. `await p` gives `[0]`. Then kuva gives `[1]`.
  - `a missing file calls onError(-1) once and resolves []`.
  - `Promise style rejects with kind missing`: `assert.rejects(ar.loadNFTMarkers(["DataNFT/nope"]), { name: "NFTLoadError", kind: "missing" })`.
  - `an empty URL is argument`: `loadNFTMarker("")` rejects `{ kind: "argument" }`. In callback style, `onError(-1)`.
  - `toolkit addNFTMarkers stays synchronous and never throws`: with no callbacks, a missing file returns `[]`.
  - `NFTLoadError is exported`.
- [ ] **Step 2: Build and watch them fail:** `npm run build-ts`, then `node --test tests/node/marker-loading.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces above, with the D9 comment.
- [ ] **Step 4: Rebuild and run the Node suite:** `npm run build-ts`, then `npm run test:node`. Expected: all PASS, including the existing `multi-marker.test.js` (`loadMarkers` there still rejects on a missing marker) and `deprecations.test.js`.
- [ ] **Step 5: Run the real example:** `npm run test-node-example`. Expected: it loads pinball and reports detections, as before.
- [ ] **Step 6: Commit the source and tests only.** Revert `dist/` and `types/` here (`git checkout -- dist types`); Task 6 commits them. Message: `feat: give the Node controller the Promise loading contract (#685)`.

### Task 5: The legacy APIs and the relink

**Files:**
- Modify: `js/artoolkitNFT.api.js` (`addNFTMarker` 928, `addNFTMarkers` 944, `checkZFT` 1036, `loadCamera` 1092, `ajax` 1148, the controller's `loadNFTMarkers`)
- Modify: `js/artoolkitNFT_ES6.api.js` (the same functions; remove `loadNFTMarkerNew` at 289)
- Modify: `build/*` (relinked)
- Test: `tests/vitest/legacy.ts` (a new exported `legacyLoadingSuite`, called from each `legacy-*.test.ts` and `embed-es6.test.ts`)

**Interfaces:**
- Signatures unchanged: `addNFTMarkers(arId, urls, callback, onerror)` returns nothing, and `loadCamera(url, callback, errorCallback)`.
- Inside each file (they cannot import TypeScript):
  - `fetchBinary(url, signal)`, `hexToBytes(bytes)` and `loadMarkerSource(url, signal, written)`, with the same behaviour as Tasks 1 and 2, minus the options;
  - an internal `AbortController` per call;
  - `Promise.allSettled` before cleanup.
- `addNFTMarker(arId, url, cb, onError)` becomes `addNFTMarkers(arId, [url], (ids) => cb(ids[0]), onError)`.

The rules, from the spec's "Legacy APIs" section:
- `onerror` is called once, with the status or `-1`, checked first, with `console.error` when it is absent. Add a comment on the old bug: the status landed in `filename`.
- `urls.length >= 20` gives `onerror(-1)` before any request (D17).
- A throw from `_addNFTMarkers` (`ExitStatus`) goes to `onerror(-1)`.
- An empty `ret` goes to `onerror(-1)`, not `callback([])`.
- `vec` and `ret` are deleted.
- In `artoolkitNFT.api.js`, `loadCamera` keeps its numeric `errorCallback` payload and reports a network failure as `-1`. The ES6 file keeps passing an `Error`.
- The legacy JSDoc of `addNFTMarkers` states that each call replaces earlier markers (D17).

- [ ] **Step 1: Write the failing suite** `legacyLoadingSuite(build)` in `tests/vitest/legacy.ts`:
  - `a 404 calls onError once with 404`: `controller.loadNFTMarker("/examples/DataNFT/missing", ok, err)`; `err` is called once with `404`.
  - `an explicit .zft loads`: `/examples/DataNFT/zft/pinball.zft` calls `ok` with `0`.
  - `a native refusal calls onError once`: stub `fetch` so that `.fset` returns `new Uint8Array(16)` (an unreadable dataset). `onError` is called once, `ok` never, within 10 s.
  - `20 URLs are refused up front`: a `fetch` spy plus `artoolkitNFT.addNFTMarkers(id, Array(20).fill(MARKER_PINBALL), ok, err)`. `err(-1)` is called and the spy count is 0. A later pinball load then succeeds.
  - `addNFTMarker works`: `artoolkitNFT.addNFTMarker(id, MARKER_PINBALL, cb, err)`; `cb` gets a number.
  - On the ES6 builds only: `typeof controller.loadNFTMarkerNew === "undefined"`.

  Call it from `legacy-min`, `legacy-debug`, `legacy-wasm`, `legacy-simd`, `legacy-thread` and `embed-es6`.
- [ ] **Step 2: Run against the current `build/` and watch it fail:** `npx vitest run tests/vitest/legacy-wasm.test.ts`. Expected: FAIL (`onError` gets `undefined`).
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Relink in the pinned container:**
  `docker run --rm -v "$(pwd):/src" -w /src emscripten/emsdk:4.0.17 npm run build-no-libar`. Mount this worktree at `/src`: a worktree build can otherwise pick up the parent checkout's `node_modules`. Expected: the build ends with `Built at …`. `git status build/` shows the legacy and embed artifacts changed.
- [ ] **Step 5: Run the whole browser suite against the new `build/`:** `npm run test:vitest`. Expected: all PASS. This includes `module-surface.test.ts` and the non-legacy suites (the relink must not break them).
- [ ] **Step 6: Commit** `js/` and `build/`: `fix: give the legacy NFT loaders one outcome per call (#685)`. The body covers the `onerror` fix, the up-front 20-marker refusal (D17) and the removal of `loadNFTMarkerNew` (D18).

### Task 6: Artifacts, docs and verification

**Files:**
- Modify: `tsconfig.json` (`typedocOptions.entryPoints`: add `src/NFTLoadError.ts`)
- Modify: `README.md` (the ZFT section near line 65, and the loading example: Promise style, callback style, `{ signal }`, `probeZFT`)
- Modify: `dist/*`, `types/**`

- [ ] **Step 1: Make the docs edits.**
- [ ] **Step 2: Build:** `npm run build-ts`. Keep the bundles and declarations that changed because of the source. Then check `git diff --stat types/` and revert files whose only change is line endings, per AGENTS.md.
- [ ] **Step 3: Check the published declarations:**
  - `grep -n "NFTLoadError" types/src/index.d.ts types/src/index_simd.d.ts types/src/index_td.d.ts types/src/index_node.d.ts`: one export line each;
  - `grep -n "addNFTMarkers" types/src/ARToolkitNFTBase.d.ts`: shows `Promise<number[]>`;
  - `grep -c "loadNFTMarker" types/src/ARControllerNFT.d.ts`: 0, because it is inherited.
- [ ] **Step 4: Run everything:** `npm test`. Expected: both suites PASS. `variant-constants.test.ts` and `deprecations.test.js` pass with no edits to them.
- [ ] **Step 5: Check the variant files once more:** `git diff --stat origin/dev -- src/ARToolkitNFT.ts src/ARToolkitNFT_simd.ts src/ARToolkitNFT_td.ts src/ARControllerNFT.ts src/ARControllerNFT_simd.ts src/ARControllerNFT_td.ts`. Expected: no output.
- [ ] **Step 6: Manual check in a browser.** Serve the repository with COOP/COEP headers. Open one example with `examples/DataNFT/zft/pinball.zft` and one with `examples/DataNFT/pinball`. In the network panel, the `.zft` is requested once, and no request is synchronous. The marker is tracked in both.
- [ ] **Step 7: Downstream check.** Read ARnft's `Worker.ts` and aframe-nft's `markerLoader.js` against the final API, and write the result in the PR. ARnft's "loaded" now follows the load; aframe-nft's `Promise.resolve(…).catch(fail)` is unaffected.
- [ ] **Step 8: Commit:** `doc: document Promise-based NFT loading and rebuild dist and types (#685)`.
- [ ] **Step 9: Open the PR to `dev`.** It contains:
  - the "change → reason" table, from the spec's "Behaviour changes for callers";
  - the release-notes text, including the `file://` risk;
  - the downstream result;
  - a note that the Node classes stay separate copies (#734's open part);
  - "Closes #685, closes #676" deferred to the `dev` → `master` PR.
