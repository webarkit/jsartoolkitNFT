/**
 * The builds a suite runs against. The default and SIMD builds compile the same
 * native binding (ARToolKitNFT_js.cpp). The threaded build (ARToolKitNFT_js_td.cpp) detects on a worker thread.
 *
 * `frameScale` is the scale at which a suite draws its camera frames for that
 * build. The threaded build links with a fixed 128 MB heap that cannot grow,
 * which cannot hold KPM on a 2000 x 1500 frame, so it runs at half scale.
 */
export const VARIANTS: {
  name: string;
  frameScale: number;
  load: () => Promise<{ ARControllerNFT: any }>;
}[] = [
  { name: "wasm", frameScale: 1, load: () => import("../../src/index") },
  { name: "wasm-simd", frameScale: 1, load: () => import("../../src/index_simd") },
  { name: "wasm-threaded", frameScale: 0.5, load: () => import("../../src/index_td") },
];
