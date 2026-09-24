/**
 * The builds a suite runs against. The default and SIMD builds compile the same
 * native binding (ARToolKitNFT_js.cpp). The threaded build (ARToolKitNFT_js_td.cpp) detects on a worker thread.
 *
 * `detectionIntervalMs` is the build's default for `setDetectionInterval()`. The
 * default and SIMD builds detect at most every 300 ms while a marker is tracked;
 * the threaded build detects on a worker, so it does not throttle by default.
 */
export const VARIANTS: {
  name: string;
  detectionIntervalMs: number;
  load: () => Promise<{ ARControllerNFT: any }>;
}[] = [
  { name: "wasm", detectionIntervalMs: 300, load: () => import("../../src/index") },
  {
    name: "wasm-simd",
    detectionIntervalMs: 300,
    load: () => import("../../src/index_simd"),
  },
  {
    name: "wasm-threaded",
    detectionIntervalMs: 0,
    load: () => import("../../src/index_td"),
  },
];
