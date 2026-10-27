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
export declare function createPoseFilter(options: OneEuroConfig): PoseFilter;
