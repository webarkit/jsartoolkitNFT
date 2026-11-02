import type { OneEuroConfig } from "../types";
import type { PoseFilter } from "./PoseFilter";
/**
 * ARnft's parameters (D19). Units are the package's: time in milliseconds, and
 * `minCutOff` / `beta` passed to `new OneEuroFilter(minCutOff, beta)` unchanged.
 * (aframe-nft divides `minCutOff` by 1000 before passing it; this module does not.)
 */
export declare const ONE_EURO_DEFAULTS: {
    readonly minCutOff: 0.0001;
    readonly beta: 0.01;
    readonly warmUp: 0;
};
/**
 * OneEuro through the same module contract as custom filters (D14, D19).
 *
 * The pose is the facade's column-major GL matrix: R in elements 0–2, 4–6, 8–10, the
 * translation in 12–14. Since #766 the two parts are filtered apart, so the pose stays rigid:
 * - the rotation on its tangent space: the step `ω = log(R̂ᵀR)`, smoothed by the package's
 *   `filterStep()`, then `R̂ ← R̂ · exp(ω̂)`. Smoothing the 9 entries of R one by one, as
 *   before #766, gave R a scale and shear of about 1% on a hand-held camera. ω is expressed
 *   in R̂'s own frame; with one α per component the result depends on that frame (the
 *   package README's note);
 * - the translation as a vector, with the package's `filter()`.
 *
 * One `minCutOff` / `beta` pair drives both, as before: for small rotations the change of R's
 * entries is about the angle in radians, the scale of ω, so existing settings keep their
 * meaning. Filtered output still differs from earlier releases.
 *
 * `timeMs` is in milliseconds and must increase from call to call: a time that does not
 * returns the previous output unchanged. The first sample after construction or `reset()` is
 * returned as is. The first `warmUp` samples return the input but are still fed to the filter,
 * so it has history when smoothing starts.
 *
 * The result is an array reused on the next call (or the input, while warming up): the tracker
 * copies every filter's result (G7), so this module does not copy it again.
 */
export declare function createPoseFilter(options: OneEuroConfig): PoseFilter;
