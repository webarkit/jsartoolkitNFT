import { describe, it, expect, beforeAll } from "vitest";
// @ts-ignore - Emscripten output has no useful types
import ARToolkitNFTFactory from "../../build/artoolkitNFT_ES6_wasm.js";

/**
 * What the Emscripten module exports.
 *
 * These assertions look trivial, and that is the point: the 1.10.1 regression
 * (#614) was nothing more than `HEAPU8` missing from EXPORTED_RUNTIME_METHODS in
 * tools/makem.js. `Module.HEAPU8` was `undefined`, so every `process()` call
 * threw, and nothing in the test suite noticed because nothing pushed a frame.
 *
 * A flag change in makem.js can silently remove any of these. Asserting the
 * surface here fails fast and points straight at the build configuration rather
 * than at whichever call site happens to dereference it first.
 */
describe("Emscripten module surface", () => {
  let module: any;

  beforeAll(async () => {
    module = await ARToolkitNFTFactory();
  });

  it("instantiates", () => {
    expect(module).toBeDefined();
  });

  it("exports HEAPU8 (regression guard for #614)", () => {
    expect(typeof module.HEAPU8).toBe("object");
    expect(module.HEAPU8.byteLength).toBeGreaterThan(0);
  });

  it("exports the allocator used for manual video buffers", () => {
    expect(typeof module._malloc).toBe("function");
    expect(typeof module._free).toBe("function");
  });

  it("exports FS, used to stage camera and marker data", () => {
    expect(typeof module.FS).toBe("object");
  });

  it("exposes the ARToolKitNFT binding class", () => {
    expect(typeof module.ARToolKitNFT).toBe("function");
  });
});
