# oneEuro tangent-space filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close #766: poses filtered by `{ type: "oneEuro" }` keep a rigid rotation.

**Architecture:** A small SO(3) module (`log`, `exp`, one polar step) and a rewritten
`oneEuro.ts` that filters the rotation through `filterStep()` on `ω = log(R̂ᵀR)` and the
translation through `filter()`, with the same `minCutOff` / `beta` / `warmUp`.

**Tech Stack:** TypeScript, `@webarkit/oneeurofilter-ts` 0.3.0, Vitest browser mode, `node --test`.

**Spec:** `specs/2026-11-02-oneeuro-tangent-space-design.md`

## Global Constraints

- Branch `feat/766-oneeuro-tangent-space` from `origin/dev`; PR to `dev` titled
  `fix: keep oneEuro-filtered poses rigid (#766)`, body `Closes #766`.
- Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `npm run format` before
  each commit, `npm run format-check` clean.
- Pose layout: column-major 16 values; R columns at 0–2, 4–6, 8–10; translation 12–14; 3, 7, 11, 15
  are 0, 0, 0, 1.
- Rigidity tolerance: column norms, column dot products and det within **1e-9** of 1, 0, 1.
- Defaults unchanged: `ONE_EURO_DEFAULTS = { minCutOff: 0.0001, beta: 0.01, warmUp: 0 }`.
- `filter()` allocates nothing: every scratch array is created in `createPoseFilter`.
- No new file goes in `THREADED`: the new specs start no WASM, except the Node spec.
- No WASM rebuild; `npm run build-ts` rebuilds `dist/` and `types/`.

## Review Focus

1. A pose that is not a rotation (e.g. all zeros, or a filter config fed garbage by a custom
   caller): `filter()` returns finite values, never NaN. (Task 2, "non-rotation input stays finite".)
2. Rotations near π between two frames (a flip): `log` stays finite and `exp(log(R))` recovers R.
   (Task 1.)
3. A long run (thousands of frames) does not drift from orthonormal by rounding. (Task 2,
   "filtered poses stay rigid", 5000 frames.)
4. The same timestamp twice, or a timestamp that goes back: the previous output, unchanged. (Task 2.)
5. `reset()` mid-sequence, then a very different pose: passes through, no smoothing towards the
   old R̂. (Task 2, extended "reset restarts".)

---

### Task 1: SO(3) helpers

**Files:**
- Create: `src/tracker/filters/so3.ts`
- Create: `tests/vitest/so3.test.ts`

**Interfaces:**
- Produces, all on 3×3 matrices as `Float64Array(9)`, column-major (`m[c * 3 + r]`), writing into
  `out` and returning it, allocation-free:
  - `logSO3(m: Float64Array, out: Float64Array): Float64Array` — rotation vector (3), angle in [0, π].
  - `expSO3(w: Float64Array, out: Float64Array): Float64Array` — Rodrigues, `out` length 9.
  - `polarStep(m: Float64Array): Float64Array` — in place, `m ← (m + m⁻ᵀ) / 2`, one Newton
    iteration towards the nearest rotation. Uses only the cofactor matrix and the determinant.

- [ ] **Step 1: Write the failing tests** in `so3.test.ts` (parallel project, no WASM):
  - `"exp then log gives the vector back"`: 200 seeded random vectors with |ω| in [1e-12, π − 1e-6]
    → `logSO3(expSO3(ω))` within 1e-9 of ω.
  - `"log then exp gives the rotation back near 0 and near π"`: angles 0, 1e-12, 1e-6, π − 1e-9, π
    about axes (1,0,0), (0,1,0), (0,0,1), normalised (1,2,3) → `expSO3(logSO3(R))` within 1e-9 of R
    (for angle π compare R, not ω: ω and −ω are the same rotation).
  - `"exp gives a rotation"`: for the vectors above, column norms, dot products and det within 1e-12.
  - `"a polar step reduces the error"`: R scaled by 1.01 on column 0 and sheared by 1e-3 → after
    3 steps column norms and det within 1e-12; a rotation is unchanged by a step (within 1e-15).
  - `"log of a matrix that is not a rotation is finite"`: zeros(9), and a matrix of all 2s → every
    component finite.
- [ ] **Step 2: Run** `npx vitest run --project parallel tests/vitest/so3.test.ts` — FAIL (no module).
- [ ] **Step 3: Implement `so3.ts`.** `logSO3`: `c = clamp((tr − 1) / 2, −1, 1)`,
  `v = (m21 − m12, m02 − m20, m10 − m01) / 2` (that is `sin θ · axis`), `θ = atan2(|v|, c)`.
  If `θ < 1e-6`: `ω = v` (first order is exact to 1e-12 there). Else if `sin θ > 1e-6`:
  `ω = v · θ / |v|`. Else (near π): axis from the diagonal,
  `a_i = sqrt(max(0, (m_ii − c) / (1 − c)))`, signs fixed from the largest `a_i` and the symmetric
  off-diagonals (`sign(m_ij + m_ji)`), `ω = θ · a`. Non-finite intermediates (not a rotation) end
  as 0. `expSO3`: `θ = |ω|`; `A = sin θ / θ`, `B = (1 − cos θ) / θ²`, with the series
  `A = 1 − θ²/6`, `B = 1/2 − θ²/24` when `θ < 1e-4`; `R = I + A[ω]× + B[ω]×²`.
  A header comment cites #766 and states the layout.
- [ ] **Step 4: Run** step 2's command — PASS, 5 specs.
- [ ] **Step 5: Commit** `fix: add SO(3) log, exp and polar step for the pose filter (#766)`, together
  with the design and this plan.

### Task 2: oneEuro on the tangent space

**Files:**
- Modify: `src/tracker/filters/oneEuro.ts`
- Modify: `tests/vitest/tracker-filters.test.ts` (`describe("OneEuro")`, and "oneEuro gives
  independent filters" in `describe("loadFilter")`)
- Modify: `README.md` (pose filter section), `specs/2026-10-25-nft-tracker-facade-design.md`
  (dated D19 amendment)

**Interfaces:**
- Consumes: Task 1's `logSO3`, `expSO3`, `polarStep`.
- Produces: unchanged `createPoseFilter(options: OneEuroConfig): PoseFilter` and `ONE_EURO_DEFAULTS`.

- [ ] **Step 1: Test helpers.** In the test file, `rigid(axis: [number, number, number], angle: number, t: [number, number, number]): Float64Array`
  builds a 16-value pose with `expSO3` (normalised axis × angle) and translation `t`; and
  `expectRigid(p)` asserting the Global Constraints tolerance. Replace `pose(v)` in the OneEuro and
  loadFilter specs with rigid poses (`pose(v)` filled R with `v`, which is not a rotation).
- [ ] **Step 2: Write the failing specs** (keep the names of the kept ones):
  - Kept, rewritten on rigid poses: "the first sample passes through" (exact equality), "a constant
    input stays constant" (within 1e-12), "warmUp samples pass through", "reset restarts".
  - "reset restarts" extended: after `reset()` a pose rotated by 2 rad passes through exactly.
  - `"a step is smoothed"`: after 5 samples at angle 0, t = (0,0,0), one at angle 0.5 about z and
    t = (0,0,10) → the output's angle in (0, 0.5) and its z translation in (0, 10).
  - `"the translation matches the package"`: 12 samples with translation `(sin i·5 + i, i, −2i)`
    and a varying rotation → elements 12–14 equal `new OneEuroFilter(0.0001, 0.01).filter(t, xyz)`
    within 1e-12.
  - `"a rotation about one axis is filtered as its angle"`: angles `θ_i = 0.3 sin(i/3)` about the
    z axis (0, 0, 1), i < 40, 33 ms apart. Reference: `θ̂ = θ_0`; then per sample
    `θ̂ += ref.filterStep(33, Float64Array.of(θ_i − θ̂)).step[0]` with a fresh
    `new OneEuroFilter(0.0001, 0.01)`. Expect the output's R within 1e-9 of a rotation by θ̂ about
    z. Use a coordinate axis on purpose: ω is then `(0, 0, θ − θ̂)`, one non-zero component, so the
    3-component and the 1-D filters agree. About a general axis they do not, because each
    component has its own α (the package README's note on the frame).
  - `"filtered poses stay rigid"`: 5000 frames, 33 ms apart, seeded noise: axis drifting, angle
    `0.8 sin(i/50) + noise(0.01)`, translation `(100 sin(i/40), 50 cos(i/30), −300) + noise(0.5)`
    → `expectRigid` on every output. **Break-check:** run it against the old `oneEuro.ts` first and
    see it fail.
  - `"a time that does not increase returns the previous output"`: two samples, then a third at the
    second's time and a fourth at an earlier time with different poses → both equal the second
    output.
  - `"non-rotation input stays finite"`: a rigid first sample, then `new Float64Array(16)` → every
    value finite.
  - "oneEuro gives independent filters": same assertion on rigid poses (b's output equals its
    constant input within 1e-9).
- [ ] **Step 3: Run** `npx vitest run --project parallel tests/vitest/tracker-filters.test.ts` —
  the new specs and the rewritten "a step is smoothed" / "constant" FAIL against the old module.
- [ ] **Step 4: Implement** `createPoseFilter` as in the design's "Design (decided)": two package
  instances `rot` (only `filterStep`) and `trans` (only `filter`); scratch `R`, `Rhat`, `RtR`, `w`,
  `wStep`, `alpha`, `dR`, `next` (9 or 3 values), `t3`, `out` (16); `prevTime`, `started`, `seen`.
  Per accepted sample: `RtR = R̂ᵀR`, `logSO3`, `rot.filterStep(te, w, wStep, alpha)`, `expSO3`,
  `R̂ ← R̂·dR`, `polarStep(R̂)`; translation `trans.filter(timeMs, t3, …)`. Output R̂, the
  translation and 0, 0, 0, 1. `te` not > 0 or NaN → return `out` unchanged (before warm-up counting,
  as today the package returns its previous output). Rewrite the JSDoc: the step frame is R̂'s
  (package README note), why one parameter pair is kept (the design's Non-goals), and that output
  differs from 1.15.0 (#766).
- [ ] **Step 5: Run** step 3's command — PASS. Then the JS filter specs of the facade:
  `npx vitest run --project threaded tests/vitest/tracker.test.ts -t "filter"` — PASS.
- [ ] **Step 6: Docs.** README pose filter section: oneEuro filters the rotation on its tangent space
  and keeps the pose rigid, parameters unchanged, output differs from earlier releases (#766).
  Facade design: "D19 amendment (2026-11-02, #766)" under D19, same content.
- [ ] **Step 7: Commit** `fix: filter the oneEuro pose's rotation on its tangent space (#766)`.

### Task 3: Real tracking, rebuild, PR

**Files:**
- Modify: `tests/node/tracker.test.js`
- Rebuilt: `dist/ARToolkitNFT.js`, `_simd`, `_td`, `_node`, `dist/NFTTracker*.worker.js`, `types/`
  if they change

- [ ] **Step 1: Write the spec** `"oneEuro poses stay rigid on the static photo"` in
  `tests/node/tracker.test.js`: `createNFTTracker({ width, height, cameraParam: "camera_para.dat", filter: { type: "oneEuro" } })`
  (push it on `trackers`), load pinball, 32 frames `i * 33` → every found pose rigid within 1e-9
  (the same three checks as `expectRigid`, written for `node:assert`). It runs against the
  **bundle**, so before rebuilding: `node --test tests/node/tracker.test.js --test-name-pattern="rigid"`
  — FAIL (#766 measured norms down to 0.9995 on this photo).
- [ ] **Step 2: Rebuild** `npm run build-ts`. `git status --porcelain dist types`: only the bundles
  that embed the filter change; any other file is a real change to investigate.
- [ ] **Step 3: Run** step 1's command — PASS. Then `npm test` and `npm run format-check` — both pass.
- [ ] **Step 4: Tracking check.** `node examples/node/example_dist.js` still finds and tracks pinball.
  Report in the PR that the hand-held browser check (the #766 trace) is left to a device run by the
  maintainer.
- [ ] **Step 5: Commit** `test: check oneEuro poses stay rigid on the Node build (#766)` with the
  rebuilt `dist/` and `types/`. Push, open the PR (title and body per Global Constraints). The body
  states the behaviour change for existing oneEuro users and the tolerance used.
