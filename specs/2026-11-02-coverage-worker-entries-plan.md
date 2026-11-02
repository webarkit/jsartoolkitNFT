# Worker entry files out of coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Part of #762: stop the three worker entry files from reading 0 % on Codecov.

**Architecture:** Configuration and documentation only: `coverage.exclude` in `vitest.config.ts`,
plus the comments that say which files the number leaves out.

**Tech Stack:** Vitest coverage (istanbul), Codecov.

**Spec:** this file's Design section (a small change; agreed with the maintainer on 2026-11-02).

## Design

- **Why:** #762 lists two groups at 0 %. The worker host's logic, `src/tracker/worker/host.ts`, is
  measured since #770 (its tests run on the page). Left are `host_default.ts`, `host_simd.ts` and
  `host_td.ts`: one statement each, `runHost(createTrackerFactory(...))`, which runs only inside
  the module worker loaded from a Blob URL, where istanbul never instruments it (#720 D15).
- **Approaches:** measure them from the worker (a source-mapped coverage build of each worker
  bundle, collected from inside the worker), or exclude them. Chosen: exclude. Instrumenting a
  Blob-URL worker for three one-line files costs more than it shows; the entries are still
  exercised by `tracker-worker.test.ts`, which starts every build's worker.
- **Non-goals:** the Node classes (`*_node.ts`, `index_node.ts`, the Node factory). They wait for
  the Node part of #734, which would fold most of that code into the base classes the browser suite
  already measures; what stays Node-specific is measured afterwards. The real gaps #762 lists
  (`ARControllerNFTBase`, `NFTTracker`, `createNFTTrackerWorker`, `logger`) are separate test work.
- **Delivery:** one PR to `dev`, `chore: leave the worker entry files out of coverage (#762)`, body
  "Part of #762" (not Closes: the Node part stays open), linking #734.

## Global Constraints

- Branch `chore/762-coverage-worker-entries` from `origin/dev`.
- Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `npm run format-check` clean.
- Coverage stays report-only (`codecov.yml` informational statuses unchanged).

## Review Focus

1. A glob that excludes more than intended (e.g. `host*.ts` would also drop `host.ts`): the coverage
   report must still list `src/tracker/worker/host.ts`. (Task 1, Step 3.)

---

### Task 1: Exclude the worker entries and say so

**Files:**
- Modify: `vitest.config.ts` (`test.coverage.exclude`, ~line 114)
- Modify: `codecov.yml` (header comment), `AGENTS.md` (Testing, the sentence on istanbul, ~line 200)

- [ ] **Step 1: Baseline.** `npx vitest run --coverage` and note the lines for
  `src/tracker/worker/host_default.ts`, `host_simd.ts`, `host_td.ts` (0 %) and `host.ts` (covered)
  in the text report.
- [ ] **Step 2: Exclude** `"src/tracker/worker/host_*.ts"` in `coverage.exclude`, with a comment:
  one-line entries that run only in the Blob-URL worker, which istanbul does not instrument; their
  logic is `host.ts`, tested on the page (#770); started by `tracker-worker.test.ts`; #762.
- [ ] **Step 3: Check.** `npx vitest run --coverage`: the three entries are gone from the report and
  `host.ts` is still there with the same coverage as in step 1.
- [ ] **Step 4: Docs.** `codecov.yml` comment: the report covers `src/` except the worker entry files
  (see `vitest.config.ts`); the Node classes are not measured yet (#762, #734). AGENTS.md Testing:
  the same two facts in the sentence on istanbul.
- [ ] **Step 5:** `npm run format-check` — clean. Commit
  `chore: leave the worker entry files out of coverage (#762)`, with this plan.
- [ ] **Step 6:** Push, open the PR per the Design's Delivery. After CI, check on the Codecov report
  of the PR that the three files are no longer listed.
