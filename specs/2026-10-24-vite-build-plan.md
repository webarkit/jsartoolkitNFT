# Vite build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace webpack with Vite for `npm run build-ts`. The published artifacts keep their names and formats. The threaded build gains a fixed-name module pthread worker, and Node gains an ESM entry (#577). #292 is verified.

**Architecture:**
- **Vite builds:** one shared Vite config factory and a small Node build script. The script runs `vite build` once per bundle: default, SIMD and threaded (UMD), then Node (CJS).
- **Node ESM:** a hand-written thin ESM wrapper (`.mjs`) re-exports the CJS Node bundle.
- **Types:** `tsc --emitDeclarationOnly` writes `types/`.
- **The three UMD fixes** proven by the spike (`.claude/worktrees/spike-vite/vite.spike.config.mjs`) go into the factory:
  - a global-exports footer;
  - a bundle-URL banner plus a `define` for `import.meta.url`;
  - `renderBuiltUrl` for the worker URL.

**Tech Stack:** Vite 8.3.4 (Rolldown), TypeScript `tsc`, Vitest browser mode (Playwright Chromium), `node --test`.

**Spec:** `specs/2026-10-24-vite-build-design.md`. D-numbers refer to its decisions; read it with this plan.

## Global Constraints

- **Unchanged artifacts:** names and formats stay as they are:
  - `dist/ARToolkitNFT.js`, `dist/ARToolkitNFT_simd.js`, `dist/ARToolkitNFT_td.js`: UMD, with the named exports also set as top-level globals;
  - `dist/ARToolkitNFT_node.js`: CommonJS;
  - `types/src/*.d.ts`, `main` and `types` in `package.json`.
- **The pthread worker** is `dist/ARToolkitNFT_td.worker.js`. It is ESM, loaded as a module worker (D3, D6).
- **The Node ESM entry** is `dist/ARToolkitNFT_node.mjs`, a thin re-export of the CJS file, with types in `types/src/index_node.d.mts` (D7).
- **The bundle URL** follows webpack's "auto" publicPath rule (D5.2). Each bundle uses its own global name.
- **`__esModule: true`** is kept on the UMD and CJS bundles (D8).
- **Pin `vite` to exactly `8.3.4`** in `devDependencies`. Remove `webpack`, `webpack-cli`, `babel-loader`, `ts-loader`, `@babel/core`, `@babel/preset-env`, `@babel/plugin-transform-runtime` and `webpack.config.js`. Remove `@babel/runtime` from `dependencies` (D8).
- **Delete stale files:** `dist/*.LICENSE.txt` (4 files) and `types/build/artoolkitNFT_ES6_wasm_td.worker.d.ts` (D8, D9).
- **No machine paths:** `grep -l "claude/worktrees" dist/*.js dist/*.mjs` must print nothing (#684).
- **Repository rules:**
  - PR to `dev`;
  - Conventional Commits, with `chore` for build changes;
  - every non-obvious config line carries its reason in a comment;
  - commit bodies give the reasons;
  - end each commit message with a blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - GPG signing is never bypassed.
- **Do not change** `build/`, `tools/makem.js`, `js/` or `src/`, except the JSDoc required by D13.

## Review Focus

1. **The threaded bundle loaded from a page in a different folder** (`examples/x.html` → `../dist/`). The worker must load from `dist/`. Covered in Task 1, by the classic-script threaded test served from `/dist/`, with the page at the Vitest root.
2. **A classic worker** calling `importScripts("/dist/ARToolkitNFT.js")` sees `ARControllerNFT` as a global. Covered in Task 1.
3. **`require()` of the Node entry** returns the same named exports and `__esModule === true` as before. Covered in Task 2.
4. **`import { ARControllerNFT } from "@webarkit/jsartoolkit-nft"`** on Node resolves the `.mjs` and gives the same class object as `require()`, so there is a single WASM instance and a single `NFTLoadError`. Covered in Task 2.
5. **A re-bundled consumer** where `document.currentScript` is null resolves the worker next to the last http(s) `<script>`, not against the page. Covered in Task 1, with a unit test of the URL helper.

---

### Task 1: Vite builds for the four bundles, types via `tsc`, webpack removed

**Files:**
- Create: `vite.lib.config.mjs`, the config factory `libConfig(variant)`.
- Create: `tools/build-ts.mjs`, which runs the builds in sequence, then `tsc`.
- Create: `tools/bundle-url.js`, the banner source (webpack's auto rule), shared with its unit test.
- Modify: `package.json`:
  - scripts: `build-ts` → `node tools/build-ts.mjs`; `dev-ts` → `node tools/build-ts.mjs --watch`;
  - devDependencies and dependencies, per the Global Constraints.
- Delete: `webpack.config.js`, `dist/*.LICENSE.txt`, `dist/602.ARToolkitNFT_td.js`, `types/build/artoolkitNFT_ES6_wasm_td.worker.d.ts`.
- Modify: `tests/vitest/dist-bundle.test.ts`, adding a threaded block and a classic-worker block.
- Create: `tests/vitest/dist-worker.js`, the classic worker fixture for the importScripts test.
- Create: `tests/node/bundle-url.test.js`.
- Modify: `tests/node/dist-paths.test.js`, so it scans `.js` **and** `.mjs`.
- Rebuild: `dist/` and `types/`.

**Interfaces:**
- **Produces** `libConfig(variant: "default" | "simd" | "td" | "node")` in `vite.lib.config.mjs`. It returns a Vite `UserConfig`:
  - `default` / `simd` / `td`: `build.lib` with entries `src/index.ts`, `src/index_simd.ts`, `src/index_td.ts`, `formats: ["umd"]` and `fileName` returning `ARToolkitNFT.js` / `ARToolkitNFT_simd.js` / `ARToolkitNFT_td.js`;
  - UMD names `ARToolkitNFT_exports`, `ARToolkitNFT_simd_exports`, `ARToolkitNFT_td_exports`;
  - bundle-URL globals `__artkBundleUrl`, `__artkSimdBundleUrl`, `__artkTdBundleUrl`;
  - `node`: `build.ssr` with `src/index_node.ts`, `formats: ["cjs"]` and `fileName` `ARToolkitNFT_node.js`. Node built-ins are external, `events` included.
- **Produces** `bundleUrlBanner(globalName: string): string` in `tools/bundle-url.js` (CommonJS, so `node --test` can require it). It returns the banner JS that assigns `globalThis[globalName]`.

- [ ] **Step 1: Write the failing tests**
  - `tests/node/bundle-url.test.js`: evaluate `bundleUrlBanner("__t")` in a `vm` context with stubbed globals, and assert:

```js
// worker-like: self.location set, no document
assert.equal(run({ self: { location: { href: "https://h/js/w.js" } } }), "https://h/js/");
// page with currentScript
assert.equal(run({ document: { currentScript: { src: "https://h/dist/ARToolkitNFT_td.js" } } }), "https://h/dist/");
// currentScript null → last http(s) <script>
assert.equal(run({ document: { currentScript: null, getElementsByTagName: () => [{ src: "https://h/a.js" }, { src: "https://h/app/bundle.js?v=1#x" }] } }), "https://h/app/");
// blob: prefix stripped
assert.equal(run({ self: { location: { href: "blob:https://h/js/123" } } }), "https://h/js/");
```

  - `dist-bundle.test.ts`, the threaded block:
    - load `/dist/ARToolkitNFT_td.js` as a classic `<script>`;
    - `expect(globalThis.crossOriginIsolated).toBe(true)`;
    - the globals `ARControllerNFT` / `ARToolkitNFT` are functions;
    - init on `loadCompositeFrames(0.5)`, `loadMarker(ar, MARKER_PINBALL, 120_000)` returns 0;
    - `processUntil(ar, both, () => isFound(ar, 0), 300)`, then `isFound(ar, 0)` is `true`.

    The spike test `tests/vitest/spike-vite-td.test.ts` in the spike worktree is the template.
  - `dist-bundle.test.ts`, the worker block: `new Worker("/tests/vitest/dist-worker.js")` (a classic worker). It runs `importScripts("/dist/ARToolkitNFT.js")` and posts `typeof ARControllerNFT`; expect `"function"`.
  - `dist-bundle.test.ts`, the default bundle: also assert `(globalThis as any).ARToolkitNFT_exports.__esModule === true`.
  - `dist-paths.test.js`: it now also scans `dist/*.mjs` (no file exists yet, so it passes vacuously) and `dist/ARToolkitNFT_td.worker.js`.

- [ ] **Step 2: Run them and see them fail.**
  - Run `node --test tests/node/bundle-url.test.js`. It fails because the module is missing.
  - Run `npx vitest run tests/vitest/dist-bundle.test.ts`. The threaded block fails against today's webpack `dist/`, because there is no `ARToolkitNFT_exports` and the threaded test may pass or fail; record which.

- [ ] **Step 3: Implement `tools/bundle-url.js`, the config factory, the build script and the package changes.**
  - The banner implements webpack's rule:
    1. in a worker (`typeof document === "undefined"`), use `self.location.href`;
    2. otherwise use `document.currentScript.src`, and if that is empty, the last `<script>` whose `src` matches `^https?:`;
    3. then strip `blob:`, the query and the hash, and keep up to the last `/`.
  - Footer:

```js
`if(typeof globalThis!=='undefined'&&globalThis.${name}){Object.assign(globalThis,globalThis.${name});}`
```

  - `define`: map `import.meta.url` to `globalThis.<urlGlobal>`.
  - `experimental.renderBuiltUrl`: for `hostType === "js"`, return

```js
{ runtime: `new URL(${JSON.stringify(f)}, globalThis.<urlGlobal>).href` }
```

  - Worker, td only: `worker: { format: "es", rollupOptions: { output: { entryFileNames: "ARToolkitNFT_td.worker.js" } } }`.
  - Output: `base: "./"`, `outDir: "dist"`, `emptyOutDir: false` (four builds share `dist/`), `rollupOptions.output.esModule: true`, `minify: true`.
  - Comment each of these with its reason from D5–D8.
  - `tools/build-ts.mjs`:
    1. delete the files it owns in `dist/`: `ARToolkitNFT*.js`, `ARToolkitNFT_td.worker.js`, `ARToolkitNFT_node.mjs`, `*.LICENSE.txt` and any `*.ARToolkitNFT_td.js`;
    2. run `vite build` with `libConfig(v)` for `default`, `simd`, `td` and `node`;
    3. run `tsc -p tsconfig.json --emitDeclarationOnly`.

    `--watch` passes `build.watch` and skips the clean step.

- [ ] **Step 4: Run `npm run build-ts`, then the tests.**
  - The bundle-URL test passes.
  - Vitest `dist-bundle` passes, all blocks.
  - `node --test tests/node/*.test.js` passes; the Node suites still `require("../../dist/ARToolkitNFT_node.js")`.
  - `git diff --stat types/` shows only the deleted stale file.
  - The worktree-path grep is empty.
  - Run the full `npm test`.

- [ ] **Step 5: Commit**
  - First commit: `chore: build the TypeScript bundles with Vite instead of webpack (#741)`. The body gives the D5–D9 reasons and the behaviour changes:
    - the worker rename and its module type;
    - `@babel/runtime` dropped;
    - the stale `LICENSE.txt` files deleted.
  - Second commit, `chore: rebuild dist and types with Vite`, for the artifacts.

### Task 2: Node ESM entry (#577)

**Files:**
- Create: `src-esm/index_node.mjs`, the hand-written wrapper. `tools/build-ts.mjs` copies it to `dist/ARToolkitNFT_node.mjs`.
- Create: `src-esm/index_node.d.mts`. `tools/build-ts.mjs` copies it to `types/src/index_node.d.mts`.
- Modify: `package.json` `exports`. Both `"."`'s `node` condition and `"./node"` become:

```jsonc
{ "import": { "types": "./types/src/index_node.d.mts", "default": "./dist/ARToolkitNFT_node.mjs" },
  "require": { "types": "./types/src/index_node.d.ts", "default": "./dist/ARToolkitNFT_node.js" } }
```

- Create: `examples/node/example_dist.mjs`, an ESM twin of `example_dist.js`.
- Create: `tests/node/esm-entry.test.mjs`. The `test:node` glob becomes `tests/node/*.test.{js,mjs}`; check that Node 24's `--test` expands it, and otherwise list both globs.

**Interfaces:**
- **Consumes:** `dist/ARToolkitNFT_node.js` from Task 1 (CJS, named exports `ARToolkitNFT`, `ARControllerNFT`, `ARLogLevel`, `NFTLoadError` and any others `src/index_node.ts` exports).
- **Produces:** `dist/ARToolkitNFT_node.mjs`, with the same names as named ESM exports.

- [ ] **Step 1: Write the failing test** `tests/node/esm-entry.test.mjs`:

```js
import * as esm from "@webarkit/jsartoolkit-nft";          // self-reference via exports, node condition → import
import { createRequire } from "node:module";
const cjs = createRequire(import.meta.url)("@webarkit/jsartoolkit-nft");
test("named ESM exports", () => { for (const k of ["ARToolkitNFT","ARControllerNFT","ARLogLevel","NFTLoadError"]) assert.equal(typeof esm[k] !== "undefined", true); });
test("one instance: ESM and CJS share classes", () => { assert.equal(esm.ARControllerNFT, cjs.ARControllerNFT); assert.equal(esm.NFTLoadError, cjs.NFTLoadError); });
test("CJS keeps __esModule", () => { assert.equal(cjs.__esModule, true); });
test("init works through the ESM entry", async () => { /* initWithDimensions(…, "examples/Data/camera_para.dat") from repo root resolves; expect ar.id >= 0 */ });
```

  The package's `exports` self-reference needs `"name"` in `package.json`, which already exists. Run the test from the repo root.

- [ ] **Step 2: Run it and see it fail.** Run `node --test tests/node/esm-entry.test.mjs`. It fails because the `.mjs` does not exist and no `import` condition is declared.

- [ ] **Step 3: Implement**
  - The wrapper: `import cjs from "./ARToolkitNFT_node.js"; export const { ARToolkitNFT, ARControllerNFT, ARLogLevel, NFTLoadError, … } = cjs;`. List every runtime export of `src/index_node.ts`.
  - Add a comment with the D7 reasons: the dual-package hazard, and the bundled ESM build failing on `__dirname`.
  - `index_node.d.mts`: `export * from "./index_node.js";`, plus the type-only exports.
  - The copy steps in `tools/build-ts.mjs`, and the `exports` change.

- [ ] **Step 4: Verify**
  - Run `npm run build-ts`, then `node --test tests/node/esm-entry.test.mjs`, which passes.
  - Run `cd examples/node && node example_dist.mjs`. It detects and tracks, as `example_dist.js` does.
  - Run the full `npm test`.
  - The worktree-path grep is empty.

- [ ] **Step 5: Commit** with `feat: ESM entry for Node with named imports (#577)`. The body gives the reasons.

### Task 3: Consumers of the old names, documentation, CI

**Files:**
- Modify: `tools/compare-builds.js` (around line 96 and its doc comment). It finds the threaded worker as `ARToolkitNFT_td.worker.js`, falling back to `*.ARToolkitNFT_td.js`, so an old webpack build can still be compared.
- Modify: `.github/workflows/main.yml`, the release `files`:
  - replace `dist/*.ARToolkitNFT_td.js` with `dist/ARToolkitNFT_td.worker.js`;
  - add `dist/ARToolkitNFT_node.mjs`;
  - drop the webpack chunk-id comment.
- Check: `.npmignore` and `publish.yml`. `npm pack --dry-run` must list `dist/ARToolkitNFT_td.worker.js`, `dist/ARToolkitNFT_node.mjs` and `types/src/index_node.d.mts`, and no `*.LICENSE.txt`.
- Modify: `src/ARToolkitNFT_td.ts`, or the JSDoc of `src/index_td.ts`: one line saying "`ARToolkitNFT_td.worker.js` must be served from the same folder as `ARToolkitNFT_td.js`" (D13).
- Modify: `README.md`:
  - the new "Threaded build: deploying" section with the D13 content: the two files side by side; COOP/COEP; for re-bundlers, how to copy the worker with Vite (`vite-plugin-static-copy` or `public/`) and with webpack (`copy-webpack-plugin`); the symptom (a 404, detection never finishing);
  - the Node section: the named ESM import is now supported (remove the caveats at ~266 and ~436);
  - every mention of webpack.
- Modify: `AGENTS.md`, the build section (`build-ts` is Vite plus tsc), version inlining (the Vite `define` / JSON import still inlines `version`; verify) and rebuild noise (re-check whether Vite output is reproducible and update the advice).

- [ ] **Step 1:** Make the edits.
- [ ] **Step 2: Verify.**
  - Run `node tools/compare-builds.js <old node bundle from origin/dev> dist/ARToolkitNFT_node.js`, extracting the old bundle to a scratch dir with `git show origin/dev:dist/ARToolkitNFT_node.js`. Expected: `identical`.
  - Run the browser comparison per its header, if runnable. Expected: identical for default and SIMD. Threaded is identical for records with filtering on and off alike, since only the build tool changed.
  - Record the outputs.
  - Run `npm pack --dry-run` and check the listing.
  - Re-run `npm run build-ts` and `git status`, and record whether `dist/` is byte-reproducible for AGENTS.md.
- [ ] **Step 3: Commit** with `doc: README and AGENTS for the Vite build, threaded worker deployment (#741)` and `chore: release list and compare-builds for the new worker name (#741)`.

### Task 4: #292 verification and final checks

**Files:** none committed, apart from a PR body draft kept outside the repo.

- [ ] **Step 1: #292.**
  1. `npm pack` the worktree.
  2. In a scratch directory outside the repo, run `npm create vite@latest repro -- --template vanilla-ts` (through `node --use-system-ca` for downloads), then `npm i <tarball>`.
  3. Write `src/main.ts` with `import { ARToolkitNFT, ARControllerNFT } from "@webarkit/jsartoolkit-nft"; console.log(typeof ARToolkitNFT, typeof ARControllerNFT);`.
  4. Run `npx tsc --noEmit` and `npm run build`.

  Expected: both succeed. Record the outputs. If the type check fails, report the error, and then fix the `exports` / `types` in `package.json` in this PR with its own commit and test.
- [ ] **Step 2: Manual examples.**
  - Serve the repo with `python python-server.py <free port>` (COOP/COEP).
  - Load `examples/ARToolkitNFT_ES6_threading_example.html` in Chromium (the built-in browser is fine; there may be no camera). Check the network panel: `dist/ARToolkitNFT_td.worker.js` returns 200, and the console shows no error.
  - Load one non-threaded ES6 example, which uses the classic `js/*.worker.js` + `importScripts`. The worker starts and no global is undefined.
- [ ] **Step 3:** Run the full `npm test` once. Expected: the suite counts are those of `dev` plus the new tests, with no failures.
- [ ] **Step 4:** Write the PR body draft:
  - a summary;
  - a change → reason table (D2–D13);
  - the behaviour changes for the release notes: the module worker and Firefox 79–113, the worker rename and the "same folder" rule, the new `.mjs` and its `import` condition, `@babel/runtime` dropped, the stale `LICENSE.txt` files removed;
  - the compare-builds results, the #292 result and the test counts;
  - "a PR into dev does not close issues" (#577, #292, #741 close on the dev→master merge);
  - the Claude Code footer.
