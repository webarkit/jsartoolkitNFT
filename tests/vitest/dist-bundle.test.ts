import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CAMERA_PARAM,
  MARKER_PINBALL,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  blankFrame,
  loadMarker,
} from "./helpers";

/**
 * Smoke test against the built bundle rather than the sources.
 *
 * `controller.test.ts` imports `src/` — good for coverage and fast feedback, but
 * it cannot catch a stale or broken `dist/`. Browser consumers get
 * `dist/ARToolkitNFT.js`, and that artifact is committed to the repository
 * rather than built during CI, so it can drift from the sources it is supposed
 * to represent. Rebuilding with no source change still rewrites four `dist/`
 * bundles, because webpack is not byte-reproducible here — so a packaging
 * regression would pass every source-level test and still break consumers.
 *
 * The bundle is loaded with a script tag rather than an `import`. It is webpack
 * UMD output built with no `library` name, so its browser branch copies each
 * export onto the global object; it is not importable as an ES module. This is
 * also exactly how a `<script src="dist/ARToolkitNFT.js">` consumer receives it.
 *
 * Deliberately thin — one load and one frame. Detailed behaviour is covered
 * against `src/`; this only asks whether the shipped artifact works at all.
 */

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}

describe("dist/ARToolkitNFT.js (the published browser bundle)", () => {
  let ar: any;

  beforeAll(async () => {
    await loadScript("/dist/ARToolkitNFT.js");
  });

  afterAll(() => {
    ar?.dispose?.();
  });

  it("puts the public API on the global object", () => {
    expect(typeof (globalThis as any).ARControllerNFT).toBe("function");
    expect(typeof (globalThis as any).ARToolkitNFT).toBe("function");
  });

  it("initialises a controller from the bundle", async () => {
    const { ARControllerNFT } = globalThis as any;
    ar = await ARControllerNFT.initWithDimensions(
      VIDEO_WIDTH,
      VIDEO_HEIGHT,
      CAMERA_PARAM,
      true,
    );
    expect(ar).toBeDefined();
    expect(ar.id).toBeGreaterThanOrEqual(0);
  });

  it("loads an NFT marker", async () => {
    const id = await loadMarker(ar, MARKER_PINBALL);
    expect(id).toBe(0);
  });

  it("runs process() on a frame", () => {
    // The bundle embeds its own copy of the Emscripten module, so this also
    // confirms HEAPU8 is exported in the artifact consumers actually load (#614).
    expect(() => ar.process(blankFrame())).not.toThrow();
  });
});
