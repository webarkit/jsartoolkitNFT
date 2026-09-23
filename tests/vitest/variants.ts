/**
 * The builds a suite runs against. The default and SIMD builds compile the same
 * native binding (ARToolKitNFT_js.cpp); the threaded build is added in Task 6 of
 * specs/2026-09-23-multi-nft-marker-implementation-plan.md.
 */
export const VARIANTS: { name: string; load: () => Promise<{ ARControllerNFT: any }> }[] = [
  { name: "wasm", load: () => import("../../src/index") },
  { name: "wasm-simd", load: () => import("../../src/index_simd") },
];
