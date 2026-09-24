/**
 * The builds a suite runs against. The default and SIMD builds compile the same
 * native binding (ARToolKitNFT_js.cpp). The threaded build (ARToolKitNFT_js_td.cpp) detects on a worker thread.
 *
 * `frameScale` is the scale at which a suite draws its camera frames for that
 * build. The threaded build links with a fixed 128 MB heap that cannot grow,
 * which cannot hold KPM on a 2000 x 1500 frame, so it runs at half scale.
 *
 * `detectionIntervalMs` is the build's default for `setDetectionInterval()`. The
 * default and SIMD builds detect at most every 300 ms while a marker is tracked;
 * the threaded build detects on a worker, so it does not throttle by default.
 */
export const VARIANTS: {
  name: string;
  frameScale: number;
  detectionIntervalMs: number;
  load: () => Promise<{ ARControllerNFT: any }>;
}[] = [
  { name: "wasm", frameScale: 1, detectionIntervalMs: 300, load: () => import("../../src/index") },
  {
    name: "wasm-simd",
    frameScale: 1,
    detectionIntervalMs: 300,
    load: () => import("../../src/index_simd"),
  },
  {
    name: "wasm-threaded",
    frameScale: 0.5,
    detectionIntervalMs: 0,
    load: () => import("../../src/index_td"),
  },
];
