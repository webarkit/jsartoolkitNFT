# GitHub Copilot instructions

The full guidance for AI agents in this repository lives in **[AGENTS.md](../AGENTS.md)**.
Read it before making changes — it is the canonical source and this file is only a pointer.

## The rules most often got wrong

- **Open pull requests against `dev`**, never `master`. `master` is reserved for stable
  releases. See [CONTRIBUTING.md](../CONTRIBUTING.md).
- **Conventional Commits**, with types limited to
  `feat`, `fix`, `perf`, `doc`, `refactor`, `test`, `style`, `chore`.
  There is no `ci` type, and documentation is `doc`, not `docs`. PRs are squashed, so the PR
  title must follow the format too.
- **`build/` and `dist/` are committed, and CI tests the committed artifacts.** A change to
  `emscripten/**` or `tools/makem.js` passes CI against stale WASM unless you rebuild and
  commit on the branch. A regression shipped exactly this way in 1.10.1.
- **Anything reached as `Module.x` must be in `EXPORTED_RUNTIME_METHODS`** in
  `tools/makem.js`, or it is silently `undefined` at runtime.
- **A green `npm test` proves very little.** The suite never loads an NFT marker and never
  calls `process()`. Verify tracking changes against a real example such as
  `examples/node/example_dist.js`.
