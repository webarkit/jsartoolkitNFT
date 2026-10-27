/**
 * Which worker bundle createNFTTrackerWorker starts (#720 D4). The choice is made on the
 * page, whichever entry point imported the wrapper: the main-thread bundle does not
 * decide which build the worker loads.
 */
export type BuildName = "default" | "simd" | "td";
/** The worker bundle of each build, resolved against `workerBase` (D4, D16). */
export declare const WORKER_FILES: Record<BuildName, string>;
/**
 * D4: `td` if the page is cross-origin isolated (the threaded build needs
 * SharedArrayBuffer), otherwise `simd` if WASM SIMD is supported, otherwise `default`.
 * An explicit build wins whatever the environment.
 */
export declare function selectBuild(requested: "auto" | BuildName, env: {
    crossOriginIsolated: boolean;
    simd: boolean;
}): BuildName;
export declare function supportsWasmSimd(): boolean;
