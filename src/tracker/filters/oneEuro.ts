import { OneEuroFilter } from "@webarkit/oneeurofilter-ts";
import type { OneEuroConfig } from "../types";
import type { PoseFilter } from "./PoseFilter";
import { expSO3, logSO3, polarStep } from "./so3";

/**
 * ARnft's parameters (D19). Units are the package's: time in milliseconds, and
 * `minCutOff` / `beta` passed to `new OneEuroFilter(minCutOff, beta)` unchanged.
 * (aframe-nft divides `minCutOff` by 1000 before passing it; this module does not.)
 */
export const ONE_EURO_DEFAULTS = {
  minCutOff: 0.0001,
  beta: 0.01,
  warmUp: 0,
} as const;

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
export function createPoseFilter(options: OneEuroConfig): PoseFilter {
  const minCutOff = options?.minCutOff ?? ONE_EURO_DEFAULTS.minCutOff;
  const beta = options?.beta ?? ONE_EURO_DEFAULTS.beta;
  const warmUp = options?.warmUp ?? ONE_EURO_DEFAULTS.warmUp;
  // One package instance per method: filter() and filterStep() share the filtered speed.
  const rot = new OneEuroFilter(minCutOff, beta);
  const trans = new OneEuroFilter(minCutOff, beta);
  // Scratch arrays, created once: filtering allocates nothing.
  const r = new Float64Array(9);
  const rHat = new Float64Array(9);
  const rel = new Float64Array(9);
  const dR = new Float64Array(9);
  const next = new Float64Array(9);
  const w = new Float64Array(3);
  const wStep = new Float64Array(3);
  const alpha = new Float64Array(3);
  const t = new Float64Array(3);
  const tOut = new Float64Array(3);
  const out = new Float64Array(16);
  let prevTime = 0;
  let started = false;
  let seen = 0;

  function write(): Float64Array {
    for (let c = 0; c < 3; c++) {
      for (let row = 0; row < 3; row++) out[c * 4 + row] = rHat[c * 3 + row];
      out[c * 4 + 3] = 0;
    }
    out[12] = tOut[0];
    out[13] = tOut[1];
    out[14] = tOut[2];
    out[15] = 1;
    return out;
  }

  return {
    filter(timeMs, pose) {
      for (let c = 0; c < 3; c++) {
        for (let row = 0; row < 3; row++) r[c * 3 + row] = pose[c * 4 + row];
        t[c] = pose[12 + c];
      }
      if (!started) {
        rHat.set(r);
        // set(): the package may return its input as is for a first sample.
        tOut.set(trans.filter(timeMs, t, tOut));
        started = true;
      } else {
        const te = timeMs - prevTime;
        // Not `te <= 0`: a NaN time must be refused too.
        if (!(te > 0)) return out;
        // rel = R̂ᵀ R, the rotation from the filtered pose to the new one, in R̂'s frame.
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            rel[j * 3 + i] =
              rHat[i * 3] * r[j * 3] +
              rHat[i * 3 + 1] * r[j * 3 + 1] +
              rHat[i * 3 + 2] * r[j * 3 + 2];
          }
        }
        rot.filterStep(te, logSO3(rel, w), wStep, alpha);
        expSO3(wStep, dR);
        // next = R̂ · dR
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            next[j * 3 + i] =
              rHat[i] * dR[j * 3] +
              rHat[3 + i] * dR[j * 3 + 1] +
              rHat[6 + i] * dR[j * 3 + 2];
          }
        }
        rHat.set(next);
        // Rounding would otherwise accumulate into scale and shear over a long run.
        polarStep(rHat);
        tOut.set(trans.filter(timeMs, t, tOut));
      }
      prevTime = timeMs;
      write();
      const warming = seen < warmUp;
      seen++;
      return warming ? pose : out;
    },
    reset() {
      rot.reset();
      trans.reset();
      started = false;
      seen = 0;
    },
  };
}
