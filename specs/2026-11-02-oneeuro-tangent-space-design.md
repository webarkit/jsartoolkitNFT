# oneEuro pose filter on the rotation's tangent space

Issue: #766. Uses `filterStep()` from `@webarkit/oneeurofilter-ts` 0.3.0 (#773). Related:
webarkit/webarkit#106 (the same filter for the nft-tracker), webarkit/OneEuroFilter-ts#9
(item 5, the step filter), the facade design `specs/2026-10-25-nft-tracker-facade-design.md`
(D14 filter contract, D19 oneEuro parameters).

## Intent

`src/tracker/filters/oneEuro.ts` gives all 16 pose values to one `OneEuroFilter`, which smooths
each value on its own. An average of rotation matrices is not a rotation, so the filtered R
picks up scale and shear: column norms 0.989 to 1.0007 and det(R) down to 0.984 on a hand-held
camera (#766). The renderer applies the pose as a model matrix, so the content visibly scales
and shears with the camera's motion. 'none' and 'native' keep the pose rigid.

## Goals

- Every pose the oneEuro filter smooths has a rotation part that is a rotation: orthonormal
  columns and det +1, within rounding (1e-9), on a moving sequence and not only a static one.
  The samples it returns as is (the first after a reset, the `warmUp` ones) are the input: the
  core's raw poses are rigid to about 1e-7 (measured on the Node build, 2026-11-02).
- Existing configurations keep working with the same meaning: one `minCutOff` / `beta` pair,
  the D19 defaults (0.0001, 0.01), `warmUp`, time in milliseconds.

## Non-goals

- Separate parameters for rotation and translation. With small rotations the change of R's
  entries is about the rotation angle in radians, which is the scale the tangent step has, so
  one pair keeps today's behaviour close. A per-part override can come later if someone needs it.
- A switch back to the old per-value filter (approach C, rejected below).
- The legacy examples (`examples/load_thread.js`, `load_ES6_thread.js`) that use the package
  directly on the controller's matrices.

## Anti-goals

- A filter that is rigid but lags or jitters visibly more than today with the default
  parameters.
- An allocation per frame: the module stays allocation-free in `filter()`.

## Approaches

| | Approach | Trade-off |
|---|---|---|
| A | Keep the per-value filter, then project R back onto a rotation (polar decomposition) | Smallest change, but it still filters 9 numbers that are not a rotation and removes the scale afterwards |
| **B** | **Rotation through `filterStep()` in its tangent space, translation through `filter()` as a vector** | **Rigid by construction; the approach of webarkit/webarkit#106, which `filterStep()` was released for. Chosen.** |
| C | B plus an option to keep the old filter | Keeps the defect available and adds configuration for no reason |

The user chose B (2026-11-02).

## Design (decided)

The pose is the facade's 16-value, column-major GL matrix (`arglCameraViewRHf`): R in elements
0–2, 4–6, 8–10 (columns), translation in 12–14, and 3, 7, 11, 15 equal to 0, 0, 0, 1.

Per filter instance (one per target, as now):

- `rot = new OneEuroFilter(minCutOff, beta)`, used only through `filterStep()` on a
  `Float64Array(3)`; `trans = new OneEuroFilter(minCutOff, beta)`, used only through
  `filter()` on the 3 translation values. Each package instance is used through one method only,
  as the package README requires.
- State: the filtered rotation R̂, the previous time, the output array (reused, G7).
- **First sample** (after construction or `reset()`): returned as is; R̂ is its R. The
  translation filter takes it as its first sample.
- **Next samples**, with `te = timeMs − tPrev`:
  - `te` not > 0 (or NaN): return the previous output unchanged, which is what the package's
    `filter()` does today for a time that does not increase.
  - otherwise `ω = log(R̂ᵀ R)` (the step in R̂'s own frame), `ω̂ = rot.filterStep(te, ω).step`,
    `R̂ ← R̂ · exp(ω̂)`; the translation is `trans.filter(timeMs, t)`.
  - The output is R̂ and the filtered translation, with 3, 7, 11, 15 set to 0, 0, 0, 1.
- `warmUp` keeps its meaning: the first `warmUp` samples return the input but still go through
  the filter, so it has history when smoothing starts.
- `reset()` resets both package filters and forgets R̂ and the previous time.

The package README notes that, with one α per component, the result depends on the frame the
rotation vector is expressed in. Here it is R̂'s frame (the marker's), stated in a comment.

## Left to the builder

- `log` and `exp` on SO(3) (Rodrigues), numerically safe near angle 0 (series) and near π. A
  step near π between two frames is not a real motion; it only has to stay finite.
- Keeping R̂ orthonormal against rounding drift over long runs, e.g. one polar (Newton) iteration
  after each update, or re-orthonormalising when the error passes a threshold.
- Where the small SO(3) helpers live (`oneEuro.ts` or a `src/tracker/filters/so3.ts`).

## Tests (TDD, `tests/vitest/tracker-filters.test.ts`, parallel project, no WASM)

- Kept: the first sample passes through; a constant input stays constant; warmUp; reset.
- "a step is smoothed": a step in rotation and in translation each lands strictly between the
  old and the new value.
- "the translation matches the package": replaces "matches the package"; the 3 translation
  values equal `new OneEuroFilter(minCutOff, beta).filter()` on the same samples.
- "a rotation about one axis is filtered as its angle": for rotations about a fixed axis, the
  filtered rotation stays about that axis, and its angle equals `filterStep` driven with the 1-D
  angle steps (pins the tangent-space maths).
- "filtered poses stay rigid": a moving sequence (rotation and translation with noise, a few
  hundred frames): every output has column norms and det within 1e-9 of 1. Break-check: the
  old implementation fails it.
- "a time that does not increase returns the previous output".
- The existing tracker specs with `filter: { type: "oneEuro" }` (`tracker.test.ts`) must still
  pass.

## Delivery

One PR to `dev`, `fix: keep oneEuro-filtered poses rigid (#766)`. It changes filtered output for
existing users, which the PR description, a comment in `oneEuro.ts`, a dated D19 amendment in the
facade design and the README's pose filter section say. `npm run build-ts` rebuilds every bundle
that embeds the filter (`dist/ARToolkitNFT*.js`, the `NFTTracker*.worker.js` bundles); no WASM
rebuild.
