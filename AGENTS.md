# AGENTS.md

Guidance for AI coding agents working in this repository. This is the canonical file;
`CLAUDE.md`, `GEMINI.md` and `.github/copilot-instructions.md` point here.

`jsartoolkitNFT` is an Emscripten port of ARToolKit5's NFT (natural feature tracking) to
JavaScript and WebAssembly. C/C++ sources compile to WASM; a TypeScript layer wraps the
resulting module and is what consumers install.

Human contributor process lives in [CONTRIBUTING.md](CONTRIBUTING.md) and takes precedence
over this file. The sections below summarise it and add the operational details that are
easy to get wrong.

---

## Branching and pull requests

**Open pull requests against `dev`.** `master` is reserved for stable releases.

```bash
git checkout dev && git pull origin dev
git checkout -b your-branch-name
```

Two things worth knowing before branching:

- `dev` is not always current. Check `git log --oneline --no-merges origin/dev..origin/master`
  first; it should print nothing. Without `--no-merges` the release merge commits, which
  live only on `master`, always show up. `dev` has been behind in the past, including
  missing a critical fix.
- Tooling may report `master` as the "main branch" because it is the repository's default
  branch on GitHub. That reflects a repository setting, not this project's workflow. Use
  `dev`.

An already-open pull request can be retargeted with:

```bash
gh api -X PATCH repos/webarkit/jsartoolkitNFT/pulls/<n> -f base=dev
```

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), enforced by convention:

```
<type>(<optional scope>): <description>
```

**Allowed types** — `feat`, `fix`, `perf`, `doc`, `refactor`, `test`, `style`, `chore`.

Note there is no `ci` type and the documentation type is `doc`, not `docs`. Build and CI
changes are `chore`.

**Project scopes** — `simd`, `wasm`, `parallel`. Use them where they apply so changes
categorise correctly in the changelog.

Pull requests are **squashed on merge**, so the PR *title* becomes the commit message. It must
follow the same format.

Breaking changes take a `!` after the type/scope, or a `BREAKING CHANGE:` footer.

---

## Build system

Two independent builds produce the committed artifacts.

**WASM** — compiled inside Docker, because the toolchain is pinned:

```bash
docker run -dit --name emscripten-jsartoolkitnft -v $(pwd):/src emscripten/emsdk:4.0.17 bash
docker exec emscripten-jsartoolkitnft npm run build
```

`npm run setup-docker` runs the first command; `npm run build-docker` runs the second.

**Submodules** — the native sources come from `emscripten/WebARKitLib` and `emscripten/zlib`.
Run `git submodule update --init` after cloning and in every new worktree. A change to the
NFT core goes to [WebARKitLib](https://github.com/webarkit/WebARKitLib) first, is released
there, and lands here as a submodule bump; `python-bindings/` builds on the same core. Check
`git submodule status` before committing: a pointer left at an older release shows as a
change.

`npm run build-no-libar` skips recompiling the static libraries and only relinks. That is
sufficient — and much faster — when the change is link-time only, such as an emcc flag or
something in `js/*.api.js` (which is injected via `--pre-js`).

**TypeScript** — `npm run build-ts`, run on the host. `tools/build-ts.mjs` runs one `vite build`
per bundle (`vite.lib.config.mjs`: three UMD browser bundles, the CommonJS Node bundle) into
`dist/`, writes the thin ES module wrapper `dist/ARToolkitNFT_node.mjs` (#577), then runs
`tsc --emitDeclarationOnly` into `types/`. The threaded build also emits its pthread worker as
`dist/ARToolkitNFT_td.worker.js`: a fixed name, to be served next to `ARToolkitNFT_td.js`.
`npm run dev-ts` is a minified, source-map-less watch build.

**Debug tracing** — `node tools/makem.js --debug-logs` defines `DEBUG`, which switches on the
`ARLOGd()` calls in WebARKitLib. Opt-in only: `ARLOGd` is `#ifdef DEBUG` in `ARUtil/log.h`, so
released artifacts — including `artoolkitNFT.debug.js`, which *is* a release asset — carry no
tracing by default. Note the traced code lives in `libar.o`, so this needs a full build; with
`--no-libar` the instrumented sources are never recompiled. `ARLOGd` also passes a runtime
level check, so `arLogLevel` has to be `AR_LOG_LEVEL_DEBUG` (`0`) for anything to print.

### `build/` and `dist/` are committed

This is the single most important thing to understand about this repository.

CI runs `npm test` against the **committed** artifacts. `main.yml` rebuilds and commits them
back to `master` after a push. So a pull request that changes `emscripten/**` or
`tools/makem.js` **passes CI against stale WASM** unless the artifacts are rebuilt and
committed on the branch.

A regression shipped this way in 1.10.1: the build flags changed, CI stayed green against
artifacts built from the previous flags, and `process()` was broken in every release channel
until 1.10.2.

If a change touches native sources or build flags, rebuild locally and verify against the new
artifacts — do not trust a green CI run alone.

### Emscripten flags

All emcc flags live in `tools/makem.js`. `EXPORTED_RUNTIME_METHODS` deserves particular care:
anything accessed as `Module.x` from JavaScript must be listed there, or it is silently
`undefined` at runtime. This has caused two separate production bugs (`_malloc`, then
`HEAPU8`).

`ALLOW_MEMORY_GROWTH=1` is enabled. Emscripten **replaces** the heap typed arrays when memory
grows, so a captured reference such as `this.HEAPU8 = module.HEAPU8` becomes detached. Read
heap views through the module at each point of use rather than caching them.

---

## Code layout

There are **two parallel implementations of the same API**, and a fix often belongs in both:

| Path | Feeds | Status |
|---|---|---|
| `js/artoolkitNFT.api.js` | `artoolkitNFT.min.js`, `.debug.js`, `_wasm.js`, `_wasm.simd.js`, `_thread.js` | deprecated; logs a warning on load |
| `js/artoolkitNFT_ES6.api.js` | `artoolkitNFT_embed_ES6_wasm.js` | legacy ES6 API; no warning |
| `src/*.ts` | `dist/*`, and `package.json` `main`/`exports` | current; what consumers install |

The `js/` files are injected at link time via `--pre-js`, so changing them requires a WASM
relink, not just `build-ts`.

The three browser builds (default, `_simd`, `_td`) share one implementation per class:

| File | Holds |
|---|---|
| `src/ARToolkitNFTBase.ts` | the WASM wrapper's code, once |
| `src/ARControllerNFTBase.ts` | the controller's code, once |
| `src/ARToolkitNFT.ts`, `_simd`, `_td` | a subclass that names its build's module factory and the argument of its native constructor |
| `src/ARControllerNFT.ts`, `_simd`, `_td` | a subclass that names its build's `ARToolkitNFT`, and declares the public constructor overloads and static factories (`initWithDimensions`, `initWithImage`, `customInit`), whose types name that class |

A browser change therefore goes in the base class. A variant file may hold only those
build-specific values, plus an override whose sole purpose is per-build JSDoc, as `_td` does
for `setDetectionInterval`. Subclasses must declare no instance fields: with ESNext class
fields, a field declared in a subclass is reset to `undefined` after the base constructor sets
it. Each entry point reaches only its own factory, so each Vite bundle still contains only
its own WASM build.

The Node build is still a separate copy: `ARToolkitNFT_node.ts` and `ARControllerNFT_node.ts`
differ in more than file access (EventEmitter events, no `internalLuma`, synchronous loading).
A change to the browser classes may need applying there too. #734 stays open for folding them
into the base classes.

Elsewhere:

| Path | Holds |
|---|---|
| `emscripten/*.cpp` | the Embind bindings, adapters over WebARKitLib's NFT core (`_td`: the threaded build) |
| `src/tracker/` | `NFTTracker`, the data-oriented facade (#720), its pose filters, and a worker wrapper with one host per browser build |
| `src/RuntimeSettings.ts` | `configure()`: the accepted keys and their value checks |
| `src-esm/` | the Node ESM entry, copied unchanged to `dist/ARToolkitNFT_node.mjs`. It re-exports the CommonJS bundle on purpose (one WASM instance, one `NFTLoadError`); keep its named exports in step with `src/index_node.ts` |
| `python-bindings/` | the `artoolkitnft` PyPI package, a C++ binding on the same core, released separately (see Releases) |
| `specs/` | dated design and plan documents for larger changes, `YYYY-MM-DD-<topic>-design.md` and `-plan.md` |

---

## Testing

```bash
npm test          # Vitest in Playwright's Chromium, then the Node suite
npm run format-check
```

Before the first run, install the browser: `npx playwright install chromium`.

`npm test` runs two suites:

- **`tests/vitest/`**, in a real Chromium. It drives `src/` (what `dist/` ships) through marker
  loading and detection on a real photo. It also detects the pinball marker once with every
  committed browser artifact in `build/`, checks each ES6 module's runtime exports, and
  smoke-tests the `dist/ARToolkitNFT.js` bundle. A spec that instantiates the threaded build
  (any loop over `VARIANTS`, or a td worker) must be listed in `THREADED` in `vitest.config.ts`:
  each td module reserves a 1 GB shared memory, and such specs run in parallel exhaust the
  browser's resources and hang the run.
- **`tests/node/`**: the Node build, with `node --test`.

CI does not call `npm test`. It runs `npm run test:coverage` and then `npm run test:node`, the
same two suites, so that Vitest writes `coverage/lcov.info` for Codecov (#580). If you change
the `test` script, change the Tests step in `.github/workflows/CI.yml` too. Coverage uses the
istanbul provider, which instruments `src/` only: v8 slowed the legacy builds' tests until they
timed out.

A green run means every artifact loads and detects a marker in one fixed photo. It does not
measure tracking quality: stability, jitter, or loss and recovery on a moving camera. When
changing the detection or tracking path, still verify against a real example.
`examples/node/example_dist.js` runs a full detect-and-track pass on a static image with no
camera; the browser examples need one.

To show that a change leaves tracking unchanged, compare two builds frame by frame with
`tools/compare-builds.js`: Node bundles by default, `--browser` for the browser bundles,
`--threaded --strict` for the threaded one. It is the check used for the binding refactor
(#683).

### New methods need new tests

**Every new method or function, in TypeScript or JavaScript, ships with a test in the same PR.**
This applies to public methods on `ARControllerNFT` or `ARToolkitNFT` in `src/`, and to
additions to the legacy APIs in `js/`. A method with no test can break in any later PR without
anyone noticing; #614 shipped exactly that way.

Put the test where the method is used:

| New code | Test goes in |
|---|---|
| A method in `src/` browser entry points (default, `_simd`, `_td`) | `tests/vitest/controller.test.ts`, or a focused `tests/vitest/<feature>.test.ts`. Loop over `VARIANTS` from `tests/vitest/variants.ts` when the behaviour should hold on every browser build, and then add the file to `THREADED` in `vitest.config.ts`: `VARIANTS` includes the threaded build, and threaded specs run in parallel hang the run. |
| The same method on the Node entry point (`_node`) | `tests/node/` as well. The browser suite cannot load the Node build, so a method added to all four entry points needs both. |
| A method in `js/artoolkitNFT.api.js` or `js/artoolkitNFT_ES6.api.js` | the shared suite in `tests/vitest/legacy.ts`, which runs on every legacy and embed build |
| A new `Module.x` runtime export | `tests/vitest/module-surface.test.ts`, which checks the four ES6 module builds. The global builds' `Module` is only covered indirectly, by the detection in `tests/vitest/legacy.ts`, so add an assertion there if the legacy API uses the export. |

The test has to exercise the behaviour, not just the method's existence. Call the method and
assert on what it returns or changes. Where you can, break the implementation on purpose once
and watch the test fail, then restore it; a test that cannot fail proves nothing.

---

## Releases

1. Open a `dev` → `master` PR and merge it with a **merge commit**, not a squash. List
   `Closes #n` in its body for every issue fixed on `dev`: a PR merged into `dev` closes
   nothing, so issues cited only as `(#n)` stay open.
2. Wait for `main.yml` on `master`. Since #690 its rebuild is byte-identical, so it usually
   commits nothing. If it does commit artifacts, merge `master` back into `dev`, or the next
   release conflicts on `dist/`.
3. Tag `X.Y.Z` (lightweight, like every tag so far) on the merge commit, or on `main.yml`'s
   commit if there is one, and push it. `publish.yml` publishes to npm with provenance; the
   registry may answer "not found" for a few minutes afterwards.

The version appears in **three** places and all must agree:

- `package.json`
- `js/artoolkitNFT.api.js`
- `js/artoolkitNFT_ES6.api.js`

The last two are hardcoded and are not updated by `npm version`. Missing them ships artifacts
that report the previous release.

A version bump also needs **both rebuilds** committed in the same PR:

- `npm run build-docker`: the two API files above are compiled into the legacy and embed builds
  as `--pre-js`.
- `npm run build-ts`: `src/ARToolkitNFT*.ts` import `version` from `package.json`, and Vite
  inlines it into every `dist/` bundle. Keep it a **named** import: a default import inlines the
  whole `package.json` (devDependencies, scripts), which `tests/node/dist-paths.test.js` rejects.

Check that nothing still carries the old version: `grep -l "<old version>" build/*.js dist/*.js`
should print nothing.

**Python** (`artoolkitnft` on PyPI) is released separately. Its version is in
`python-bindings/pyproject.toml` and `python-bindings/setup.py`, and both must agree. The tag
is `python/<version>`, the only pattern `publish-python.yml` triggers on; it publishes wheels
only.

---

## Gotchas

**Rebuild noise.** The Vite build is byte-reproducible: running `build-ts` twice on the same
sources leaves `dist/` identical, and `git status` shows nothing after a rebuild with no source
change. A diff in `dist/` therefore means a source, dependency or Node/toolchain change; do not
revert it as noise. `main.yml` rebuilds `dist/` on `master` after a merge and commits it only
if it differs. If `types/` shows line-ending-only churn on Windows, revert that.

**Line endings.** `.gitattributes` forces LF for every text file, regardless of `core.autocrlf`,
so a Windows checkout matches prettier's default and CI. A clone made before it landed keeps its
CRLF files until git rewrites them: `git status` stays clean, but `prettier --check` still flags
them. `git add --renormalize .` does not help here, because it only refreshes the index, which is
already LF. To rewrite the working tree once, start from a clean tree (commit or stash first) and
run `git rm -r --cached -q . && git reset --hard`. Do not fix it by running `prettier --write`
over the tree.

**`npm run format-check` runs in CI** (the Node.js CI job, before the tests), so a PR with
unformatted files fails. Run `npm run format` before committing. Prettier uses its defaults:
there is no config file (#733). Do not add one without reformatting the tree in the same PR,
since a different `printWidth` or `tabWidth` would flag almost every file.

**Node version.** `.nvmrc` names the major only (`24`, since #636); the workflows read it
through `node-version-file`. `@types/node` is held at 24.x in `dependabot.yml` to match.

**Record the reason in the change.** A behaviour change, or a non-obvious value, carries its
reason in a code comment where a reader could otherwise "fix" it back, and in the PR
description. PRs are squashed, so commit bodies get lost; the comment and the PR are the
durable record. Python's AR2 thresholds came from a debugging commit with no reason, and a
year later nobody knew why they were there.

---

## Maintaining this file

`AGENTS.md` is the canonical guidance. Three thin files exist so that tools which look for a
specific filename still find it:

| File | Read by |
|---|---|
| `AGENTS.md` | the cross-tool convention; OpenAI Codex and others |
| `CLAUDE.md` | Claude Code. It imports this file with `@AGENTS.md`, so it repeats nothing and adds only Claude-specific notes |
| `GEMINI.md` | Gemini CLI |
| `.github/copilot-instructions.md` | GitHub Copilot |

The `GEMINI.md` and Copilot pointers repeat only the handful of rules that are most often got
wrong, so that a tool which injects the file without following links still gets the
essentials. **Everything else belongs here.** When updating guidance, edit `AGENTS.md`; touch
a pointer only if one of those few headline rules changes.

To support another tool, add a pointer file rather than copying this content.
