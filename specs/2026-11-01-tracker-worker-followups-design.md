# Tracker worker follow-ups: spec hygiene, init abort, light client entry

Issues: #753, #749, #765. Follow-ups of #720 (project 2, #748). Related: #762 (worker host at
0 % coverage), #766 (oneEuro rigidity, touches the same filter specs), #763 (TypeDoc entry
points).

## Intent

`createNFTTrackerWorker` shipped in 1.15.0. Three gaps keep apps such as webarkit-studio
(webarkit/webarkit-studio#14) from moving to it:

- its tests share state and leave the worker host untested directly (#753);
- `init` can wait forever on a worker that never answers (#749);
- the page has to download a full build, WASM included, only to get the wrapper (#765).

## Delivery

Three pull requests to `dev`, in this order, each from its own branch off `dev`:

1. `test/753-tracker-spec-hygiene` — tests only; carries this design.
2. `feat/749-worker-init-abort` — one new option.
3. `feat/765-client-entry` — one new bundle and export.

The three are independent, each cut from `dev` in its own worktree; the order is a
preference. Each PR follows TDD: the failing test lands first in the working tree, then the
code.

## 1. #753: tracker spec hygiene

Goals:

- **Independent filter specs** (`tests/vitest/tracker.test.ts`, `JS filters`): "keeps the old
  filter when a new module fails" reuses the `oneEuro` and `raw` trackers that an earlier `it`
  created. It creates its own, so it passes run alone (`-t`). #766 will add specs here.
- **Bad filter module**: spy on `ARToolkitNFT.prototype.configure` and assert that a failing
  `configure({ filter: { module } })` makes no `filtering` call, besides rejecting.
- **Direct host tests**: a new `tests/vitest/tracker-host.test.ts` calls `runHost()` on the
  page thread with a fake scope (`onmessage` / `postMessage`) and a stub factory. Cases:
  protocol version mismatch, a second `init`, a request before `init`, a failed init that
  rejects later requests with its own error, an unknown request type. Running in the page,
  istanbul instruments `host.ts`, which closes the `host.ts` part of #762. The one source
  change: `runHost` takes an optional third parameter, `scope`, defaulting to `self`, because
  on the page `self` is the test iframe's `window`, which Vitest's runner may itself use.
- **Node error kinds** (`tests/node/tracker.test.js`): the table is `TargetLoadReason`,
  `network | format | capacity | unknown`. The Node loader throws only `argument`, `missing`
  and `rejected`, so Node can produce `network` (tested), `capacity` (21 loads) and `unknown`
  (an empty source); `format` is browser-only, which the PR states.
- **Dispose Node controllers** created in the Node pose test: `ctrl.artoolkitNFT.teardown()`
  (the Node controller has no dispose).

Non-goals: the other coverage gaps listed in #762; type-checking tests (#752).

## 2. #749: abort the worker's init

Approach chosen (A): one option, `signal?: AbortSignal`, in `NFTTrackerWorkerOptions`. A
timeout is `AbortSignal.timeout(ms)`, combined with other signals by `AbortSignal.any`.

Considered: `signal` plus `initTimeoutMs` (B: two ways to do one thing, and a precedence rule
to define); a generous default timeout (C: any fixed value can break a slow phone, which the
issue warns against).

Behaviour:

- A signal already aborted: reject with `signal.reason` before starting a worker.
- Aborted while `init` is pending: terminate the worker, reject with `signal.reason` (a
  `TimeoutError` or `AbortError` `DOMException`, or the caller's own reason).
- After `init` resolves the listener is removed: the signal does not govern later calls or
  dispose (dispose is already bounded, D13).
- Recorded in the facade design spec as an amendment of D13.

## 3. #765: light client entry

Approach chosen (A): document `workerBase`.

- New entry `src/client.ts`, exporting `createNFTTrackerWorker` and the types it uses, built
  as an ES module, `dist/NFTTracker.client.mjs`, by one more variant in
  `vite.lib.config.mjs`. `owned()` in `tools/build-ts.mjs` also matches it.
- `package.json` export `"./client"` (types + default). Added to `typedoc.json` entry points.
- The default `workerBase` stays `new URL(".", import.meta.url)`: right when the file is
  loaded as it is (CDN, examples); a bundler moves it, so bundled apps pass `workerBase`.
- README: `workerBase` when bundling, and the files to serve: `NFTTracker.worker.js`,
  `NFTTracker_simd.worker.js`, `NFTTracker_td.worker.js`, `NFTTracker_td.pthread.js` (td only
  when cross-origin isolated).
- `examples/ARToolkitNFT_ES6_tracker_example.html` imports the client; the only WASM it loads
  is the worker's.

Considered: static `new URL("./NFTTracker_*.worker.js", import.meta.url)` references, so that
bundlers emit the workers (B). It emits all three, and the td pthread may not survive
re-bundling; left as a possible follow-up once tested with a sample app.

Acceptance: the client is a few kB, contains no WASM, and is reachable through the export
map; the worker is still started from `workerBase`.

## Constraints

- `dist/` is committed and byte-reproducible; the #765 PR commits the rebuilt `dist/` and
  `types/`. No WASM rebuild is needed for any of the three.
- Every new method or option ships with a test that can fail (AGENTS.md).
- Specs that start a td worker stay in `THREADED` (`vitest.config.ts`).
- Prettier defaults; `npm run format-check` passes.

## Left to the builder

Test file names and helper shapes; the exact corrupt-dataset fixture for `format`; the size
budget asserted for the client bundle (a few kB, with margin).
