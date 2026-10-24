# Migrate the TypeScript build from webpack to Vite

**Date:** 2026-10-24
**Issue:** #741 (includes #577; verifies #292)
**Related:** #720. It comes before #720 project 2, the facade and the worker wrapper.
**Status:** design agreed in discussion; this document is the written spec, awaiting approval

## Summary

Replace webpack with Vite for `npm run build-ts`, which produces `dist/` and `types/`. Every published artifact keeps its name, format and contract, with two exceptions:
- the threaded build's pthread worker gets a fixed name;
- a new ESM build is added for Node (#577).

#292 is verified in a fresh Vite + TypeScript project.

A throwaway spike, the worktree `.claude/worktrees/spike-vite`, showed that the hardest piece works. Vite 8.3.4 builds the threaded UMD bundle with a separate pthread worker. Loaded as a classic `<script>`, that bundle exposes the globals and detects and tracks pinball in Chromium.

## Why

- **One build tool instead of two.** Vitest already runs on Vite.
- **The worker wrapper of #720 project 2** (`createNFTTrackerWorker`) is built and bundled far more simply with Vite's native worker handling. Migrating first means that wrapper is written once, which is the user's rule of not doing work twice.
- **Less custom configuration.**
  - The webpack-only `OmitImportMetaUrlPlugin` goes (#684).
  - So does the babel-loader / ts-loader / `@babel/transform-runtime` chain.
  - The four near-identical configs become one shared configuration.
- **The ESM build for Node (#577)** comes almost for free.

## Goals, non-goals, anti-goals

**Goals**

- **G1. Same artifacts, same contract.** These keep their names, formats and behaviour:
  - `dist/ARToolkitNFT.js`, `dist/ARToolkitNFT_simd.js` and `dist/ARToolkitNFT_td.js`: UMD, exposing `ARControllerNFT`, `ARToolkitNFT`, `ARLogLevel`, `NFTLoadError` and the other runtime exports as **top-level globals** for `<script>` and `importScripts()`, and as CommonJS/AMD exports;
  - `dist/ARToolkitNFT_node.js`: CommonJS;
  - `types/src/*.d.ts`;
  - the `package.json` `exports` map, `main` and `types`.
- **G2. The pthread worker** of the threaded build is `dist/ARToolkitNFT_td.worker.js`, a fixed name chosen by the user. Today it is `dist/602.ARToolkitNFT_td.js`, whose number changes from build to build.
- **G3. A new `dist/ARToolkitNFT_node.mjs`** (ESM) serves `import` on Node. `exports` gains `import` / `require` conditions for Node; `require()` keeps getting the CommonJS file (#577).
- **G4. #292 is verified:**
  - In a fresh Vite + TypeScript project (`npm create vite@latest`, react-ts or vanilla-ts), installing the packed package (`npm pack`) must give a clean type check and a working build for `import { ARToolkitNFT, ARControllerNFT } from "@webarkit/jsartoolkit-nft"`.
  - If that passes, #292 can be closed. If it fails, the cause is fixed here.
- **G5. `npm test` passes against the new `dist/`,** including `tests/vitest/dist-bundle.test.ts` and `tests/node/dist-paths.test.js` (no machine path in `dist/`, #684).
- **G6. webpack is gone.** No webpack, webpack-cli, babel-loader, ts-loader, `@babel/core`, `@babel/preset-env` or `@babel/plugin-transform-runtime` in `devDependencies`, and no `webpack.config.js`.

**Non-goals**

- Changing the Emscripten build (`tools/makem.js`, `build/`), the legacy APIs in `js/`, or any source in `src/`, except where the build needs it.
- ESM browser bundles. Browser consumers keep UMD. An ESM browser build can come later, for example with #720 project 2.
- Making the package `"type": "module"`.
- Any part of #720 project 2.

**Anti-goals** (failure even if the tests pass)

- **A classic worker using `importScripts("…/dist/ARToolkitNFT.js")` breaks.** This covers `js/*.worker.js`, the examples and ARnft, and also includes a worker whose globals change name.
- **A bundle embeds a path from the build machine** (#684).
- **The threaded build's worker stops loading** when the page and `dist/` are in different folders, as in the examples (`examples/x.html` loading `../dist/ARToolkitNFT_td.js`).
- **`require("@webarkit/jsartoolkit-nft")` on Node changes behaviour.**

## Approaches

These were considered; the user chose **A**.

- **A. Vite library mode, one build per bundle (chosen).**
  - A small script runs `vite build` once per bundle: default, SIMD, threaded, Node CJS and Node ESM. The bundles share one configuration factory.
  - Types come from `tsc --emitDeclarationOnly`.
  - Pro: one tool for building and testing, native worker support, no custom webpack plugin.
  - Con: Vite cannot emit several UMD bundles in one pass, so it takes 4–5 builds, a few seconds in total.
- **B. Rolldown directly, without Vite.**
  - Pro: more control.
  - Con: loses the shared tool with Vitest and Vite's worker handling, which are the main reasons for the migration, and needs more configuration by hand.
- **C. Keep webpack for the browser bundles and use Vite only for Node ESM and the future worker.**
  - Pro: the smallest change now.
  - Con: two build tools, the opposite of the goal.

## Decisions

**user** means agreed in the discussion; **design** means this document's call, open to review.

- **D1 (user).** Migrate to Vite, as a separate PR, before #720 project 2. Include #577 and verify #292.
- **D2 (user).** File names and formats stay the same. Nothing breaks.
- **D3 (user).** The pthread worker is `dist/ARToolkitNFT_td.worker.js`.
- **D4 (user).** Approach A.
- **D5 (design, from the spike). Three additions to the threaded build's configuration.** The spike needed each of them:
  1. **The globals.** Vite's UMD needs a library name and puts the exports under it. A footer copies them onto the global object (`Object.assign(globalThis, <name>)`), as webpack's nameless UMD did. The same applies to the default and SIMD builds. The UMD name should not collide with an existing export, for example `ARToolkitNFT_exports` / `_simd_exports` / `_td_exports`.
  2. **`import.meta.url`.** The Emscripten glue reads it, and UMD has no `import.meta`.
     - A banner captures the bundle's own URL when the script runs, with **webpack's full "auto" publicPath rule**, which the current `dist/ARToolkitNFT_td.js` runtime uses:
       - in a worker, `self.location`;
       - otherwise `document.currentScript.src`;
       - if that is empty (a re-bundled or ES-module consumer), the `src` of the **last `<script>` with an http(s) `src`**;
       - then strip a `blob:` prefix and any query or hash, and keep the directory.
     - The spike's simpler banner (falling back to `self.location.href`, keeping `blob:`) is **not** enough: it resolves the worker against the page for re-bundlers, and throws in a blob worker. Reproducing webpack's rule keeps the "nothing changes" promise of D2 (design call, after the builder check).
     - A `define` maps `import.meta.url` to that value. Each bundle gets its own name, for example `globalThis.__artkTdBundleUrl`, so loading two bundles cannot mix them up.
     - This replaces `OmitImportMetaUrlPlugin`. The glue uses SINGLE_FILE and never fetches a file relative to that URL, except for the pthread worker below.
  3. **The worker URL.** By default Vite resolves emitted assets against `document.baseURI` when the worker starts, which is the page and not the bundle. `experimental.renderBuiltUrl` resolves them against the URL captured at load instead.

  These are recorded as comments in the configuration, with the reason for each.
- **D6 (user, after the builder check). The pthread worker becomes a module worker.**
  - Today webpack rewrites the glue's `type: "module"` and emits `602.ARToolkitNFT_td.js` as a **classic** worker.
  - With Vite the worker stays ESM (`worker.format: "es"`, `type: "module"`), as Emscripten generates it.
  - **Cost:** browsers that have SharedArrayBuffer under COOP/COEP but no module workers lose the threaded build. That is Firefox 79–113 (114 shipped in June 2023, and ESR 115 already has module workers) and some old Safari versions.
  - The user accepted this (option A). It goes in the release notes. Producing a classic worker was rejected: the spike does not cover it, and the glue's `import.meta` would need converting.
  - Only the worker's name is fixed (`worker.rollupOptions.output.entryFileNames`).
- **D7 (design, after the builder check). The Node builds.**
  - **CJS:** Vite builds `src/index_node.ts` once, as `ARToolkitNFT_node.js`, with Node built-ins (`fs`, `path`, `crypto`, `url`, `events`, …) external. `src/ARControllerNFT_node.ts` itself uses `require('events')`, not only the glue.
  - **ESM:** `ARToolkitNFT_node.mjs` is a **thin ESM wrapper** that imports the CJS file and re-exports its named exports (`ARControllerNFT`, `ARToolkitNFT`, `ARLogLevel`, `NFTLoadError`, …). The reasons:
    - **The dual-package hazard.** Bundling `index_node.ts` a second time as ESM would give an app that loads both files two WASM instances and two `NFTLoadError` classes, so `instanceof` would fail.
    - **The bundled ESM build fails at `init()`.** A scratch build showed it: the Emscripten glue reads `__dirname`, which does not exist in ESM.
  - **Types for the `import` condition:** a generated `types/src/index_node.d.mts` that re-exports from `./index_node.js`, so that `node16`/`nodenext` resolution sees ESM declarations.
  - **Erratum (final review):** the wrapper and the `.d.mts` first provided no default export. That broke `import pkg from "@webarkit/jsartoolkit-nft"`, which worked before this branch (the `node` condition resolved to the CJS file) and is documented in the released README (1.14.0). Both now provide `export default cjs` / a default typed as the module namespace, for backward compatibility with the documented default import.
  - **Verification:** an ESM example (`examples/node/example_dist.mjs`) and a Node `.mjs` test.
- **D8 (design). Output target.**
  - Vite's default browser target replaces babel. The current `dist/` is already modern: native classes, `async`/`await` and optional chaining; babel only processed the `.ts` sources. Nothing is lost.
  - `@babel/runtime` leaves `dependencies`. That is one less runtime dependency for consumers, and it goes in the release notes.
  - **The four `dist/*.LICENSE.txt` files are deleted.** They are stale: the current build no longer produces them, they were last changed on 2025-05-07, and no bundle refers to them. They still ship in the npm package today, because there is no `files` field and `.npmignore` does not exclude them. `main.yml`'s release list does not reference them.
  - **The `__esModule` marker is kept** (`output.esModule: true`) on the UMD and CJS bundles, as webpack set it, so a default import keeps resolving the same way for bundlers and TypeScript-compiled CommonJS consumers (design call).
- **D9 (design). `types/`** comes from `tsc --emitDeclarationOnly`, using the existing `tsconfig.json` settings (`declarationDir: ./types`).
  - A scratch run by the builder check matches today's `types/` exactly.
  - The one exception is the stale `types/build/artoolkitNFT_ES6_wasm_td.worker.d.ts`. Its source no longer exists and tsc never regenerates it, so it is deleted.
  - The new `index_node.d.mts` from D7 is the only addition.
- **D10 (design). Scripts.**
  - `build-ts` runs all the Vite builds plus `tsc`.
  - `dev-ts` becomes a watch mode, `vite build --watch` per entry, or is dropped if no one uses it. The builder checks.
  - `docs` (typedoc) is unchanged.
- **D11 (design). CI and release.**
  - `main.yml` keeps calling `npm run build-ts`.
  - The GitHub release file list in `main.yml` (`softprops/action-gh-release`, `fail_on_unmatched_files: true`) replaces the `dist/*.ARToolkitNFT_td.js` glob, which matched the `602.` chunk, with `dist/ARToolkitNFT_td.worker.js`, and adds `dist/ARToolkitNFT_node.mjs`. With `fail_on_unmatched_files`, a list that misses this change fails the release, as the user pointed out.
  - The comment about the webpack chunk id goes.
  - `publish.yml` packs from `files` / `.npmignore`; check that the new files are included.
  - The tests run in `CI.yml`; `main.yml` only builds.
- **D12 (design, after the builder check). Other consumers of the old names, updated in the same PR:**
  - `tools/compare-builds.js` hardcodes the `602.` chunk (line 96 and its doc comment). It must accept the new worker name, and the old one too, so an old webpack build can still be compared with a new Vite build.
  - `tests/node/dist-paths.test.js` scans only `.js` files. It must also cover `.mjs`.
  - `AGENTS.md` (the build section, version inlining and rebuild noise) and `README.md` (lines ~266 and ~436, the "named import will come with a future ESM build" caveats) describe webpack and the missing ESM build; both are updated.

- **D13 (user). Instructions for users of the threaded build.** The examples work as they are. A user building their own page or app also needs to know that `ARToolkitNFT_td.worker.js` must be served **from the same folder as `ARToolkitNFT_td.js`**, because the bundle resolves it next to itself at runtime. So:
  - **README:** a short "Threaded build: deploying" section. It covers:
    - the two files that must sit side by side, and the COOP/COEP headers that `SharedArrayBuffer` needs (`python-server.py` as the example);
    - for apps that re-bundle the package (Vite, webpack): the bundler does not see the worker, so copy `node_modules/@webarkit/jsartoolkit-nft/dist/ARToolkitNFT_td.worker.js` next to the emitted `ARToolkitNFT_td.js`. Give one example each for Vite (`vite-plugin-static-copy`, or `public/`) and webpack (`copy-webpack-plugin`);
    - the symptom when the worker is missing: a 404 for `ARToolkitNFT_td.worker.js` in the network panel, and detection never finishing.
  - **JSDoc:** the `ARToolkitNFT_td` entry point's JSDoc, on its module or class, carries the same rule in one line, so editors show it.
  - **Release notes:** the rename, and the "same folder" rule.
  - **Not in this PR:** an option to pass the worker URL explicitly, for apps that cannot place the file next to the bundle. The glue already honours `Module.mainScriptUrlOrBlob`; exposing it is a follow-up, natural with #720 project 2's worker wrapper.

## Current state

- **`webpack.config.js`.** It has four configs:
  - `default`, `simd` and `threaded`: UMD with no library name (`globalObject` is `self`/`this`), with babel-loader + ts-loader and `@babel/transform-runtime`;
  - `node`: `target: "node"`, `commonjs2`.

  The browser configs use `OmitImportMetaUrlPlugin` (#684). `threaded` emits the pthread worker as a chunk (`602.ARToolkitNFT_td.js`) and cleans stale chunks.
- **`package.json`:**
  - `main: dist/ARToolkitNFT.js`, `types: types/src/index.d.ts`;
  - an `exports` map with `node` / `browser` / `default` for `.`, plus `./simd`, `./td`, `./node`, `./dist/*` and `./package.json`;
  - `dependencies: @babel/runtime`.
- **Consumers:**
  - classic workers use `importScripts("../dist/ARToolkitNFT.js")` (`js/artoolkitNFT_ES6.worker.js` and others);
  - the threaded example loads `../dist/ARToolkitNFT_td.js` with a `<script>` from `examples/`;
  - the Node examples and the Node tests `require` `dist/ARToolkitNFT_node.js`;
  - `tests/vitest/dist-bundle.test.ts` loads `/dist/ARToolkitNFT.js` with a `<script>`.
- **CI:** `main.yml` runs `npm run build-ts` after the WASM build, commits `build/` and `dist/` on master, and attaches the files to the GitHub release.

## Testing

- The existing `npm test` passes against the new `dist/`.
- **A new browser test for the threaded bundle,** like the spike's:
  - load `/dist/ARToolkitNFT_td.js` as a classic script, cross-origin isolated;
  - the globals are present;
  - pinball is detected and tracked.

  This is the only test that exercises the pthread worker URL. Extend `dist-bundle.test.ts`, or add a sibling file.
- **A worker test:** a classic `Worker` that runs `importScripts("/dist/ARToolkitNFT.js")` and posts back `typeof ARControllerNFT`. This guards the globals contract for workers.
- **Node ESM:** a test (`.mjs`) that imports the package's Node entry by its `import` condition and checks the named exports. Also run `examples/node/example_dist.mjs`.
- **`dist-paths.test.js`:** covers the new files, including `ARToolkitNFT_td.worker.js` and `ARToolkitNFT_node.mjs`.
- **#292:** a reproduction in a temporary Vite + TypeScript project with the packed tarball. Record the result in the PR; it is not a committed test.
- **Manual:** one browser example and the threaded example via `python-server.py` (COOP/COEP); `npm run test-node-example`.

## Recording the reasons

- Every non-obvious line of the configuration carries its reason in a comment: the D5 additions, the D6 worker format, the D7 externals and the D8 target.
- The commit bodies and a "change → reason" table in the PR do the same.
- Behaviour changes for the release notes:
  - the worker file is renamed, and is now a module worker (D6);
  - `ARToolkitNFT_node.mjs` and its `import` condition are new;
  - `@babel/runtime` is gone;
  - the `.LICENSE.txt` files are gone;
  - the output target is modern.

## Delivery

- **Branch:** `chore/vite-build` from `dev`.
- **One PR to `dev`:** `chore: build the TypeScript bundles with Vite instead of webpack (#741, #577)`. A conventional `chore` type, because the build changes. `build/` is untouched; `dist/` and `types/` are rebuilt and committed.
- #292 and #577 close on the `dev` → `master` merge, or by hand.

## Risks

- **Consumers that re-bundle the UMD bundle,** such as ARnft and aframe-nft. Their bundler cannot see the worker URL, which is built at runtime, so it will not copy `ARToolkitNFT_td.worker.js`. This is the same as webpack's `602.ARToolkitNFT_td.js`. With D5.2 reproducing webpack's URL rule, the worker resolves against the same folder as before. The README says the worker file must sit next to `ARToolkitNFT_td.js`.
- **A bundle loaded with `importScripts` inside a worker** takes its URL from `self.location`, which is the worker's own URL, as with webpack. The worker URL then resolves against the worker's folder. Behaviour is unchanged.
- **Vite 8 uses Rolldown,** whose UMD output and `renderBuiltUrl` are still marked experimental. Pin the version, and keep the threaded browser test as the guard.

## Left to the builder

- The file layout of the Vite configuration (one factory plus a build script, or a config array) and the script name.
- Whether the Node ESM build bundles the glue or uses `createRequire`.
- The exact UMD library names and the bundle-URL variable names.
- How `dev-ts` is replaced.
- The test file names, following the AGENTS.md placement rules.
- The commit split.
