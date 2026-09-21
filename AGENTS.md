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

- `dev` is not always current. Check `git rev-list --count origin/dev..origin/master` first;
  it has been several commits behind in the past, including missing a critical fix.
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

`npm run build-no-libar` skips recompiling the static libraries and only relinks. That is
sufficient — and much faster — when the change is link-time only, such as an emcc flag or
something in `js/*.api.js` (which is injected via `--pre-js`).

**TypeScript** — `npm run build-ts`, run on the host. It bundles `src/**` with webpack into
`dist/` and emits declarations into `types/`.

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
| `js/artoolkitNFT.api.js` | `artoolkitNFT.min.js`, `.debug.js`, `_wasm.js`, `_wasm.simd.js` | deprecated; logs a warning on load |
| `src/*.ts` | `dist/*`, and `package.json` `main`/`exports` | current; what consumers install |

The legacy file is injected at link time via `--pre-js`, so changing it requires a WASM
relink, not just `build-ts`.

Variants of the TypeScript entry point (`ARToolkitNFT.ts`, `_simd`, `_td`, `_node`) are
near-identical by design. A change to one usually needs applying to all four — keep them
structurally aligned so diffs stay readable.

---

## Testing

```bash
npm test          # all seven build targets via Karma + Jasmine
npm run format-check
```

Be careful what you conclude from a green run. The suite currently totals roughly 46
assertions across all seven targets, completes in under a second, and **never loads an NFT
marker or calls `process()`**. It checks method existence, matrix shapes and debug flags.

Green means nothing crashed on startup. It does not mean tracking works. When changing
anything in the detection or tracking path, verify against a real example —
`examples/node/example_dist.js` runs a full detect-and-track pass on a static image and
requires no camera.

Refreshing the suite is tracked in issue #579.

---

## Releases

1. Merge to `dev`, then `dev` into `master`.
2. Wait for `main.yml` to commit rebuilt artifacts to `master`.
3. Tag `X.Y.Z` and push the tag. `publish.yml` publishes to npm with provenance.

The version appears in **three** places and all must agree:

- `package.json`
- `js/artoolkitNFT.api.js`
- `js/artoolkitNFT_ES6.api.js`

The last two are hardcoded and are not updated by `npm version`. Missing them ships artifacts
that report the previous release.

---

## Gotchas

**Rebuild noise.** Running `build-ts` without changing any source still rewrites four `dist/`
bundles (webpack is not byte-reproducible here) and produces line-ending churn in `types/`.
Revert those rather than committing them; `main.yml` regenerates both on merge.

**`npm run format-check` currently fails** on roughly 247 files, on `master`, with the
project's own prettier version. It is not wired into CI. Do not interpret it as a regression
caused by your change, and do not reformat the tree as a side effect of unrelated work.

**Node version.** `.nvmrc` pins an exact patch release. If a version manager does not have
that precise build installed, every `node` and `npm` invocation inside the repository fails
until it is installed or overridden.

---

## Maintaining this file

`AGENTS.md` is the canonical guidance. Three thin pointer files exist so that tools which look
for a specific filename still find it:

| File | Read by |
|---|---|
| `AGENTS.md` | the cross-tool convention; OpenAI Codex and others |
| `CLAUDE.md` | Claude Code |
| `GEMINI.md` | Gemini CLI |
| `.github/copilot-instructions.md` | GitHub Copilot |

The pointers repeat only the handful of rules that are most often got wrong, so that a tool
which injects the file without following links still gets the essentials. **Everything else
belongs here.** When updating guidance, edit `AGENTS.md`; touch a pointer only if one of those
few headline rules changes.

To support another tool, add a pointer file rather than copying this content.
