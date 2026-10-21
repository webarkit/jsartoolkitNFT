# Shared browser variants (#734): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three browser copies of `ARToolkitNFT` and `ARControllerNFT` (default,
`_simd`, `_td`) with one shared base class each and thin per-variant subclasses, with no
change in behaviour, public API or published types.

**Architecture:**
- `src/ARToolkitNFTBase.ts` and `src/ARControllerNFTBase.ts` hold today's code. They import no
  WASM build.
- Each variant file becomes a subclass that passes its build to the base constructor:
  - a wrapper subclass passes its `initARToolkitNFT` factory, itself, and its constructor
    argument;
  - a controller subclass passes its wrapper class.
- The controller subclasses keep the constructor overloads and static factories (D4). `_td`
  adds a `setDetectionInterval` override that carries its JSDoc (D5).
- The Node files, `index*.ts`, `factoryFunctions/` and `webpack.config.js` are untouched.

**Tech stack:**
- TypeScript 6 (`tsconfig.json`, target ESNext, so define semantics for class fields);
- webpack 5 with ts-loader and babel;
- Vitest in Playwright's Chromium, and `node --test`;
- Node 24.

**Spec:** `specs/2026-10-21-shared-browser-variants-design.md` (decisions D1–D10). The executor
reads it; its decisions table is the source of every "why" below.

## Global Constraints

**Repository rules**
- Branch `refactor/shared-variants`, in the worktree
  `.claude/worktrees/epic-torvalds-80889d`. The PR targets `dev`, never `master`.
- Conventional Commits, types `feat|fix|perf|doc|refactor|test|style|chore` only. Code
  commits are `refactor:`.
- Commit bodies end with `Refs #734`, and so does the PR body. Never write `Closes #734`
  (D10).
- Commits are GPG-signed (`commit.gpgsign=true`). Never bypass signing. If pinentry times
  out, ask the user to unlock the key and retry.
- End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Every non-obvious choice carries its reason in a code comment: D6 (constants on the variant
  class), D7 (`_td` passes no constructor argument), `protected` on `_initialize`, and the
  "no instance fields in subclasses" rule.

**What must not change**
- `src/ARControllerNFT_node.ts`, `src/ARToolkitNFT_node.ts`, `src/index*.ts`,
  `src/factoryFunctions/**`, `webpack.config.js`, `package.json`, `emscripten/**`, `build/**`.
- No existing file under `tests/` is edited, and no test file is added to the commits.
- The public API of every entry point: same exports, same constructor overloads, same public
  members and types, same JSDoc. Task 4's API report is the proof.
- `_td` keeps `new instance.ARToolKitNFT()` with no argument; default and `_simd` keep
  `new instance.ARToolKitNFT(true)` (D7).

**Environment**
- `npm ci` has already been run in the worktree, so it has its own `node_modules`. Do not rely
  on the parent checkout's.
- `SCRATCH` means
  `C:\Users\perda\AppData\Local\Temp\claude\C--Users-perda-kalwalt-github-webarkit-org-jsartoolkitNFT--claude-worktrees-epic-torvalds-80889d\3cc8150f-450f-4db2-80a7-028717c6fc0c\scratchpad`
  (`/c/Users/perda/AppData/Local/Temp/claude/…/scratchpad` in Git Bash). One-off scripts and
  reports go there, never in the repository.
- Run `git show … > file` from Git Bash, never PowerShell: PowerShell 5.1 re-encodes what `>`
  writes.

## Review Focus

1. **Several browser variants loaded in one page**, as the Vitest suite does and as an app
   that picks a build at runtime might. Each variant's `AR_*` constants must stay on its own
   class after its own `init()`, and must not leak onto the base or onto another variant (D6).
   Pinned by the scratch test in Task 2, Step 1.
2. **A consumer subclassing `ARControllerNFT`** and calling `MyController.initWithDimensions()`.
   Today this returns a plain `ARControllerNFT`, because the factory does
   `new ARControllerNFT(...)`. The factories must keep naming the class explicitly, not use
   `new this(...)`. Pinned in Task 3, Step 3.
3. **A consumer subclassing `ARToolkitNFT`** and calling `init()`. Today the constants land on
   `ARToolkitNFT`, not on the subclass. Writing them onto the variant class passed to the base
   keeps that (D6). Pinned by the scratch test in Task 2, Step 1.
4. **The default bundle silently gaining a second WASM build.** This would happen if a base
   imported a variant, or a variant imported the wrong factory. Pinned by Task 4's webpack
   module list.
5. **A field redeclared in a subclass**, which define semantics reset to `undefined` after
   `super()`. Subclasses declare no instance fields. Task 2's and Task 3's runs of the full
   Vitest suite would catch a reset field.

---

### Task 1: Baselines

**Files:** none in the repository. `tools/compare-builds/ref/` (git-ignored) and `SCRATCH`.

**Interfaces:**
- Produces:
  - `tools/compare-builds/ref/{ARToolkitNFT.js, ARToolkitNFT_simd.js, ARToolkitNFT_td.js,
    602.ARToolkitNFT_td.js, ARToolkitNFT_node.js}`, from `origin/dev`;
  - `SCRATCH/types-old/`: `origin/dev`'s `types/`;
  - `SCRATCH/api-report.js`, and `SCRATCH/api-old.txt` made with it;
  - the baseline test counts.

- [ ] **Step 1: Fetch the reference bundles (Git Bash)**

```bash
mkdir -p tools/compare-builds/ref
for f in ARToolkitNFT.js ARToolkitNFT_simd.js ARToolkitNFT_td.js 602.ARToolkitNFT_td.js ARToolkitNFT_node.js; do
  git show origin/dev:dist/$f > tools/compare-builds/ref/$f
done
mkdir -p "$SCRATCH/types-old" && git archive origin/dev types | tar -x -C "$SCRATCH/types-old" --strip-components=1
```

Expected: five files in `ref/`, each byte-identical to `git show` output; check with
`git hash-object tools/compare-builds/ref/ARToolkitNFT.js` against
`git rev-parse origin/dev:dist/ARToolkitNFT.js`.

- [ ] **Step 2: Write `SCRATCH/api-report.js`**

Usage: `node api-report.js <typesRoot> <repoRoot>`. It resolves `typescript` from
`<repoRoot>/node_modules`. It prints one sorted line per item for the entries
`src/index.d.ts`, `src/index_simd.d.ts`, `src/index_td.d.ts` and `src/index_node.d.ts`:

- every export: for a non-class export, its declared type;
- for each class export:
  - every construct signature, via `checker.signatureToString`, with its JSDoc;
  - every property of the static type and of the instance type, inherited ones included
    (`checker.getPropertiesOfType`). Skip `prototype` and members whose declaration has the
    `Private` or `Protected` modifier flag. Print the name, the type
    (`checker.typeToString(…, undefined, ts.TypeFormatFlags.NoTruncation)`), and the JSDoc
    (`displayPartsToString(getDocumentationComment)`) with whitespace collapsed.

Each line is prefixed with `<entry file> <export name> <static|instance|new>`.

- [ ] **Step 3: Produce the old report, and prove the script sees a change**

Run: `node "$SCRATCH/api-report.js" "$SCRATCH/types-old" . > "$SCRATCH/api-old.txt"`.
Expected: several hundred lines. They include the `index_td.d.ts ARControllerNFT instance
setDetectionInterval` line with "Default: `0`", and the same member under `index.d.ts` with
"Default: `300`".

Then copy `types-old` to `SCRATCH/types-mut`, and change one word of a JSDoc and one parameter
type in `types-mut/src/ARControllerNFT_simd.d.ts`. Rerun the script on it, and check that
`diff` against `api-old.txt` shows exactly those two lines. Delete `types-mut`.

- [ ] **Step 4: Record baseline test results**

Run: `npm test`
Expected: green. Write down the number of passed tests per suite (Vitest and `node --test`).
Task 4 compares against these numbers.

Nothing to commit.

---

### Task 2: `ARToolkitNFTBase` and the three wrapper subclasses

**Files:**
- Create: `src/ARToolkitNFTBase.ts`. Create it with `git mv src/ARToolkitNFT.ts
  src/ARToolkitNFTBase.ts` first, so git tracks the move and the diff shows only the edits.
- Create (rewritten): `src/ARToolkitNFT.ts`, `src/ARToolkitNFT_simd.ts`,
  `src/ARToolkitNFT_td.ts`.
- Test (scratch, not committed): `tests/vitest/zz-d6.scratch.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  export abstract class ARToolkitNFTBase implements IARToolkitNFT {
    protected constructor(
      variantClass: typeof ARToolkitNFTBase,
      initModule: () => Promise<ARToolkitNFTModule>,
      ...instanceArgs: [] | [withFiltering: boolean]
    );
    public async init(): Promise<this>;
    // every other member as in today's src/ARToolkitNFT.ts, unchanged
  }
  ```
  Each variant file keeps exporting `class ARToolkitNFT extends ARToolkitNFTBase` with a
  public no-argument constructor and today's constructor JSDoc.

- [ ] **Step 1: Write the scratch test**

`tests/vitest/zz-d6.scratch.test.ts`, run on its own:

```ts
import { it, expect } from "vitest";

it("init() writes the module constants onto its own variant class only (D6)", async () => {
  const base = await import("../../src/ARToolkitNFTBase");
  const def = await import("../../src/ARToolkitNFT");
  const simd = await import("../../src/ARToolkitNFT_simd");
  await new simd.ARToolkitNFT().init();
  expect(Object.hasOwn(simd.ARToolkitNFT, "AR_LOG_LEVEL_DEBUG")).toBe(true);
  expect(simd.ARToolkitNFT.AR_LOG_LEVEL_DEBUG).toBe(0);
  expect(def.ARToolkitNFT.AR_LOG_LEVEL_DEBUG).toBeUndefined();
  expect(base.ARToolkitNFTBase.AR_LOG_LEVEL_DEBUG).toBeUndefined();
});

it("a consumer subclass's init() still fills ARToolkitNFT, not the subclass (D6)", async () => {
  const def = await import("../../src/ARToolkitNFT");
  class Mine extends def.ARToolkitNFT {}
  await new Mine().init();
  expect(Object.hasOwn(def.ARToolkitNFT, "AR_LOG_LEVEL_DEBUG")).toBe(true);
  expect(Object.hasOwn(Mine, "AR_LOG_LEVEL_DEBUG")).toBe(false);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/vitest/zz-d6.scratch.test.ts`
Expected: FAIL. `../../src/ARToolkitNFTBase` cannot be resolved.

- [ ] **Step 3: Turn the moved file into `ARToolkitNFTBase`**

In `src/ARToolkitNFTBase.ts`:
- Rename the class, update the header file name, and drop the `initARToolkitNFT` import.
- Store the three constructor arguments in private fields. Keep the rest of today's
  constructor body.
- `init()` builds the module with the stored factory and the instance with
  `new instance.ARToolKitNFT(...instanceArgs)`.
- Write every module constant onto the stored variant class instead of `ARToolkitNFT.`.
  Add a comment citing D6.
- Every other member and its JSDoc stays as it is, including `private ajax`.

- [ ] **Step 4: Write the three variant wrappers**

Each file has:
- the license header with its own file name;
- an import of its own factory (`./factoryFunctions/initARToolkitNFT`, `…_simd`, `…_td`)
  and of `ARToolkitNFTBase`;
- `export class ARToolkitNFT extends ARToolkitNFTBase` with today's constructor JSDoc.

The constructors:
- default and `_simd`: `super(ARToolkitNFT, initARToolkitNFT, true)`;
- `_td`: `super(ARToolkitNFT, initARToolkitNFT)`, with the D7 comment from the spec.

No instance fields in the subclass. Add a one-line comment saying why (define semantics).

`src/ARControllerNFT*.ts` still compiles unchanged against these files: the controller only
needs `new ARToolkitNFT().init()` and `ARToolkitNFT.NFT_MARKER`, both inherited.

- [ ] **Step 5: Run the checks**

Run, in order:
1. `npx tsc --noEmit -p .`. Expected: no output.
2. `npx vitest run tests/vitest/zz-d6.scratch.test.ts`. Expected: 2 passed.
3. `npm run test:vitest`. Expected: the baseline number passed. The scratch test adds 2.

- [ ] **Step 6: Delete the scratch test and commit**

```bash
rm tests/vitest/zz-d6.scratch.test.ts
git add src/ARToolkitNFTBase.ts src/ARToolkitNFT.ts src/ARToolkitNFT_simd.ts src/ARToolkitNFT_td.ts
git commit
```

Message: `refactor: share one ARToolkitNFT implementation across the browser variants`.
The body says:
- each variant now only names its build and its constructor argument;
- D6 and D7, in one line each;
- `Refs #734`.

---

### Task 3: `ARControllerNFTBase` and the three controller subclasses

**Files:**
- Create: `src/ARControllerNFTBase.ts`, via `git mv src/ARControllerNFT.ts
  src/ARControllerNFTBase.ts`.
- Create (rewritten): `src/ARControllerNFT.ts`, `src/ARControllerNFT_simd.ts`,
  `src/ARControllerNFT_td.ts`.

**Interfaces:**
- Consumes: `ARToolkitNFTBase` and each variant's `ARToolkitNFT` (Task 2).
- Produces:
  ```ts
  export abstract class ARControllerNFTBase implements AbstractARControllerNFT {
    protected constructor(
      toolkitClass: new () => ARToolkitNFTBase,
      width?: number, height?: number, cameraParam?: string, internalLuma?: boolean
    );
    protected _initialize(): Promise<this>;
    // every other member as in today's src/ARControllerNFT.ts, unchanged
  }
  ```
  Each variant exports `class ARControllerNFT extends ARControllerNFTBase` with:
  - today's four constructor overloads and their JSDoc;
  - `static initWithDimensions`, `static initWithImage` and `static customInit`, with today's
    signatures, JSDoc and `Promise<ARControllerNFT>` return types.

- [ ] **Step 1: Turn the moved file into `ARControllerNFTBase`**

In `src/ARControllerNFTBase.ts`:
- Rename the class and update the header.
- Replace the `./ARToolkitNFT` import with `./ARToolkitNFTBase`.
- Remove the constructor overload declarations and the three static factories. They move to
  the variants in Step 2.
- The implementation constructor gains `toolkitClass` as its first parameter, stored in a
  private field.
- `_initialize()`:
  - becomes `protected`, with a comment: the variants' static factories call it;
  - returns `Promise<this>`;
  - uses `new this.toolkitClass().init()`.
- `ARToolkitNFT.NFT_MARKER` becomes `ARToolkitNFTBase.NFT_MARKER`.

- [ ] **Step 2: Write the three variant controllers**

Each file has:
- the license header with its own file name;
- imports of its own `ARToolkitNFT` (`./ARToolkitNFT`, `…_simd`, `…_td`), of
  `ARControllerNFTBase`, and of `IImageObj` for `initWithImage`;
- `export class ARControllerNFT extends ARControllerNFTBase` containing:
  - today's four constructor overload declarations, with their JSDoc;
  - an implementation constructor calling
    `super(ARToolkitNFT, width, height, cameraParam, internalLuma)`;
  - today's three static factories, moved verbatim with their JSDoc.

No instance fields in the subclass.

- [ ] **Step 3: Keep the factories naming the class**

Each factory body stays as today: `const arControllerNFT = new ARControllerNFT(...)` followed
by `return await arControllerNFT._initialize();`. Do not use `new this(...)`. Add a one-line
comment saying why: a consumer subclass gets a plain `ARControllerNFT` today (Review Focus 2).

- [ ] **Step 4: Add the `_td` override**

In `src/ARControllerNFT_td.ts` only, add `public setDetectionInterval(ms: number): void`,
whose body calls `super.setDetectionInterval(ms)`. Its JSDoc is the text of today's
`src/ARControllerNFT_td.ts` lines 909–922 (the JSDoc above `setDetectionInterval`), verbatim: "worker thread", "Default: `0`". Add a
comment that it exists for the published JSDoc (D5).

- [ ] **Step 5: Run the checks**

Run, in order:
1. `npx tsc --noEmit -p .`. Expected: no output.
2. `npm run test:vitest`. Expected: exactly the baseline number passed.
3. `npm run test:node`. Expected: exactly the baseline number passed (Node is untouched).

- [ ] **Step 6: Commit**

```bash
git add src/ARControllerNFTBase.ts src/ARControllerNFT.ts src/ARControllerNFT_simd.ts src/ARControllerNFT_td.ts
git commit
```

Message: `refactor: share one ARControllerNFT implementation across the browser variants`.
The body says:
- D4 (factories and overloads stay per variant), D5 (`_td` JSDoc override), and why
  `_initialize` is `protected`;
- `Refs #734`.

---

### Task 4: Rebuild, verify, commit the artifacts

**Files:**
- Modify: `dist/ARToolkitNFT.js`, `dist/ARToolkitNFT_simd.js`, `dist/ARToolkitNFT_td.js`,
  and the threaded chunk `dist/<id>.ARToolkitNFT_td.js`. The chunk id may change; webpack's
  `clean.keep` removes the stale one.
- Modify: `types/src/ARToolkitNFT*.d.ts` and `types/src/ARControllerNFT*.d.ts` for the browser
  variants.
- Create: `types/src/ARToolkitNFTBase.d.ts` and `types/src/ARControllerNFTBase.d.ts`.

**Interfaces:**
- Consumes: Task 1's `ref/`, `types-old`, `api-report.js` and `api-old.txt`.

- [ ] **Step 1: Build with module stats**

Run: `npx webpack --mode production --json="$SCRATCH/stats.json"`.

Then list the `build/artoolkitNFT*` modules per child compilation from `stats.json`, walking
nested `modules` arrays.

Expected, exactly one each:

| Bundle | Module |
|---|---|
| `default` | `./build/artoolkitNFT_ES6_wasm.js` |
| `simd` | `./build/artoolkitNFT_ES6_wasm.simd.js` |
| `threaded` | `./build/artoolkitNFT_ES6_wasm_td.js` |
| `node` | `./build/artoolkitNFT_node_wasm.js` |

Also compare each `dist/*.js` size with its `ref/` copy. Expected: within a few KB.

- [ ] **Step 2: API report**

Run:
```bash
node "$SCRATCH/api-report.js" types . > "$SCRATCH/api-new.txt"
diff "$SCRATCH/api-old.txt" "$SCRATCH/api-new.txt"
```

Expected: no output. Any line of difference is a public API, type or JSDoc change. Fix it in
the source and rebuild; do not accept it.

- [ ] **Step 3: Tracking comparisons**

Run each command, one at a time:
```bash
node tools/compare-builds.js tools/compare-builds/ref/ARToolkitNFT_node.js dist/ARToolkitNFT_node.js
node tools/compare-builds.js --browser /tools/compare-builds/ref/ARToolkitNFT.js /dist/ARToolkitNFT.js
node tools/compare-builds.js --browser /tools/compare-builds/ref/ARToolkitNFT_simd.js /dist/ARToolkitNFT_simd.js
node tools/compare-builds.js --browser --threaded /tools/compare-builds/ref/ARToolkitNFT_td.js /dist/ARToolkitNFT_td.js
```

Expected:
- each prints `identical (<n> records)` and exits 0;
- the Node run may also print the byte-identical WARNING, which is fine: Node source is
  unchanged.

Save the verdict lines for the PR body.

- [ ] **Step 4: Full suite and the real example**

Run:
1. `npm test`. Expected: the Task 1 baseline numbers, both suites.
2. `npm run test-node-example`. Expected: it loads the marker and reports it found, with a
   pose, as on `origin/dev`.

- [ ] **Step 5: Drop rebuild noise and commit**

Run `git status`, then revert noise as AGENTS.md describes:
- `git checkout -- dist/ARToolkitNFT_node.js dist/*.LICENSE.txt`, unless their content really
  changed;
- any `types/` file whose only change is line endings, notably everything outside the eight
  browser declaration files and the two new base declarations.

```bash
git add dist/ARToolkitNFT.js dist/ARToolkitNFT_simd.js dist/ARToolkitNFT_td.js dist/*.ARToolkitNFT_td.js types/src/ARToolkitNFTBase.d.ts types/src/ARControllerNFTBase.d.ts types/src/ARToolkitNFT.d.ts types/src/ARToolkitNFT_simd.d.ts types/src/ARToolkitNFT_td.d.ts types/src/ARControllerNFT.d.ts types/src/ARControllerNFT_simd.d.ts types/src/ARControllerNFT_td.d.ts
git add -u dist/
git commit
```

Message: `chore: rebuild dist and types for the shared browser variants`. The body says
`Refs #734`. Use `git add -u dist/` only to pick up the deletion of the old worker chunk.

---

### Task 5: Documentation

**Files:**
- Modify: `AGENTS.md`, section "Code layout", the paragraph starting "Variants of the
  TypeScript entry point".
- Modify: `tsconfig.json`, `typedocOptions.entryPoints`.

- [ ] **Step 1: Rewrite the AGENTS.md paragraph**

Replace the "near-identical by design … apply to all four" paragraph with one that says:
- browser logic lives once, in `src/ARToolkitNFTBase.ts` and `src/ARControllerNFTBase.ts`;
- `ARToolkitNFT.ts`, `_simd` and `_td` (and the `ARControllerNFT*` equivalents) are thin
  subclasses that may only hold:
  - their WASM factory;
  - their constructor argument;
  - the controller's constructor overloads and static factories;
  - per-variant JSDoc overrides;
- subclasses declare no instance fields, because of define semantics;
- `ARToolkitNFT_node.ts` and `ARControllerNFT_node.ts` are still separate copies, so a browser
  change may also be needed there (#734 is open for folding them in).

Check AGENTS.md's testing table ("A method in `src/` browser entry points") still reads
correctly. Leave it unless it is now wrong.

- [ ] **Step 2: Add the base files to typedoc**

Add `src/ARToolkitNFTBase.ts` and `src/ARControllerNFTBase.ts` to
`typedocOptions.entryPoints`, next to their variants.

Run: `npx typedoc --emit none`. Expected: no errors. Warnings about pre-existing issues are
acceptable if `origin/dev` shows them too.

- [ ] **Step 3: Commit**

Message: `doc: describe the shared browser base classes in AGENTS.md`. The body notes the
typedoc entry points and says `Refs #734`.

---

### Task 6: Pull request and issue comment

- [ ] **Step 1: Ask the user before pushing**

Show the five commits and the verification results, and wait for the go-ahead.

- [ ] **Step 2: Push and open the PR against `dev`**

```bash
git push -u origin refactor/shared-variants
gh pr create --repo webarkit/jsartoolkitNFT --base dev --head refactor/shared-variants
```

Title: `refactor: share one ARControllerNFT / ARToolkitNFT implementation across the browser variants`.

The body has:
- a summary;
- a table of decisions D1–D10 with their reasons;
- the verification results:
  - the webpack module table;
  - "API report: identical";
  - the four compare-builds verdict lines;
  - test counts;
  - the example run;
- the note that D7's constructor argument is a possible follow-up;
- `Refs #734`;
- the attribution line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Then follow the ccd_pr tools: `get_status`, and `bind_pr` if needed.

- [ ] **Step 3: Comment on #734 (user-approved, D10)**

`gh issue comment 734 --repo webarkit/jsartoolkitNFT` with:
- a link to the PR;
- what it covers: the default, `_simd` and `_td` browser variants;
- what is left for Node: the `_node` differences listed in the design's *Current state*
  (`EventEmitter`, NODEFS, no `internalLuma`, raw-array `process()`, synchronous
  `@ts-ignore` loaders, `IARToolkitNFT_node`);
- that the issue stays open for that part.
