# Promise-based NFT marker loading with fetch

**Date:** 2026-10-21
**Issue:** #685 (includes #676)
**Related:** #720 (data-oriented tracker API, to be built after this; not implemented here)
**Depends on:** #734 (one shared `ARControllerNFT` / `ARToolkitNFT` implementation), which
lands first (D19)
**Status:** design agreed in discussion; this document is the written spec, awaiting approval

## Summary

Rewrite NFT marker loading so that it reports its outcome correctly, in every variant:

- the four TypeScript entry points: default, `_simd`, `_td` and `_node`;
- the two legacy APIs in `js/`.

In the browser variants, `fetch` replaces the hand-written `XMLHttpRequest` wrapper and the
`pending` counter:

- `ARToolkitNFT.addNFTMarkers` returns a `Promise<number[]>`. It resolves with the **real**
  marker ids, once the files are downloaded and registered.
- `ARControllerNFT.loadNFTMarker(s)` behave as their JSDoc already says.
- A failure always reaches the caller, exactly once. A load can no longer hang.
- A URL ending in `.zft` is loaded directly. A URL without an extension is checked for a
  `.zft` with a single asynchronous request, instead of a synchronous request followed by a
  second download (#676).
- A caller can cancel a load with an `AbortSignal`, which also gives timeouts through
  `AbortSignal.timeout()`.

The Node variant reads local files and has no network. It gets the same contract on the
controller: a Promise, real ids, one `onError`. The legacy APIs keep their callback-only
signatures and get the same correctness fixes.

The work also removes `axios`. It uses `new Error(msg, { cause })` and replaces the slow
`.zft` hex decode. It is shaped so that #720's facade can be built on top of it without
rework (see "Compatibility with #720").

## Why

The issue comes from reading the code, not from a user report. The loading path has several
defects that nobody has hit loudly, but that every downstream library works around:

- aframe-nft's `markerLoader` has a timeout for loads that never call back, and it
  de-duplicates `onError`;
- ARnft posts "loaded" after an `await` that resolves before anything is loaded.

The defects:

1. **Loads can hang.** `ajax` handles only `onload`. A network, DNS or CORS failure calls
   neither callback, and `pending` never reaches 0. A `.zft` that fails to decompress hangs
   too, because `loadZFT` reports the error but never decrements `pending`.
2. **The Promises lie.** `loadNFTMarker(s)` are `async` and documented to resolve to the
   marker ids. They resolve immediately, with the *indices of the input array*, before any file
   is downloaded.
3. **`.zft` costs two downloads and a blocked thread.** `Utils.checkZFT` downloads the whole
   file with a synchronous `GET` to read the status code, and `ajax` then downloads it again
   (#676).
4. **Errors are fragmented.** `onError` fires up to three times per marker. When the native
   loader refuses a batch, for example past the 20-marker limit, the browser variants call
   `onSuccess([])` instead of `onError`.
5. **Smaller defects:**
   - the embind `vec` and `ret` objects are never deleted;
   - files of a failed load stay in the Emscripten FS;
   - an explicit file-list entry is assumed to have exactly three files;
   - `throw new Error("msg", error)` drops the original error.

## Goals, non-goals, anti-goals

**Goals**

- G1. In every variant, a load ends in exactly one outcome: success with the real ids, or
  one error. No outcome is ever missing.
- G2. Browser variants: `await loadNFTMarker(s)` and `await addNFTMarkers` settle only after
  loading has finished, with the ids `_addNFTMarkers` returned.
- G3. `.zft` selection follows #676 option 1: by extension, otherwise one asynchronous probe.
- G4. Browser variants accept an `AbortSignal`, and a timeout through `AbortSignal.timeout()`.
- G5. Existing callback-style callers keep working without changes. This covers the
  examples, the workers in `js/`, ARnft and aframe-nft.
- G6. The structure leaves room for #720's per-source results, error reasons and in-memory
  sources. The three choices in "Compatibility with #720" are part of this design.

**Non-goals**

- Anything in #720:
  - the facade;
  - per-source results (`MarkerLoad[]`) and `removeMarkers`;
  - a `'capacity'` reason distinct from other native refusals;
  - marker sizes in millimetres;
  - the magic-bytes check that would make the probe ignore an SPA fallback page (D7).
- `.zft` support in the Node variant, which reads only `.fset` / `.iset` / `.fset3` today.
- Explicit file lists in the legacy APIs, which accept only URL prefixes today.
- `signal` and `probeZFT` in the Node variant and the legacy APIs (D4).
- A default timeout, download progress events, and the `fetch` `cache` option.
- Freeing a marker's files from MEMFS after it has loaded successfully.
- Any change to native code (`emscripten/**`, WebARKitLib). This includes the legacy native
  loader's per-call ids and missing rollback (D17), which get their own issue.
- Changes in ARnft or aframe-nft. They are checked for compatibility only.

**Anti-goals** (this work fails if any of these happens, even if the tests pass)

- An existing callback-style caller starts crashing, or stops receiving its callbacks. This
  includes a Node script that passes only `onSuccess` (D8).
- A marker that loads today stops loading. The probe must not turn a server's "not found"
  answer into an error (D6).
- The four TypeScript variants drift apart in structure.
- A behaviour changes without its reason being recorded (see "Recording the reasons").

## Decisions

Who made each decision is noted: **user** means it was agreed in the discussion, **design**
means it is this document's call, open to review.

- **D1 (user). Scope: every variant.** The four TypeScript entry points and both legacy APIs in
  `js/`. For the legacy APIs the instruction was to fix them "if possible". They can be
  fixed: this is JavaScript injected with `--pre-js`, so it needs a relink, not a native
  change.
- **D2 (user). Extras in the same PR:**
  - `fetch` instead of XHR;
  - removing `axios`;
  - `new Error(msg, { cause })`;
  - a faster hex decode.

  They are cheap and touch the same files.
- **D3 (user). `signal` in the browser variants.**
  - The option is `opts.signal`.
  - A timeout is the caller's `AbortSignal.timeout(ms)`. There is no default timeout.
  - Internally, a call aborts its own other downloads on its first failure.
- **D4 (user). No `signal` or `probeZFT` in Node or in the legacy APIs.** Node has no network
  to cancel. The legacy APIs are callback-only and have no options argument to carry them.
- **D5 (user). Three choices for #720:**
  - per-marker loading is separate from the batch policy;
  - errors carry the URL, a category and the cause;
  - downloading bytes is a separate step from storing and decoding them.

  See "Compatibility with #720".
- **D6 (design). A probe that gets any HTTP error status falls back to the three files.**
  #685's draft throws on any status other than 404. This design keeps today's behaviour, where
  any status other than 200 means "no `.zft`".
  - The reason: S3 and GCS answer **403** for a missing object when listing is not allowed,
    and today those markers load through the fallback. The draft would break them.
  - Only a network failure of the probe is an error. The three-file requests would fail the
    same way.
- **D7 (user). The magic-bytes check is left to #720.** A server that answers a missing `.zft`
  with an HTML page and status 200 is misdetected, as today. Vite's default SPA fallback does
  this. #720 Phase 3 already plans the fix, and it fits inside the probe without changing the
  API.
- **D8 (design). The callback rule: a call that passes a callback never rejects.**
  - **Callback style:** the caller passes `onSuccess` or `onError`, or both.
    - On failure, `onError` is called once, or `console.error` if there is no `onError`, and
      the Promise resolves to `[]`.
  - **Promise style:** the caller passes no callbacks. On failure, the Promise rejects.
  - #685's draft rejects whenever `onError` is missing. The reason for the difference is Node:
    an unhandled rejection terminates the process by default, and `examples/node/*.js` pass
    only `onSuccess`. Under the draft, a missing marker would turn today's log line into a
    crash.
  - The rule applies to `ARToolkitNFT.addNFTMarkers` and to the controllers alike.
- **D9 (design). Node stays synchronous inside.**
  - `ARToolkitNFT_node.addNFTMarkers` keeps returning `number[]` synchronously. It already
    returns the real ids, so changing it to a Promise would only break direct callers.
  - The Node controller's `loadNFTMarker(s)` return a Promise that is already settled. Their
    callbacks fire before the method returns, as today. A script that calls `process()` right
    after `loadNFTMarker()` keeps working.
- **D10 (design). One exported error class, `NFTLoadError`.** It is described under "The
  contract". An abort is **not** wrapped: the Promise rejects with `signal.reason`
  (`AbortError`, or `TimeoutError` for `AbortSignal.timeout`), as `fetch` does everywhere
  else.
- **D11 (design). Settle everything before deciding.** A failed call waits until every one
  of its downloads has settled, aborted or not, before it cleans up and reports. Otherwise a
  download that finishes late could write files after the cleanup.
- **D12 (design). No `AbortSignal.any()`.** The caller's signal is linked to the internal
  controller with an `abort` listener, removed when the call ends. The reason:
  `AbortSignal.any` needs Safari 17.4, and iOS users on older versions are a real part of the
  WebAR audience.
- **D13 (design). The legacy APIs use `fetch` too, with the same algorithm as the browser
  variants, minus the options.** One algorithm is easier to keep correct than two. The dead
  `addNFTMarker` is repaired by delegating to the fixed loader. `loadNFTMarkerNew` is removed
  (D18).
- **D14 (design). Released as a minor version (`feat`), not as a breaking change.** The
  return type of the browser `ARToolkitNFT.addNFTMarkers` changes from `number[]` to
  `Promise<number[]>`, but the old value was the input indices, so no correct code could rely
  on it. Every observable change is listed in the release notes.
- **D15 (design). An empty URL is rejected before any request, in every variant.** The Node
  controller already does this, with a string passed to `onError`. In the browser variants,
  an empty URL probes the page itself, and the result depends on the server.
- **D16 (design). Smaller calls settled after the builder check:**
  - **Node keeps `string` URLs only.** Explicit file lists would be new work in Node, which
    loads files in place through NODEFS. The Node controller is typed `string`, not
    `string | string[]`.
  - **Node's public `ARToolkitNFT_node.addNFTMarkers` never throws.** With no callbacks, a
    failure returns `[]` and logs with `console.error`, as today. Throwing would crash direct
    callers, which is an anti-goal. Only the controller follows D8 fully.
  - **A throw from `_addNFTMarkers` is caught** in every variant and reported as `rejected`,
    with the thrown value as `cause`. This covers the legacy `ExitStatus`.
  - **The legacy `loadCamera` keeps each file's `errorCallback` payload.** Unifying them would
    change one file's observable behaviour for no gain in a deprecated API.
- **D17 (user). The legacy native code is not changed.** `ARToolKitJS.cpp` and
  `ARToolKitJS_td.cpp` keep their semantics: per-call ids, no rollback, and replacement of
  earlier markers.
  - The legacy JS refuses a call with 20 or more URLs before any request, with `onerror(-1)`,
    so `exit(-1)` is never reached. The `ExitStatus` is still caught (D16).
  - The release notes and the legacy JSDoc state the limitation: with the legacy APIs, each
    call replaces the markers loaded before it, and all or nothing holds only within a call.
  - A separate issue is opened for the legacy native loader. The reason for not fixing it
    here: it would mean porting the core's multi-marker logic into deprecated code, and the PR
    would grow well beyond loading.
- **D19 (user). Order: #734, then this work, then #720.** #734 merges the per-variant copies
  of `ARControllerNFT` and `ARToolkitNFT` into one shared implementation, with no behaviour
  change. After it, the browser loader and controller methods in this design are written once,
  not three times.
  - Where this document says "three copies" or "`_simd`, `_td`", read "the shared browser
    implementation". The behaviour, the decisions and the contract do not change.
  - Before planning, re-read the code as #734 left it. Place the per-marker loader and the
    batch in the shared browser class, and the Node behaviour in whatever #734 uses for Node.
- **D18 (user). The ES6 legacy `loadNFTMarkerNew` is removed**, in favour of the existing
  `loadNFTMarker`. It calls a function that does not exist, so it has always returned a
  rejected Promise.

## Current state

### Browser variants (`src/ARToolkitNFT.ts`, `_simd`, `_td`, identical)

- **`addNFTMarkers(urls, callback, onError2): Array<number>`** (line 477):
  - starts every download, with `pending = urls.length * 3`;
  - returns `[0, 1, …]` at once.
- **Per URL string:**
  - `Utils.checkZFT(url + ".zft")` runs a synchronous `GET` (`src/Utils.ts:116`). On 200 it
    downloads the `.zft` again through `ajax`; otherwise it downloads the three files.
  - `onSuccessZFT` takes the prefix from `arguments[1]`.
  - `.bind(filename)` on arrow functions has no effect.
- **Per array entry:**
  - each URL is downloaded, and the extension of the URL names the file;
  - `pending` still counts three files per entry, whatever the length of the array.
- **`loadZFT`:**
  - decompresses with `_decompressZFT(prefix, temp)`;
  - decodes hex with `Uint8ArrayToStr`, then `match(/.{1,2}/g)`, then `parseInt`;
  - writes the three files.

  On a decompression failure it calls `onError` but never decrements `pending`, so the call
  hangs.
- **When `pending` reaches 0,** a single `_addNFTMarkers(vec)` call registers the batch.
  - `vec` and `ret` are not deleted.
  - An empty result, which is the native refusal, goes to `callback([])`.
- **`ajax`** (line 636) handles only `onload`, and on a status other than 200 calls
  `errorCallback(url, status)`.
- **`loadCamera`** uses `Utils.fetchRemoteData`, which is axios. It throws
  `new Error("…", error)`, which drops the cause.

### `ARControllerNFT` (browser, three copies)

- `loadNFTMarker(s)` are `async` and `await` the synchronous `addNFTMarkers`.
- `nftMarkerCount` is increased inside the success callback.
- `onSuccess` is called without a check, so leaving it out throws.
- `loadNFTMarkers` is typed `Array<string>`, while `addNFTMarkers` accepts
  `Array<string | string[]>`.

### Node variant

- **`ARToolkitNFT_node.addNFTMarkers`** mounts the working directory on NODEFS and checks
  that each file exists. Then it:
  - calls `_addNFTMarkers` and deletes `vec` and `ret`;
  - treats `markerIds.length !== urls.length` as a failure (`onError2(-1)`);
  - returns the real ids synchronously.

  It is already correct, apart from the contract.
- **`ARControllerNFT_node.loadNFTMarker(s)`** (lines 778 and 815) are not async:
  - they carry `//@ts-ignore` and loose types;
  - they keep the old async versions as commented-out code;
  - they return nothing;
  - on an empty URL, `onError` gets a **string**.

### Legacy APIs (`js/artoolkitNFT.api.js`, `js/artoolkitNFT_ES6.api.js`, same loader)

- **`addNFTMarkers(arId, urls, callback, onerror)`** has the same `pending`, `checkZFT` and
  `loadZFT` design as the TypeScript loader, plus three defects of its own:
  - **`onerror` always receives `undefined`.** `ajax` calls `errorCallback(status)`, but
    `onError` is `(filename, errorNumber) => onerror(errorNumber)`, so the status lands in
    `filename`.
  - **A `.zft` decompression failure reports an error and then registers anyway.**
    `onSuccessZFT` calls `onSuccess()` after `loadZFT` returns.
  - **`onerror` is called without a check**, so leaving it out throws.
- **`loadCamera`** differs between the two files:
  - in `artoolkitNFT.api.js` it goes through the same `ajax`, so a network failure hangs it,
    and an HTTP error passes the numeric status;
  - in `artoolkitNFT_ES6.api.js` it already uses `fetch` and passes an `Error` object to
    `errorCallback`.
- **Dead entry points:**
  - `artoolkitNFT.addNFTMarker` (exported) calls `Module._addNFTMarker`, which no binding
    defines. It throws inside the XHR callback, after its downloads;
  - the ES6 API's `ARControllerNFT.loadNFTMarkerNew` calls `artoolkitNFT.addNFTMarkerNew`,
    which does not exist, so it returns a rejected Promise.

  Neither can ever succeed. Nothing in the repository calls them.

### Native side (unchanged)

- The core's `addNFTMarkers` returns `{}` on every failure, then rolls back. The failures
  are:
  - the 20-marker limit (`PAGES_MAX`);
  - no KPM handle;
  - an unreadable `.fset3`, `.iset` or `.fset`;
  - `kpmSetRefDataSet` failing.
- The reason only reaches the log.

The legacy native `addNFTMarkers` (`emscripten/ARToolKitJS.cpp`, and the same code in
`ARToolKitJS_td.cpp`) does **not** behave the same:

- **The limit terminates.** A call with 20 or more markers runs `exit(-1)`, which reaches JS
  as a thrown `ExitStatus`. The limit is counted per call, not as a running total.
- **Ids restart every call.** Ids and page numbers are the index within the call, and
  `kpmSetRefDataSet` gets only the current batch, so each call replaces the earlier markers.
- **No rollback.** A failure partway through leaves the entries already pushed, and
  `surfaceSet[0..i-1]` of earlier markers has already been overwritten.

## Design

### The contract (every variant)

**Outcome.** Each call ends in exactly one outcome.

- **Success:** the ids returned by `_addNFTMarkers`, after every file is downloaded and the
  batch is registered.
- **Failure:** one error, and nothing from the call stays registered or in the FS.

**All or nothing.** A batch with one failing marker registers none of its markers. This is
today's behaviour and the native core's own. Markers loaded by earlier calls stay loaded,
except in the legacy APIs, where each call replaces them (D17).

**Callback style and Promise style.** These follow D8:

| Caller passes | Success | Failure |
|---|---|---|
| no callbacks | resolves to the ids | rejects with the error |
| `onSuccess` and/or `onError` | `onSuccess(ids)`, resolves to the ids | `onError(code)` once, or `console.error` if there is no `onError`, then resolves to `[]` |

An exception thrown *by a callback* is not turned into `onError`. It propagates as the
Promise's rejection, the way a throw inside an XHR callback propagates today.

**The `onError` code** stays numeric for compatibility:

- the HTTP status for an HTTP error;
- `-1` for anything else, including an abort.

**`NFTLoadError`** (D10) is exported from every entry point:

```ts
class NFTLoadError extends Error {
  readonly name = "NFTLoadError";
  readonly kind: "http" | "network" | "missing" | "format" | "rejected" | "argument";
  readonly url?: string;    // the file or prefix concerned
  readonly status?: number; // kind "http" only
  // message: human-readable; cause: the underlying error, when there is one
}
```

| `kind` | When |
|---|---|
| `http` | the server answered a download with a non-OK status (except a probe, D6) |
| `network` | `fetch` rejected: offline, DNS, CORS, connection reset |
| `missing` | Node only: a descriptor file does not exist on disk |
| `format` | a `.zft` failed to decompress or to decode |
| `rejected` | `_addNFTMarkers` returned fewer ids than markers requested. The message says the dataset may be unreadable or the 20-marker limit reached; the core's log says which |
| `argument` | an empty URL or an empty list (D15) |

Each dist bundle carries its own copy of the class, so `instanceof` fails across bundles.
The JSDoc says to test `err.name === "NFTLoadError"` and `err.kind`.

### Browser variants (`ARToolkitNFT.ts`, `_simd`, `_td`)

```ts
interface NFTLoadOptions {
  signal?: AbortSignal;
  probeZFT?: boolean; // default true
}

addNFTMarkers(
  urls: Array<string | string[]>,
  callback?: (ids: number[]) => void,
  onError?: (code: number) => void,
  opts?: NFTLoadOptions,
): Promise<number[]>;
```

**Three layers.** These are the three choices of D5:

1. **Getting bytes:** `fetchBinary(url, signal)` returns a `Uint8Array`.
   - It checks `res.ok`, then throws `NFTLoadError` `http` (non-OK status) or `network`
     (`fetch` rejected).
   - An abort propagates unwrapped.
   - It is variant-independent, so it lives in `Utils`.
2. **Loading one marker:** a private method that takes one `string | string[]` and returns
   its FS prefix, or throws.
   - It holds no batch policy: no knowledge of the other markers, and no aborting of them.
   - Storing and decoding take bytes, so a later caller can hand it bytes it already holds.
3. **The batch:** `addNFTMarkers`. It applies all-or-nothing, the internal abort, the cleanup,
   registration and the callback rule.

**Loading one marker:**

1. Take the prefix `"/markerNFT_" + markerNFTCount++` before any request. Prefixes stay
   unique across concurrent calls and are never reused.
2. Then by form:
   - **`string[]`:** download each URL and store it as `<prefix>.<extension of the URL>`. Any
     length is accepted. A list missing one of the three files fails at registration as
     `rejected`, as it does natively today.
   - **A string ending in `.zft`:** download it, store it, decompress it.
   - **Any other string, with `probeZFT` true:**
     - `fetch(url + ".zft")`;
     - OK: use those bytes, so there is one request;
     - any HTTP error status: fall back to the three files (D6);
     - `fetch` rejected: `network`.
   - **Any other string, with `probeZFT` false:** download `.fset`, `.iset` and `.fset3`
     directly.
   - **An empty string:** `argument`, before any request.
3. **Decompress** as today: `_decompressZFT(prefix, temp)`, then read and unlink the temp
   files, then unlink the archive.
   - A result other than 1 is `format`.
   - The hex decode reads the decompressed bytes directly, two ASCII hex digits per byte,
     with no intermediate string, regex or `parseInt`.
   - Odd length or a non-hex character is `format`.
   - Then write `<prefix>.fset`, `.iset` and `.fset3`.

**The batch:**

1. An empty `urls` is `argument`. A caller signal that is already aborted rejects
   immediately, before any request.
2. Create an internal `AbortController`. If `opts.signal` is given, add an `abort` listener
   that aborts it (D12). Remove the listener when the call ends.
3. Run the per-marker loads concurrently with the internal signal. All markers and all files
   download in parallel, as today.
4. On the first failure, record it and abort the internal controller, so the other downloads
   of this call stop.
5. Wait until **every** load has settled (D11).
6. **If anything failed:**
   - unlink every file written under this call's prefixes;
   - report the recorded failure, not the aborts it caused. If the caller's signal aborted,
     report its reason.
7. **Otherwise:**
   - register all prefixes in one `_addNFTMarkers(vec)`;
   - read `ret`;
   - delete `vec` and `ret`;
   - if fewer ids than markers came back, unlink the files and fail with `rejected`.
8. Apply the callback rule (D8).

**`loadCamera`.** It uses `fetchBinary`, which drops axios. It fails with the
`NFTLoadError` from `fetchBinary`, so the URL is in the error. It keeps accepting a
`Uint8Array`.

**`Utils`.**

- Remove `fetchRemoteData`, `fetchRemoteDataCallback`, `checkZFT` and, once unused,
  `Uint8ArrayToStr`.
- Add `fetchBinary` and the hex decoder.
- Remove the `axios` dependency from `package.json` and the lockfile.
- `Utils` is not exported from any entry point, so this changes no public API.

**`IARToolkitNFT`.** `addNFTMarkers` is typed as above.

### `ARControllerNFT` (browser, three copies)

```ts
loadNFTMarkers(
  urls: Array<string | string[]>,
  onSuccess?: (ids: number[]) => void,
  onError?: (code: number) => void,
  opts?: NFTLoadOptions,
): Promise<number[]>;

loadNFTMarker(
  url: string | string[],
  onSuccess?: (id: number) => void,
  onError?: (code: number) => void,
  opts?: NFTLoadOptions,
): Promise<number[]>; // [id]: the array type is kept for compatibility
```

- Both delegate to `addNFTMarkers` and apply the callback rule once, at the controller level.
- `nftMarkerCount += ids.length` happens only on success.
- The JSDoc shows both styles:
  - Promise style: `await` plus `try` / `catch`, then `err.kind`;
  - callback style.

### Node variant

- **`ARToolkitNFT_node.addNFTMarkers`** stays synchronous and returns `number[]` (D9):
  - it rejects an empty URL with `argument`;
  - it still calls `onError2` once;
  - it reports a missing file as `missing` and a native refusal as `rejected`.

  How the controller gets the `NFTLoadError` while the public method keeps its synchronous
  shape is left to the builder. One way: a private method that throws, wrapped by the public
  one.
- **`ARControllerNFT_node.loadNFTMarker(s)`:**
  - typed like the browser ones, but with `string` URLs only and without `opts` (D16);
  - no `//@ts-ignore`, and the commented-out code is removed;
  - they return a settled `Promise<number[]>` and follow the callback rule;
  - callbacks fire before the method returns (D9);
  - the empty-URL case passes `-1` to `onError` instead of a string, and logs the message.

### Legacy APIs (`js/artoolkitNFT.api.js`, `js/artoolkitNFT_ES6.api.js`)

- **Signatures do not change.** `addNFTMarkers(arId, urls, callback, onerror)` still returns
  nothing, and `loadCamera(url, callback, errorCallback)` keeps its byte-array and string
  forms.
- **Same algorithm as the browser variants (D13):**
  - a `fetch` helper replaces `ajax` and `checkZFT`;
  - an explicit `.zft` by extension;
  - the probe with fallback on any HTTP error status;
  - a `.zft` failure is an error, with no registration;
  - settle everything, clean up the FS, abort internally on the first failure;
  - `vec` and `ret` deleted;
  - a native refusal goes to `onerror` instead of `callback([])`;
  - the fast hex decode.
- **`onerror`:**
  - called once, with the HTTP status or `-1`;
  - checked before the call;
  - `console.error` when absent.

  The callback-only API has no Promise, so D8 reduces to this.
- **`loadCamera`** in `artoolkitNFT.api.js` reports a network failure to `errorCallback`
  instead of hanging. Each file keeps its current `errorCallback` payload: a number in
  `artoolkitNFT.api.js`, an `Error` in the ES6 file (D16).
- **The dead entry points:**
  - `artoolkitNFT.addNFTMarker(arId, url, cb, onError)` is repaired by delegation: it becomes
    `addNFTMarkers(arId, [url], ids => cb(ids[0]), onError)`;
  - the ES6 `loadNFTMarkerNew` is **removed** (D18, user). `loadNFTMarker` already exists in
    the same class and is the entry point to use. `loadNFTMarkerNew` has never worked, so no
    caller can depend on it.
- **The legacy controllers' `loadNFTMarkers` check `onSuccess`** before calling it.
- **The legacy native limit (D17):**
  - a call with 20 or more URLs calls `onerror(-1)` before any request;
  - a throw from `_addNFTMarkers` is caught and reported to `onerror`;
  - the native semantics stay as they are. Ids restart every call and each call replaces the
    earlier markers. All or nothing holds within a call only.
- **Relink:** the files are injected with `--pre-js`, so they need `npm run build-no-libar`
  in the pinned emsdk 4.0.17 container, and the rebuilt `build/` committed.

### Exports and types

- **Default, `_simd` and `_td` entry points:** export `NFTLoadError` (runtime) and
  `NFTLoadOptions` (type).
- **The Node entry point:** exports `NFTLoadError`.
- **Location:** the class lives in its own module under `src/`, shared by every variant.
  `NFTLoadOptions` goes in `src/abstractions/CommonInterfaces.ts`.

## Compatibility with #720

#720 is checked against this design and does not conflict with it. This work is effectively
the first part of #720 Phase 3:

- no `undefined` id;
- one `onError`;
- an asynchronous `.zft` probe.

Three choices keep the rest open (D5):

1. **Per-marker loading is separate from the batch policy.**
   - #720's `addMarkers` returns one `MarkerLoad` per source, so it allows partial success.
   - The per-marker loader holds no knowledge of the batch, and the internal abort lives only
     in `addNFTMarkers`. So the facade can run the same per-marker loader under its own policy
     without undoing anything.
2. **Errors carry the why.**
   - `NFTLoadError` has `url`, `kind` and `cause`. #720's
     `reason: 'network' | 'format' | 'capacity' | 'unknown'` maps from `kind`:
     - `http`, `network` and `missing` become `network`;
     - `format` stays `format`;
     - `rejected` becomes `unknown`, until the core reports the reason.
   - A plain `-1` would have forced #720 to redo error handling.
   - Telling `'capacity'` apart needs the core to report why it refused, which is #720's work.
   - Error subclasses lose their fields across `postMessage`, so #720's worker wrapper must
     copy `kind`, `url` and `status` into plain data. Its `MarkerLoad` values already do.
3. **Bytes are separate from URLs.** #720 accepts `Uint8Array` sources. Storing and
   decoding take bytes, so a byte source skips only the download.

Smaller points:

- **`probeZFT`.** #720 wants "no 404 noise", but the browser logs the probe's 404 and the
  page cannot hide it. The only way is not to probe, so keeping `probeZFT` lets the facade
  default it to `false`.
- **Node.** Aligning the Node controller on a Promise with real ids is what #720's "identical
  across builds" needs. `await` works on Node's synchronous `addNFTMarkers` too.
- **`signal`.** It cannot cross `postMessage`. #720's worker wrapper would need its own cancel
  message. This is not a conflict: #720 has no `signal` in `addMarkers`.
- **The callback rule (D8)** is a compatibility rule of the old API. The facade calls
  `ARToolkitNFT` without callbacks and gets rejections.
- **Prefixes.** They are monotonic and never reused, which fits #720's "stable for the
  tracker's lifetime, never reused while loaded".
- **The magic-bytes probe check** is #720's (D7). It fits inside the probe without API
  changes.

## Behaviour changes for callers

These go into the release notes:

1. **Browser:** `await loadNFTMarker(s)` and `await addNFTMarkers` settle after loading, with
   the real ids. `ARToolkitNFT.addNFTMarkers` returns a Promise.
2. **`onError` is called once per call**, never up to three times.
3. **A network failure, or a `.zft` that cannot be decompressed, calls `onError`** instead of
   hanging.
4. **A native refusal calls `onError`** instead of `onSuccess([])`:
   - in the browser variants, for example at the 20-marker limit. Node already did this;
   - in the legacy APIs, for an unreadable dataset. A call with 20 or more URLs is refused up
     front with `onerror(-1)`, instead of terminating the module with `exit(-1)`.

   Known limitation of the legacy APIs (D17): each call replaces the markers loaded before it.
5. **A URL ending in `.zft` is loaded directly.** No URL triggers a synchronous request, and
   a `.zft` is downloaded once.
6. **A URL without an extension still probes `.zft`, now with one asynchronous request.**
   - Markers without a `.zft` still log one 404 in the console.
   - `probeZFT: false` avoids it.
   - An SPA fallback page is still misdetected (#720).
7. **Callbacks are optional.** A Promise-style call rejects with `NFTLoadError`, or with
   the abort reason.
8. **Browser variants accept `{ signal }`** as the fourth argument.
9. **Node controller:**
   - `loadNFTMarker(s)` return a Promise;
   - an empty URL passes `-1` to `onError` instead of a string.
10. **Legacy APIs:**
    - `onError` receives the HTTP status instead of `undefined`;
    - `addNFTMarker` works;
    - the ES6 API's `loadNFTMarkerNew`, which always failed, is removed: use `loadNFTMarker`.
11. **Files of a failed load are removed from the Emscripten FS.**
12. **`axios` is no longer a dependency.**

## Testing

This follows AGENTS.md: every new or changed behaviour has a test that exercises it. Where
possible, break the implementation once and watch the test fail.

**Browser variants: `tests/vitest/marker-loading.test.ts`, looping over `VARIANTS`.**

- **Real ids.** Load pinball, then kuva in a separate Promise-style call. The second call
  resolves to `[1]`; the old code gave `[0]`.
- **Settles after loading.** Right after `await`, `getNFTData(id)` returns the marker.
- **A 404 on one file** (a missing marker URL):
  - Promise style rejects with `kind: "http"` and `status: 404`;
  - callback style calls `onError(404)` exactly once and resolves to `[]`.
- **Network failure.** `fetch` is stubbed to reject for one URL. The result is `network`, it
  arrives within the test's timeout, and nothing is registered.
- **Abort:**
  - a signal that is already aborted rejects with `AbortError`, and `fetch` is not called;
  - an abort during the downloads rejects, and no marker is registered;
  - `AbortSignal.timeout` with a stalled `fetch` stub rejects with `TimeoutError`.
- **`.zft`:**
  - `DataNFT/zft/pinball.zft` loads with exactly one request;
  - `DataNFT/zft/pinball`, through the probe, loads with one request;
  - a stub returning junk bytes as `.zft` fails with `format`, without hanging.
- **Fallback:**
  - `DataNFT/pinball` makes the `.zft` request (404), then the three files;
  - a 403 from a stubbed probe falls back too (D6);
  - `probeZFT: false` makes no `.zft` request.
- **Once only.** Two failing files in one call give one `onError`.
- **FS cleanup.** After a failed call, none of its prefixes exist in `FS`.
- **Inputs.** No callbacks at all works. An empty URL is `argument`.
- **`loadCamera`.** A 404 rejects with `NFTLoadError`.

**`tests/vitest/marker-limit.test.ts`.** Its expectation changes from `[]` to a `rejected`
failure. The two loaded markers must stay addressable.

**Legacy: `tests/vitest/legacy.ts`, on every legacy and embed build.**

- a 404 calls `onError` once, with 404;
- an explicit `.zft` loads;
- a native refusal, from an unreadable dataset (for example a stubbed corrupt `.fset`), calls
  `onError` once;
- a call with 20 URLs calls `onError(-1)` without any request, and the module keeps working;
- `addNFTMarker` loads;
- on the ES6 builds, `loadNFTMarkerNew` no longer exists on the controller.

**Node: `tests/node/`.**

- `loadNFTMarkers` returns a Promise with the real ids, and the callbacks have run before
  the method returns;
- a missing file calls `onError(-1)` once and resolves to `[]`;
- Promise style rejects with `kind: "missing"`;
- an empty URL is `argument`.

**Existing suites** keep passing unchanged. `tests/vitest/helpers.ts` uses callback style,
which covers G5.

**Manual:**

- run `examples/node/example_dist.js`;
- run one browser example with a `.zft` marker and one without, checking the network panel:
  one request for the `.zft`, and no synchronous request.

**Downstream.** Recheck ARnft's `Worker.ts` and aframe-nft's `markerLoader.js` against the
final code, and record the result in the PR:

- ARnft awaits, then posts "loaded", which is now after the load;
- aframe-nft uses `Promise.resolve(…).catch(fail)` with de-duplication, so it is unaffected.

## Recording the reasons

Every behaviour change carries its reason in four places:

- a code comment where the choice is made;
- the commit body;
- a "change → reason" table in the PR;
- the release notes.

The comments that must exist:

- **D6:** why any HTTP error status on the probe falls back (S3/GCS 403);
- **D8:** why a call with callbacks never rejects (Node terminates on an unhandled rejection;
  the examples pass only `onSuccess`);
- **D11:** why the cleanup waits for every download to settle;
- **D12:** why `AbortSignal.any` is not used;
- **D9:** why the Node methods stay synchronous inside;
- the hex decoder: what it replaces, and why;
- **the legacy `onerror` fix:** what was wrong (the status landed in `filename`).

## Delivery

- **Branch:** `feat/promise-nft-marker-loading` from `dev`, rebased after #734 is merged
  (D19).
- **One PR to `dev`**, titled `feat: make NFT marker loading Promise-based with fetch (#685)`.
- **Commits by area:**
  1. `Utils` and the browser loaders;
  2. the browser controllers;
  3. Node;
  4. the legacy APIs and the relink;
  5. tests;
  6. README (the ZFT section and the loading example) and the rebuilt `dist/` / `types/`.
- **Artifacts:**
  - `npm run build-ts` for `dist/` and `types/`;
  - `npm run build-no-libar` in Docker for the legacy builds;
  - commit both, following AGENTS.md's rebuild-noise guidance.
- **Closing issues:** a PR into `dev` does not close issues. Put "Closes #685, closes #676"
  in the `dev` → `master` PR, or close them by hand after the merge.

## Risks

- **Timing seen by callers changes.** Promise-style and `await`-ing callers now wait for the
  download.
  - ARnft's "loaded" message is the visible case. It becomes correct.
  - A caller that used the immediate resolution as "started" sees a delay.
- **`file://` URLs.** XHR can read `file://` in some WebViews, but `fetch` cannot.
  - Camera access needs a secure context, so WebAR pages run on http(s), and modern Cordova
    and Capacitor serve over a custom scheme.
  - The risk is accepted, and noted in the release notes.
- **Relinking the legacy builds** regenerates other `build/` artifacts. Rebuild in the
  pinned container, and check that the non-legacy artifacts still pass the suite.
- **The `markerNFTCount` naming** (prefixes in `ARToolkitNFT`) sits next to `nftMarkerCount`
  (loaded markers in the controller). They count different things. Leave them, but do not
  confuse them in the new code.

## Left to the builder

- The exact names of the `kind` values, and the file name of the `NFTLoadError` module.
- Whether the variant-independent pieces of the per-marker loader also move to a shared
  module. The pieces are the hex decoder, the probe decision and the cleanup list. Only
  `fetchBinary` and the decoder are required to be shared.
- How Node's public synchronous `addNFTMarkers` and the controller's need for an
  `NFTLoadError` are factored.
- How FS writes are tracked for cleanup.
- The test file layout, beyond the placement rules in AGENTS.md.
- The commit split, and the README wording.
- Whether to delete `Utils.string2Uint8Data`, which is already unused. It is harmless either
  way.
