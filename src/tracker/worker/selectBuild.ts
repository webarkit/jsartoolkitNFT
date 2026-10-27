/**
 * Which worker bundle createNFTTrackerWorker starts (#720 D4). The choice is made on the
 * page, whichever entry point imported the wrapper: the main-thread bundle does not
 * decide which build the worker loads.
 */

export type BuildName = "default" | "simd" | "td";

/** The worker bundle of each build, resolved against `workerBase` (D4, D16). */
export const WORKER_FILES: Record<BuildName, string> = {
  default: "NFTTracker.worker.js",
  simd: "NFTTracker_simd.worker.js",
  td: "NFTTracker_td.worker.js",
};

/**
 * D4: `td` if the page is cross-origin isolated (the threaded build needs
 * SharedArrayBuffer), otherwise `simd` if WASM SIMD is supported, otherwise `default`.
 * An explicit build wins whatever the environment.
 */
export function selectBuild(
  requested: "auto" | BuildName,
  env: { crossOriginIsolated: boolean; simd: boolean },
): BuildName {
  if (requested !== "auto") return requested;
  if (env.crossOriginIsolated) return "td";
  return env.simd ? "simd" : "default";
}

/**
 * A one-function module returning a v128 (`i32.const 0`, `i8x16.splat`, `i8x16.popcnt`):
 * these are wasm-feature-detect's SIMD bytes. It validates only where WASM SIMD exists.
 */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8,
  0, 65, 0, 253, 15, 253, 98, 11,
]);

export function supportsWasmSimd(): boolean {
  try {
    return WebAssembly.validate(SIMD_PROBE);
  } catch {
    return false;
  }
}
