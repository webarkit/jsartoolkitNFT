# Tracker worker follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close #753 (tracker spec hygiene), #749 (abort the worker's init) and #765 (a light
`./client` entry without WASM), as three independent PRs to `dev`.

**Architecture:** #753 is tests plus one optional `scope` parameter on `runHost`. #749 adds
`signal?: AbortSignal` to `NFTTrackerWorkerOptions`. #765 adds `src/client.ts`, built by one more
ES module variant into `dist/NFTTracker.client.mjs` and exported as `./client`.

**Tech Stack:** TypeScript, Vite library builds, Vitest browser mode (Playwright Chromium),
`node --test`.

**Spec:** `specs/2026-11-01-tracker-worker-followups-design.md`

## Global Constraints

- Each PR from its own branch cut from `origin/dev`, in its own worktree under
  `.claude/worktrees/` (`git worktree add <path> -b <branch> origin/dev`, then
  `git branch --unset-upstream`, `git submodule update --init`, `npm ci`). The order
  #753 → #749 → #765 is a preference; no PR depends on another.
- Commit types: `test:` (#753), `feat:` (#749, #765), `doc:` for README-only commits. PR title
  is the squash message, same format. Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npm run format` before every commit; `npm run format-check` clean. Never `prettier --write` the tree.
- A spec that starts a td worker goes in `THREADED` (`vitest.config.ts`). None of the new
  files below does: do not add them.
- No WASM rebuild. Only PR 3 changes `dist/` and `types/`.
- A behaviour change carries its reason in a code comment and in the PR description.

## Review Focus

1. An init reply that arrives after the abort: the call has already rejected with the reason;
   the late reply must not resolve anything or leave a live worker. (Task 4, test d.)
2. `addNFTTargets([""])` on Node reports `unknown`, not a thrown error. (Task 3.)
3. The host receiving a message that is not an object (`null`): it answers a version error,
   it does not throw in `onmessage`. (Task 2.)
4. The client's default `workerBase` when the file is not in a folder named `dist/`: it is the
   client file's own folder. (Task 6, Node test with a copied file.)
5. A caller's own abort reason (not a `DOMException`) is rejected as is, by identity. (Task 4.)

---

## PR 1 — #753, branch `test/753-tracker-spec-hygiene` (this worktree)

### Task 1: Independent filter spec, and no filtering call on a failed module

**Files:**
- Modify: `tests/vitest/tracker.test.ts` (`describe("JS filters")`, ~line 635 and ~798)

- [ ] **Step 1: Show the shared state.** Run only the last spec:
  `npx vitest run --project threaded tests/vitest/tracker.test.ts -t "keeps the old filter"`
  Expected: FAIL (`oneEuro` / `raw` are `undefined`: they come from an earlier `it`).
- [ ] **Step 2: Make it independent.** Delete the describe-level `let oneEuro` / `let raw`. In
  "a JS filter turns native filtering off…" use local `const`s. In "keeps the old filter when
  a new module fails", create its own pair:
  `const { t: oneEuro } = await withPinball({ filter: { type: "oneEuro" } });`
  `const { t: raw } = await withPinball({ filter: "none" });`, and dispose both in a `finally`
  (unless `withPinball` already registers them for disposal; follow what it does).
- [ ] **Step 3: Assert no filtering call.** In the same spec, after both trackers exist and
  right before `oneEuro.configure({ filter: { module: missing } })`:
  `const spy = vi.spyOn(ARToolkitNFT.prototype, "configure")` (`ARToolkitNFT` from
  `await variant.load()`), then after the rejection:
  `expect(spy.mock.calls.filter((c) => "filtering" in (c[0] ?? {}))).toEqual([])`,
  `spy.mockRestore()` in `finally`. Check it can fail: temporarily make the facade call
  `toolkit.configure({ filtering: false })` before loading the module, see FAIL, restore.
- [ ] **Step 4:** Run step 1's command, then the whole file
  (`npx vitest run --project threaded tests/vitest/tracker.test.ts`). Expected: PASS.
- [ ] **Step 5: Commit** `test: make the tracker filter specs independent (#753)`.

### Task 2: Direct tests of the worker host

**Files:**
- Modify: `src/tracker/worker/host.ts` (`runHost` signature)
- Create: `tests/vitest/tracker-host.test.ts`

**Interfaces:**
- Produces: `runHost(createNFTTracker, pthreadFile?: string, scope: HostScope = self as unknown as HostScope): void`.
  `HostScope` stays the file's interface; export it as a type. Why the seam: on the page
  `self` is the test iframe's `window`, whose `postMessage`/`onmessage` Vitest's browser
  runner may use; a fake scope avoids touching them. Say so in the JSDoc. Host entries
  (`host_*.ts`) are unchanged.

- [ ] **Step 1: Write the failing tests.** Helper `start(factory, pthreadFile?)` builds
  `scope = { onmessage: null, postMessage: vi.fn() }`, calls `runHost(factory, pthreadFile, scope)`,
  and `send(msg)` calls `scope.onmessage({ data: msg })` and resolves with the next
  `postMessage` argument. Stub tracker: `{ cameraMatrix: new Float64Array(16).fill(1), configure: vi.fn(async () => {}), addNFTTargets: vi.fn(async () => []), process: vi.fn(() => ({ targets: [] })), dispose: vi.fn() }`;
  `factory = vi.fn(async () => stub)`. Specs:
  - `"answers a protocol version mismatch with a TypeError"`: `{ v: 2, id: 1, type: "init", ... }` →
    `{ id: 1, type: "error", name: "TypeError" }`, message `/protocol version 2, expected 1/`;
    `factory` not called.
  - `"answers a non-object message with a version error"`: `send(null)` → `type: "error"`,
    `name: "TypeError"`, `id: undefined`.
  - `"refuses a second init"`: two inits → second is `{ type: "error", message: "NFTTracker worker: already initialised" }`; `factory` called once.
  - `"refuses a request before init"`: `configure` first → message `"NFTTracker worker: not initialised"`.
  - `"a failed init rejects later requests with its own error"`: factory rejects
    `new RangeError("bad width")` → init reply `name: "RangeError", message: "bad width"`; a
    following `configure` gets the same name and message.
  - `"refuses an unknown request type"`: after init, `{ v: 1, id: 3, type: "nope" }` →
    `name: "TypeError"`, message `/unknown request type nope/`.
  - `"passes the pthread file resolved against workerBase"`: `runHost(factory, "NFTTracker_td.pthread.js", scope)`,
    init with `workerBase: "https://example.test/dist/"` → `factory` called with
    `(config, { moduleOptions: { mainScriptUrlOrBlob: "https://example.test/dist/NFTTracker_td.pthread.js" } })`.
  - `"dispose answers with the last cameraMatrix"`: init, dispose → `type: "ok"`, `cameraMatrix` equal to the stub's; `stub.dispose` called.
- [ ] **Step 2:** `npx vitest run --project parallel tests/vitest/tracker-host.test.ts`.
  Expected: FAIL (`runHost` ignores the third argument, nothing is posted to the fake scope).
- [ ] **Step 3:** Add the `scope` parameter to `runHost` in `host.ts`.
- [ ] **Step 4:** Run step 2's command. Expected: PASS, 8 specs. Then `npx tsc --noEmit -p .`: clean.
- [ ] **Step 5: Commit** `test: test the tracker worker host directly (#753)`.

### Task 3: Node error kinds and controller teardown

**Files:**
- Modify: `tests/node/tracker.test.js`

- [ ] **Step 1: Write the specs.** The Node loader throws only `argument`, `missing`,
  `rejected` (`tryAddNFTMarkers`), so the reachable reasons are `network`, `capacity`,
  `unknown`; `format` is browser-only (state this in a comment and in the PR):
  - `"reports an empty source as unknown"`: `await t.addNFTTargets([""])` →
    `[{ status: "error", url: "", reason: "unknown" }]` (`assert.partialDeepStrictEqual` or field checks).
  - `"reports capacity past 20"`: `Array(21).fill("DataNFT/pinball")` → first 20 `loaded` with
    ids `0..19`, the 21st `{ status: "error", reason: "capacity" }`. `{ timeout: 180_000 }`:
    KPM rebuilds once per source, synchronously.
- [ ] **Step 2: Teardown.** In "poses equal the Node controller's matrixGL_RH", declare
  `let ctrl` before the `try` and call `ctrl?.artoolkitNFT.teardown()` in the `finally`
  (the Node controller has no dispose; `ARToolkitNFT_node.teardown()` is the call).
- [ ] **Step 3:** `node --test tests/node/tracker.test.js`. Expected: PASS. These are tests of
  existing behaviour: check each can fail by asserting `"format"` once, see FAIL, restore.
- [ ] **Step 4:** Full `npm test`, `npm run format-check`. Expected: both pass.
- [ ] **Step 5: Commit** `test: cover the Node tracker's error reasons and dispose its controller (#753)`,
  together with the design and this plan (`specs/2026-11-01-tracker-worker-followups-*.md`).
- [ ] **Step 6:** Push, open the PR to `dev` titled
  `test: tracker spec hygiene (independent filter specs, direct host tests, Node error kinds)`,
  body `Closes #753`, and note that `host.ts` is now measured in the page (part of #762).

---

## PR 2 — #749, branch `feat/749-worker-init-abort`, new worktree from `origin/dev`

### Task 4: `signal` on createNFTTrackerWorker

**Files:**
- Modify: `src/tracker/worker/createNFTTrackerWorker.ts`
- Create: `tests/vitest/tracker-worker-abort.test.ts` (fake workers only; parallel project)
- Modify: `README.md` ("Running in a worker"), `specs/2026-10-25-nft-tracker-facade-design.md` (D13 amendment)

**Interfaces:**
- Produces: `NFTTrackerWorkerOptions.signal?: AbortSignal`, with JSDoc: aborts the init only;
  the call rejects with `signal.reason` and the worker is terminated; use
  `AbortSignal.timeout(ms)` for a timeout; no effect once the call resolved.

- [ ] **Step 1: Write the failing tests.** A fake worker factory installed with
  `__setWorkerFactory` (as "dispose does not hang…" in `tracker-worker.test.ts` does):
  `{ onmessage, onerror, terminate: vi.fn(), postMessage: vi.fn() }`, answering init only when
  the test says (`answerInit()` posts `{ v: 1, id, type: "ok", cameraMatrix: new Float64Array(16) }`).
  `afterEach(() => __setWorkerFactory(null))`. Config: `{ width: 640, height: 480, cameraParam: "/x.dat" }`.
  - a. `"an aborted signal rejects before a worker starts"`: `const c = new AbortController(); c.abort();`
    → `rejects.toBe(c.signal.reason)`; factory not called.
  - b. `"abort during init terminates the worker and rejects with the reason"`: never answer;
    `c.abort(reason)` with `const reason = new Error("mine")` → `rejects.toBe(reason)`;
    `terminate` called once.
  - c. `"AbortSignal.timeout rejects with a TimeoutError"`: `signal: AbortSignal.timeout(20)`,
    never answer → rejects with `name: "TimeoutError"`; `terminate` called.
  - d. `"a late init reply after the abort changes nothing"`: abort, await the rejection, then
    `answerInit()` → no throw, `terminate` still called once.
  - e. `"abort after init has no effect"`: answer init, await the tracker, `c.abort()` →
    `terminate` not called; `t.configure({})` still posts a request.
- [ ] **Step 2:** `npx vitest run --project parallel tests/vitest/tracker-worker-abort.test.ts`.
  Expected: a, b, c, d FAIL (the option is ignored; b and c time out), e PASS.
- [ ] **Step 3: Implement.** In `createNFTTrackerWorker`: `opts.signal?.throwIfAborted()` before
  `selectBuild`/`workerFactory`; around the init `send`, a `once` abort listener that closes the
  wrapper (`close(new Error("NFTTracker worker: init aborted"))`, which terminates the worker and
  rejects the pending init) and makes the call reject with `signal.reason` (race the init against
  the abort, or reject with the reason from the listener); remove the listener in a `finally`.
  `close()` keeps its `Error` parameter: the reason is what the caller sees, the internal
  error is what `closed` holds. Comment why there is no default timeout (WASM compile on a
  slow phone takes seconds; #749).
- [ ] **Step 4:** Run step 2's command: PASS, 5 specs. Then
  `npx vitest run --project threaded tests/vitest/tracker-worker.test.ts`: PASS (no regression).
- [ ] **Step 5: Docs.** README "Running in a worker": the `signal` option with an
  `AbortSignal.timeout(30_000)` example. Facade design: a dated D13 amendment, init
  bounded by the caller's signal. `npm run build-ts` only to check `types/` gains `signal`;
  do not commit `dist/`/`types/` unless `git status` shows them changed, then commit them.
- [ ] **Step 6:** `npm test`, `npm run format-check`. Commit
  `feat: abort createNFTTrackerWorker's init with an AbortSignal (#749)`; PR to `dev`, `Closes #749`.

---

## PR 3 — #765, branch `feat/765-client-entry`, new worktree from `origin/dev`

### Task 5: The client bundle and its export

**Files:**
- Create: `src/client.ts`
- Modify: `vite.lib.config.mjs`, `tools/build-ts.mjs`, `package.json`, `typedoc.json`
- Modify: `tests/node/dist-paths.test.js`
- Create: `tests/node/client-entry.test.mjs`

**Interfaces:**
- Produces: `src/client.ts` exporting `createNFTTrackerWorker` and the types
  `NFTTrackerWorker`, `NFTTrackerWorkerOptions`, `BuildName`, plus the config/result types the
  wrapper's signatures name (re-exported from `./tracker/types`, as `src/index.ts` does). Not
  `__setWorkerFactory`. Built to `dist/NFTTracker.client.mjs`; export
  `"./client": { "types": "./types/src/client.d.ts", "default": "./dist/NFTTracker.client.mjs" }`.

- [ ] **Step 1: Write the failing tests.**
  - `dist-paths.test.js`: add `NFTTracker.client.mjs` to the per-worker loop's checks that apply
    (present, real `import.meta.url`, no `@webarkit` import, no `file://`), plus
    `"the client embeds no WASM"`: the file does not contain `AGFzbQ` (base64 of `\0asm`) or
    `WebAssembly.instantiate`, while `NFTTracker.worker.js` contains `AGFzbQ` (proves the marker);
    and `"the client stays small"`: size < 16,384 B (esbuild gave 4,160 B; margin for Vite's
    output; record that in a comment).
  - `client-entry.test.mjs`: `await import("@webarkit/jsartoolkit-nft/client")` exports exactly
    `["createNFTTrackerWorker"]`. `"starts the worker next to the client by default"`: stub
    `globalThis.location = { href: "https://example.test/app/" }` and `globalThis.Worker` with a
    fake class recording its URL and answering init; `createNFTTrackerWorker(config, { build: "default" })`
    → recorded URL `=== new URL("NFTTracker.worker.js", <client file URL>).href`. Review Focus 4:
    copy the client to a temp folder (`mkdtemp`), import it from there, same assertion against
    that folder.
- [ ] **Step 2:** `node --test tests/node/dist-paths.test.js tests/node/client-entry.test.mjs`.
  Expected: FAIL (no such file, no such export).
- [ ] **Step 3: Implement.**
  - `src/client.ts` as in Interfaces, with a header comment: the page side only, no WASM (#765).
  - `vite.lib.config.mjs`: variant `"client"` modelled on the **WORKER** branch (ES lib, no
    `define` of `import.meta.url`, no banner/footer/`renderBuiltUrl`: those would break the
    default `workerBase`), entry `src/client.ts`, `fileName: () => "NFTTracker.client.mjs"`,
    `codeSplitting: false`, `minify: true`. Document it in the header list.
  - `tools/build-ts.mjs`: `"client"` in `VARIANTS`; `owned()` matches `/^NFTTracker.*\.m?js$/`.
  - `package.json` export; `typedoc.json` entry point `src/client.ts`.
- [ ] **Step 4:** `npm run build-ts`, then step 2's command: PASS.
  `git status --porcelain dist types` lists only the new `dist/NFTTracker.client.mjs` and
  `types/src/client.d.ts`; any other changed bundle is a real change to investigate, not noise.
  The TypeDoc build (as in `deploy-docs.yml`) has 0 warnings.
- [ ] **Step 5: Commit** `feat: add a light ./client entry for createNFTTrackerWorker (#765)` with `dist/` and `types/`.

### Task 6: Example and README

**Files:**
- Modify: `examples/ARToolkitNFT_ES6_tracker_example.html`, `examples/tracker_worker_ES6.js`, `README.md`

- [ ] **Step 1:** The example drops `<script src="../dist/ARToolkitNFT.js">`;
  `tracker_worker_ES6.js` imports `createNFTTrackerWorker` from `../dist/NFTTracker.client.mjs`
  (fix its header comment). Keep `workerBase: "../dist/"`.
- [ ] **Step 2: Verify in the browser.** Serve the repo with COOP/COEP (as in the memory note on
  local serving) and open the example: the Network panel shows no `ARToolkitNFT*.js`, one
  `NFTTracker*.worker.js`, and the marker is found with a camera (or ask the user to check on a
  device; report which).
- [ ] **Step 3: README** "Running in a worker": import from `@webarkit/jsartoolkit-nft/client`;
  a bundled client must pass `workerBase`, because the default is the client file's own folder
  (in a Vite build that is `/assets/`, in the dev server `node_modules/.vite/deps/`); copy the
  four `NFTTracker*` files to `public/` (td only when cross-origin isolated).
- [ ] **Step 4:** `npm test`, `npm run format-check`. Commit
  `doc: use the client entry in the tracker example and README (#765)`; PR to `dev` titled
  `feat: a light ./client entry for createNFTTrackerWorker`, `Closes #765`.
