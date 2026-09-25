import { describe, it, expect, beforeAll } from "vitest";
// @ts-ignore - Emscripten output has no useful types
import es6Factory from "../../build/artoolkitNFT_ES6_wasm.js";
// @ts-ignore - Emscripten output has no useful types
import es6SimdFactory from "../../build/artoolkitNFT_ES6_wasm.simd.js";
// @ts-ignore - Emscripten output has no useful types
import es6ThreadedFactory from "../../build/artoolkitNFT_ES6_wasm_td.js";
// @ts-ignore - Emscripten output has no useful types
import embedFactory from "../../build/artoolkitNFT_embed_ES6_wasm.js";

/**
 * What each Emscripten module exports.
 *
 * These assertions look trivial, and that is the point: the 1.10.1 regression
 * (#614) was nothing more than `HEAPU8` missing from EXPORTED_RUNTIME_METHODS in
 * tools/makem.js. `Module.HEAPU8` was `undefined`, so every `process()` call
 * threw, and nothing in the test suite noticed because nothing pushed a frame.
 *
 * A flag change in makem.js can silently remove any of these from any one
 * target, so every ES6 module build is checked, not just the default one.
 * Asserting the surface here fails fast and points straight at the build
 * configuration rather than at whichever call site dereferences it first.
 *
 * `api` is the class each build exposes: the binding class `ARToolKitNFT` for
 * the builds `src/` wraps, the legacy `ARControllerNFT` for the embed build.
 */
const MODULE_BUILDS: {
  file: string;
  factory: () => Promise<any>;
  api: string;
}[] = [
  {
    file: "artoolkitNFT_ES6_wasm.js",
    factory: es6Factory,
    api: "ARToolKitNFT",
  },
  {
    file: "artoolkitNFT_ES6_wasm.simd.js",
    factory: es6SimdFactory,
    api: "ARToolKitNFT",
  },
  {
    file: "artoolkitNFT_ES6_wasm_td.js",
    factory: es6ThreadedFactory,
    api: "ARToolKitNFT",
  },
  {
    file: "artoolkitNFT_embed_ES6_wasm.js",
    factory: embedFactory,
    api: "ARControllerNFT",
  },
];

for (const build of MODULE_BUILDS) {
  describe(`Emscripten module surface (${build.file})`, () => {
    let module: any;

    beforeAll(async () => {
      module = await build.factory();
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

    it(`exposes the ${build.api} class`, () => {
      expect(typeof module[build.api]).toBe("function");
    });
  });
}

/**
 * What the *package* exports.
 *
 * Distinct from the Emscripten surface above: this is what a consumer receives
 * from `import ... from "@webarkit/jsartoolkit-nft"`. `package.json` routes every
 * entry point through `src/index*.ts` and exposes no `./abstractions` subpath, so
 * anything those indexes do not re-export is unreachable however it is declared.
 *
 * `ARLogLevel` was exactly that: `setLogLevel(level: ARLogLevel | number)` named
 * the enum in its public signature while no entry point exported it, so the enum
 * could be read in an editor but never imported. Caught in review on the 1.12.0
 * release PR (#639) before it shipped.
 *
 * It matters that `ARLogLevel` is an *enum* rather than an interface: it has a
 * runtime representation, so `export type` would not be enough — it has to be a
 * value export, which is why the assertions below check real values.
 */
describe("public package surface", () => {
  it("exports the two classes consumers construct", async () => {
    const pkg = await import("../../src/index");
    expect(typeof pkg.ARToolkitNFT).toBe("function");
    expect(typeof pkg.ARControllerNFT).toBe("function");
  });

  it("exports ARLogLevel as a runtime value, not just a type", async () => {
    const { ARLogLevel } = await import("../../src/index");
    expect(ARLogLevel).toBeDefined();
    expect(ARLogLevel.Debug).toBe(0);
    expect(ARLogLevel.Info).toBe(1);
    expect(ARLogLevel.Warn).toBe(2);
    expect(ARLogLevel.Error).toBe(3);
    expect(ARLogLevel.RelInfo).toBe(4);
  });

  it("exports ARLogLevel from every entry point, not just the default one", async () => {
    // Each build target has its own index, and they drift: the enum was missing
    // from all four at once precisely because nothing asserted on them together.
    const entries = await Promise.all([
      import("../../src/index"),
      import("../../src/index_simd"),
      import("../../src/index_td"),
    ]);
    for (const entry of entries) {
      expect((entry as any).ARLogLevel?.Debug).toBe(0);
      expect(typeof (entry as any).ARControllerNFT).toBe("function");
    }
  });
});
