import { OneEuroFilter } from "@webarkit/oneeurofilter-ts";
import type { OneEuroConfig } from "../types";
import type { PoseFilter } from "./PoseFilter";

/**
 * ARnft's parameters (D19). Units are the package's: time in milliseconds, and
 * `minCutOff` / `beta` passed to `new OneEuroFilter(minCutOff, beta)` unchanged.
 * (aframe-nft divides `minCutOff` by 1000 before passing it; this module does not.)
 */
export const ONE_EURO_DEFAULTS = { minCutOff: 0.0001, beta: 0.01, warmUp: 0 } as const;

/**
 * OneEuro through the same module contract as custom filters (D14, D19). One package filter
 * smooths the 16 pose values. `timeMs` is in milliseconds and must increase from call to
 * call: the package returns its previous output unchanged for a time that does not.
 * The first `warmUp` samples after construction or `reset()` return the input but are
 * still fed to the filter, so it has history when smoothing starts.
 *
 * The result is the package's output array, reused on the next call (or the input, while
 * warming up): the tracker copies every filter's result (G7), so this module does not
 * copy it again.
 */
export function createPoseFilter(options: OneEuroConfig): PoseFilter {
  const minCutOff = options?.minCutOff ?? ONE_EURO_DEFAULTS.minCutOff;
  const beta = options?.beta ?? ONE_EURO_DEFAULTS.beta;
  const warmUp = options?.warmUp ?? ONE_EURO_DEFAULTS.warmUp;
  const f = new OneEuroFilter(minCutOff, beta);
  // The package writes into `out`, so filtering allocates nothing.
  const out = new Float64Array(16);
  let seen = 0;
  return {
    filter(timeMs, pose) {
      const filtered = f.filter(timeMs, pose, out);
      const warming = seen < warmUp;
      seen++;
      return warming ? pose : filtered;
    },
    reset() {
      f.reset();
      seen = 0;
    },
  };
}
