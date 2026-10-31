# Claude Code instructions

@AGENTS.md

AGENTS.md (imported above) is the canonical guidance for every agent. It is imported rather
than linked because Claude Code loads only `CLAUDE.md` on its own: a link left the rest of
AGENTS.md out of context unless the agent chose to open it. This file adds only what is
specific to Claude Code.

## Worktrees

Claude Code creates worktrees inside the checkout, under `.claude/worktrees/<name>`:

- Node resolves a package missing from the worktree out of the main checkout's
  `node_modules`, so a dropped dependency still passes locally (#664 removed the only
  package that installed `glob`, which `tools/makem.js` requires; only CI caught it).
- The shared `emscripten-jsartoolkitnft` container mounts the main checkout as `/src`, so a
  build from a worktree embeds `/src/.claude/worktrees/<name>/` in the artifacts.

Verify a dependency or build change in a one-off container with the worktree as `/src`, as
`main.yml` does:

```bash
git submodule update --init
MSYS_NO_PATHCONV=1 docker run --rm -v "<worktree>:/src" -w /src emscripten/emsdk:4.0.17 npm run build
```
