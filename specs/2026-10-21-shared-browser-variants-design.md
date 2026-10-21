# One shared ARControllerNFT / ARToolkitNFT for the browser variants

**Date:** 2026-10-21
**Issue:** #734
**Status:** design approved 2026-10-21; nothing implemented
**Branch:** `refactor/shared-variants`, from `origin/dev` (138b134)

## Summary

`src/` keeps one copy of the controller and one copy of the WASM wrapper per build: default,
`_simd`, `_td` and `_node`. The three browser copies are about 99% identical. This refactor
moves each browser class into one shared base class. `ARControllerNFT.ts`,
`ARToolkitNFT.ts` and their `_simd` / `_td` siblings become thin subclasses that only name
their WASM build and carry what is really per-variant. The Node classes stay as they are.

The refactor **changes no behaviour and no public API**. The proof is the existing suite run
unchanged, `tools/compare-builds` against the `origin/dev` bundles, a check that each bundle
holds only its own WASM build, and a check that each entry point's declared types did not
change.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 (user) | Only the three browser copies are merged. `ARControllerNFT_node.ts` and `ARToolkitNFT_node.ts` stay separate classes and are not edited. | Node differs in more than #734 lists (see *Current state*): no `internalLuma`, a different `process()` input, synchronous `@ts-ignore` loaders, its own interface. Folding it in now would mix real behaviour differences into a refactor whose proof is "nothing changed". It can be folded in later, for example after #685 reworks the Node loaders. |
| D2 | One base class per role, extended by one thin subclass per browser variant. The subclass hands its WASM build to the base through the base constructor. | The issue's "receives its class or factory from outside". Injection through the constructor keeps each entry point's public constructor signature as it is, and adds nothing to the subclass's public surface. |
| D3 (user, on my recommendation) | "Types unchanged" means each entry point exposes the same names, members and signatures, checked by a one-off type assertion during the PR. The `.d.ts` files may change shape, for example `class ARControllerNFT extends ARControllerNFTBase`. | Keeping every member listed in each file would mean duplicating or generating declarations, which brings the copies back. #734 already allows file names in `types/src/` to change. |
| D4 | The static factories (`initWithDimensions`, `initWithImage`, `customInit`) and the constructor overloads stay declared in each variant's controller subclass, as short bodies that call shared code. | Their declared return type must stay `Promise<ARControllerNFT>` of that entry point, with today's JSDoc. Moving them to the base with a generic `this` parameter would change the published signatures. |
| D5 | Per-variant documentation is carried by a per-variant override that only calls `super`. The one case today is `setDetectionInterval` in `_td`. | The published declarations of each entry point must carry the right text (#734). The 300 ms / 0 ms default is set natively by each build; TypeScript only documents it, so no runtime value moves. |
| D6 (my call, after the builder check) | Static constants that `init()` copies from the module (`ERROR_MARKER_INDEX_OUT_OF_BOUNDS`, `AR_DEBUG_*`, `AR_LOG_LEVEL_*`, …) are written onto the variant class, which the variant passes to the base constructor explicitly. They are not written onto the base, and not onto `this.constructor`. | Today each variant class holds its own copies. Writing them onto the base would make the three variants share one set, which is visible when several variants load in one page, as the Vitest suite does. `this.constructor` would differ from today when a user subclasses `ARToolkitNFT` and calls `init()`: today the constants land on `ARToolkitNFT`, not on the user's class. The values are the same C constants, but this is a no-behaviour-change refactor, so the semantics are kept exactly. |
| D7 | The `_td` wrapper keeps calling `new ARToolKitNFT()` with no argument; default and `_simd` keep passing `true`. The argument is a value the variant passes to the base. | Pure refactor. `ARToolKitNFT_js_td.cpp` documents that `withFiltering` has no effect on the threaded preset, so unifying it would likely be harmless, but that belongs in its own change. |
| D8 | The `_td` wrapper's method order, and the stray blank lines and `@return {void}` tag that differ from the default file, are not preserved. The shared base uses the default file's text. | They are textual drift with no effect on behaviour. The only declaration text they touch is the JSDoc of the private `ajax`, which is not public surface. |
| D9 (user) | #734 implements neither #685 nor #720. Order: #734, then #685, then #720. | Agreed before this design. #685's per-marker loader and batch go into the shared browser wrapper and controller after this lands (see *Room for #685*). |
| D10 (user) | The PR says "Refs #734", not "Closes", and #734 stays open for folding in the Node classes. A comment on #734 records what this PR covers and what is left for Node. | D1 delivers only the browser part of #734's proposal. |

## Current state, measured

On `origin/dev` (138b134), changed lines from `diff` against the default file:

| File | lines | `_simd` | `_td` | `_node` |
|---|---|---|---|---|
| `ARControllerNFT*.ts` | 1,047 | 8 | 15 | 188 |
| `ARToolkitNFT*.ts` | 668 | 7 | 33 | 290 |

**`_simd`:** the file name in the header comment, and the import of its own
`ARToolkitNFT` (controller) or `initARToolkitNFT_simd` (wrapper). The rest is blank lines and
one `@return {void}` in the private `ajax` JSDoc (D8).

**`_td`:** the same, plus:

- the JSDoc of `ARControllerNFT.setDetectionInterval`: the threaded build detects on a
  worker, `0` means no throttling, and the default is `0` instead of `300` (D5);
- `new instance.ARToolKitNFT()` instead of `new instance.ARToolKitNFT(true)` (D7);
- `setFiltering`, `setContinuousDetection` and `setDetectionInterval` sit later in the
  wrapper, with the same bodies (D8).

**`_node`**, for the record (D1): an `EventEmitter` re-emit in `dispatchEvent` and an `on()`
method; NODEFS paths instead of downloads in `loadCamera` and `addNFTMarkers`; no
`internalLuma` constructor parameter or `initWith*` argument; `process()` takes a raw pixel
array and calls `passVideoData(sourceImage, videoLuma, false)`; synchronous callback
`loadNFTMarker(s)` under `@ts-ignore`; typed against `IARToolkitNFT_node`.

Other facts the design relies on:

- Every test imports through `src/index*.ts` (and `src/MarkerLostTracker`); nothing imports a
  variant class file directly. `tests/vitest/variants.ts` loads all three browser entry points
  in one page.
- Each `src/factoryFunctions/initARToolkitNFT*.ts` imports exactly one `build/` module. That
  import is what decides which WASM a bundle contains.
- `ARControllerNFT._initialize()` is `private` and is called only by the three static
  factories. `ARControllerNFT` reads one wrapper static, `ARToolkitNFT.NFT_MARKER`, a getter
  returning a constant.
- `tsconfig.json` targets ESNext, so TypeScript uses define semantics for class fields: a
  field redeclared in a subclass without an initializer is reset to `undefined` after
  `super()`.

## Architecture

```
src/
  ARToolkitNFTBase.ts       shared wrapper: everything in ARToolkitNFT.ts today, but no
                            build import; gets its module factory and constructor
                            argument from the subclass
  ARControllerNFTBase.ts    shared controller: everything in ARControllerNFT.ts today,
                            but no wrapper import; gets its wrapper class from the subclass
  ARToolkitNFT.ts           class ARToolkitNFT extends ARToolkitNFTBase      (default build)
  ARToolkitNFT_simd.ts      class ARToolkitNFT extends ARToolkitNFTBase      (simd build)
  ARToolkitNFT_td.ts        class ARToolkitNFT extends ARToolkitNFTBase      (threaded build)
  ARControllerNFT.ts        class ARControllerNFT extends ARControllerNFTBase
  ARControllerNFT_simd.ts   class ARControllerNFT extends ARControllerNFTBase
  ARControllerNFT_td.ts     class ARControllerNFT extends ARControllerNFTBase
                            + setDetectionInterval override with the threaded JSDoc
  ARToolkitNFT_node.ts      unchanged (D1)
  ARControllerNFT_node.ts   unchanged (D1)
  index.ts, index_simd.ts, index_td.ts, index_node.ts   unchanged
  factoryFunctions/*        unchanged
```

### `ARToolkitNFTBase`

- An `abstract` class (it has no abstract members; `abstract` only stops direct use). It
  `implements IARToolkitNFT`, and holds every member `ARToolkitNFT.ts` has today, with the
  same bodies, visibility and JSDoc.
- Constructor: `protected constructor(variantClass: typeof ARToolkitNFTBase,
  initModule: () => Promise<ARToolkitNFTModule>, ...instanceArgs: [] | [boolean])`, or an
  equivalent shape. It keeps today's body (counters, `version`, the `console.info`). The
  values are stored in private fields.
- `init()` calls the stored factory and constructs the instance with the stored arguments,
  where today it calls `initARToolkitNFT()` and `new instance.ARToolKitNFT(true)`.
- The module constants are written onto the stored variant class (D6).
- It imports no `factoryFunctions/` module and no `build/` module.

Variant wrapper, for example `ARToolkitNFT_td.ts`:

```ts
import { initARToolkitNFT } from "./factoryFunctions/initARToolkitNFT_td";
import { ARToolkitNFTBase } from "./ARToolkitNFTBase";

export class ARToolkitNFT extends ARToolkitNFTBase {
  /** (today's constructor JSDoc) */
  constructor() {
    // The threaded binding ignores withFiltering, and this build has never passed it (D7).
    super(ARToolkitNFT, initARToolkitNFT);
  }
}
```

Default and `_simd` pass `true` as well.

### `ARControllerNFTBase`

- An `abstract` class that `implements AbstractARControllerNFT` and holds every member
  `ARControllerNFT.ts` has today, with the same bodies, visibility and JSDoc, except the
  constructor overloads and the three static factories (D4).
- Constructor: takes the wrapper class first, then today's four optional parameters, and
  keeps today's body. The wrapper class is stored in a private field; `_initialize()` builds
  `new this.toolkitClass().init()` where today it builds `new ARToolkitNFT().init()`.
- `_initialize()` becomes `protected`, so the variants' static factories can call it.
- `ARToolkitNFT.NFT_MARKER` becomes `ARToolkitNFTBase.NFT_MARKER`; the getter is inherited
  unchanged.
- It imports `ARToolkitNFTBase` for that getter and for types only, never a variant wrapper.

Variant controller, for example `ARControllerNFT_td.ts`:

```ts
import { ARToolkitNFT } from "./ARToolkitNFT_td";
import { ARControllerNFTBase } from "./ARControllerNFTBase";

export class ARControllerNFT extends ARControllerNFTBase {
  // today's four constructor overloads and their JSDoc
  constructor(width?: number, height?: number, cameraParam?: string, internalLuma?: boolean) {
    super(ARToolkitNFT, width, height, cameraParam, internalLuma);
  }

  // today's JSDoc
  static async initWithDimensions(width: number, height: number, cameraParam: string,
                                  internalLuma: boolean): Promise<ARControllerNFT> {
    const arControllerNFT = new ARControllerNFT(width, height, cameraParam, internalLuma);
    return await arControllerNFT._initialize();
  }
  // initWithImage and customInit the same way

  /** today's threaded JSDoc (D5) */
  public setDetectionInterval(ms: number): void {
    super.setDetectionInterval(ms);
  }
}
```

The variant factory's declared `Promise<ARControllerNFT>` must type-check against what
`_initialize()` returns, which may need `_initialize()` to return `Promise<this>`.

Subclasses declare **no instance fields** (define semantics, see *Current state*).

### Room for #685

The #685 design (`specs/2026-10-21-promise-nft-marker-loading-design.md`, on its own branch)
puts a per-marker loader and a batch `addNFTMarkers` in the browser wrapper, and reworks
`loadNFTMarker(s)` in the browser controller. After this refactor all of that lives in
`ARToolkitNFTBase` and `ARControllerNFTBase`, written once; the variant subclasses do not
take part in loading. Nothing in this design adds per-variant hooks for loading, and the
loader's private helpers (`ajax` today) stay private in the base, where #685 can replace them.
The Node loader stays in `ARToolkitNFT_node.ts`, which matches #685's "the Node behaviour in
whatever #734 uses for Node".

## Constraints

- **Four bundles, each with only its own WASM.** `webpack.config.js` is not changed. After
  `npm run build-ts`, webpack's module list per configuration (for example from
  `webpack --mode production --json`) shows exactly one `build/artoolkitNFT_*` module in each
  bundle, and the right one: `artoolkitNFT_ES6_wasm` (default), `artoolkitNFT_ES6_wasm.simd`
  (simd), `artoolkitNFT_ES6_wasm_td` (threaded), `artoolkitNFT_node_wasm` (node). The bundle
  sizes stay close to `origin/dev`'s.
- **Public API and types per entry point unchanged (D3).** The one-off check is a scratch
  script, not committed. It uses the TypeScript compiler API to write an API report for the
  `origin/dev` declarations and one for the new ones, covering `index`, `index_simd`,
  `index_td` and `index_node`. The report lists every export and, for each class, every
  constructor signature and every public static and instance member, inherited ones
  included, with its type as text and its JSDoc. The two reports must be identical, and the
  result goes in the PR body. Comparing the types themselves (for example with `Pick`) does
  not work: classes with private members are nominal in TypeScript, so a method returning
  the old `ARControllerNFT` never equals one returning the new one, although both print as
  `ARControllerNFT` (my call, replacing an earlier `Pick`-based check during planning).
- **Per-variant JSDoc.** `types/src/ARControllerNFT_td.d.ts` carries the threaded
  `setDetectionInterval` text and "Default: `0`"; the default and `_simd` entry points resolve
  to the base text with "Default: `300`".
- **`npm test` passes with the test files unchanged.** No new public method is added, so
  AGENTS.md's "new methods need new tests" does not require new tests.
- **`tools/compare-builds` reports identical** for every bundle, old = `origin/dev`'s `dist/`
  under `tools/compare-builds/ref/` (git-ignored; fill it with `git show origin/dev:dist/<file>`
  from Git Bash, one file at a time, including the threaded worker chunk, as the tool's header
  describes), new = the rebuilt `dist/`:
  - `--browser` for `ARToolkitNFT.js` and `ARToolkitNFT_simd.js`;
  - `--browser --threaded` for `ARToolkitNFT_td.js` (with its worker chunk next to it);
  - the Node comparison for `ARToolkitNFT_node.js`, as a sanity check that the build is
    unaffected.
- **`examples/node/example_dist.js`** still runs a full detect-and-track pass (Node is
  untouched, but it is AGENTS.md's real-example check).
- **Committed artifacts.** `npm run build-ts` rebuilds `dist/` and `types/`. Commit the
  browser bundles and the changed and new declarations (`types/src/ARToolkitNFTBase.d.ts`,
  `types/src/ARControllerNFTBase.d.ts`, the six variant files). Revert rebuild noise as
  AGENTS.md describes, including `dist/ARToolkitNFT_node.js` if only noise changed there. No
  `build/` change: nothing native or in `tools/makem.js` is touched.
- **The worktree needs its own `npm ci`.** A worktree under `.claude/worktrees/` otherwise
  resolves packages from the parent checkout's `node_modules`, which can hide a missing or
  mismatched dependency.
- **Docs.** Update AGENTS.md "Code layout": replace the paragraph on the four near-identical
  entry points with one describing the two base classes, the thin browser variants, what may
  go in a variant (its build, its constructor argument, per-variant JSDoc), and the separate
  Node classes. Add the two base files to `typedocOptions.entryPoints` in `tsconfig.json`.
- **Repository rules.** PR to `dev`. Conventional Commit, type `refactor`. Each non-obvious
  choice above carries its reason in a code comment (D6, D7, the `protected` on
  `_initialize`), and the PR body has a table of decisions and the verification results.
- **Issue bookkeeping (D10).** The PR body says "Refs #734". After the PR is opened, a
  comment on #734 links it, says it covers the three browser variants, and lists what is left
  for Node: the differences in *Current state* (`_node`).

## Non-goals

- Folding the Node classes into the shared base (D1).
- #685's Promise-based loading and #720's tracker facade (D9).
- Fixing drift found on the way, such as D7's constructor argument. Note it in the PR as a
  possible follow-up instead.
- Any change to `webpack.config.js`, `package.json` `exports`, the `index*.ts` files,
  `factoryFunctions/`, native code or `build/`.

## Left to the builder

- The exact names of the private fields that hold the injected factory, constructor argument
  and wrapper class, and the exact constructor parameter shape of the bases.
- How the base's `_initialize()` return type is written so the variant factories type-check
  (`Promise<this>` or a cast inside the variant).
- Whether the bases go in `src/` (as drawn) or in a subfolder; `src/` matches today's flat
  layout.
- The commit split inside the PR.
