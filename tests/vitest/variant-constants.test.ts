import { describe, it, expect } from "vitest";
import { ARToolkitNFTBase } from "../../src/ARToolkitNFTBase";
import { VARIANTS } from "./variants";

/**
 * The module constants ARToolkitNFT.init() copies from the WASM module
 * (AR_LOG_LEVEL_*, AR_DEBUG_*, ERROR_MARKER_INDEX_OUT_OF_BOUNDS, ...).
 *
 * The three browser builds share ARToolkitNFTBase (#734). Each build's
 * ARToolkitNFT still gets its own copy of the constants, as when every build had
 * its own copy of the class: written onto the base, the builds loaded in one page
 * would share one set; written onto `this.constructor`, they would land on a
 * consumer's subclass instead of ARToolkitNFT (D6 in
 * specs/2026-10-21-shared-browser-variants-design.md).
 *
 * The file runs in its own page, so no build is initialised before these tests.
 */
describe("module constants of the browser builds", () => {
  it("init() puts them on its own build's ARToolkitNFT, not on the base or another build", async () => {
    const classes = await Promise.all(
      VARIANTS.map(async (v) => ((await v.load()) as any).ARToolkitNFT),
    );

    for (let i = 0; i < classes.length; i++) {
      await new classes[i]().init();

      expect(
        Object.hasOwn(classes[i], "AR_LOG_LEVEL_DEBUG"),
        VARIANTS[i].name,
      ).toBe(true);
      expect(classes[i].AR_LOG_LEVEL_DEBUG, VARIANTS[i].name).toBe(0);
      expect(classes[i].AR_LOG_LEVEL_ERROR, VARIANTS[i].name).toBe(3);
      // The builds not initialised yet still have none of their own.
      for (let j = i + 1; j < classes.length; j++) {
        expect(
          Object.hasOwn(classes[j], "AR_LOG_LEVEL_DEBUG"),
          `${VARIANTS[j].name} after ${VARIANTS[i].name}.init()`,
        ).toBe(false);
      }
      expect(ARToolkitNFTBase.AR_LOG_LEVEL_DEBUG).toBeUndefined();
    }
  });

  it("init() on a consumer's subclass fills ARToolkitNFT, not the subclass", async () => {
    const { ARToolkitNFT } = (await VARIANTS[0].load()) as any;
    class Mine extends ARToolkitNFT {}

    await new Mine().init();

    expect(Object.hasOwn(ARToolkitNFT, "AR_LOG_LEVEL_DEBUG")).toBe(true);
    expect(Object.hasOwn(Mine, "AR_LOG_LEVEL_DEBUG")).toBe(false);
  });
});
