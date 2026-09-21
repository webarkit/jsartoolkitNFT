import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ARControllerNFT } from "../../src/index";
import {
  CAMERA_PARAM,
  MARKER_PINBALL,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  blankFrame,
  loadMarker,
} from "./helpers";

/**
 * ARControllerNFT, driven through `src/` — the code that ships as `dist/` and
 * that consumers import.
 *
 * The Karma specs this sits alongside exercise either the deprecated
 * `js/artoolkitNFT.api.js` or the raw Emscripten binding, and never load a
 * marker or push a frame. That gap is why #614 shipped: `process()` was broken
 * on every path and the suite stayed green. See #579.
 */
describe("ARControllerNFT", () => {
  let ar: any;

  beforeAll(async () => {
    ar = await ARControllerNFT.initWithDimensions(
      VIDEO_WIDTH,
      VIDEO_HEIGHT,
      CAMERA_PARAM,
      true,
    );
  });

  afterAll(() => {
    ar?.dispose?.();
  });

  describe("initialisation", () => {
    it("initialises with an id", () => {
      expect(ar).toBeDefined();
      expect(ar.id).toBeGreaterThanOrEqual(0);
    });

    it("builds a camera matrix from the loaded parameters", () => {
      const m = ar.getCameraMatrix();
      expect(Array.isArray(m)).toBe(true);
      expect(m.length).toBe(16);
      // A real projection matrix, not a zeroed buffer.
      expect(m.some((v: number) => v !== 0)).toBe(true);
    });

    it("exposes a live view of the WASM heap (regression guard for #614)", () => {
      // Read twice: a cached view would survive heap growth as a detached
      // array, which is the second half of the #614 defect.
      expect(typeof ar.artoolkitNFT.HEAPU8).toBe("object");
      expect(ar.artoolkitNFT.HEAPU8.byteLength).toBeGreaterThan(0);
    });
  });

  describe("NFT markers", () => {
    it("loads a marker and reports id 0 for the first one", async () => {
      const id = await loadMarker(ar, MARKER_PINBALL);
      expect(id).toBe(0);
      expect(ar.nftMarkerCount).toBe(1);
    });

    it("reports the marker's dimensions", () => {
      const data = ar.getNFTData(ar.id, 0);
      expect(data).toBeTruthy();
      expect(data.width).toBeGreaterThan(0);
      expect(data.height).toBeGreaterThan(0);
      expect(data.dpi).toBeGreaterThan(0);
    });

    it("accepts a tracking request for a loaded marker", () => {
      expect(() => ar.trackNFTMarkerId(0)).not.toThrow();
    });
  });

  describe("process()", () => {
    /**
     * The test that #614 needed. Before the fix this threw
     * "Cannot read properties of undefined (reading 'set')" on the first call,
     * on every build target.
     */
    it("pushes a frame through without throwing", () => {
      expect(() => ar.process(blankFrame())).not.toThrow();
    });

    it("survives repeated frames", () => {
      for (let i = 0; i < 5; i++) {
        expect(() => ar.process(blankFrame())).not.toThrow();
      }
    });

    it("reports no marker found in a blank frame", () => {
      ar.process(blankFrame());
      const info = ar.getNFTMarker(0);
      // A blank grey frame has no features, so detection must not claim a hit.
      expect(Boolean(info && info.found)).toBe(false);
    });
  });

  describe("projection planes", () => {
    let originalNear: number;
    let originalFar: number;

    beforeAll(() => {
      originalNear = ar.getProjectionNearPlane();
      originalFar = ar.getProjectionFarPlane();
    });

    afterAll(() => {
      ar.setProjectionNearPlane(originalNear);
      ar.setProjectionFarPlane(originalFar);
    });

    /**
     * These only prove the value survives the WASM boundary: the native setter
     * assigns a field and the getter reads it straight back. That is worth
     * something — it covers the embind marshalling of ARdouble — but it is not
     * evidence that the planes do anything.
     *
     * They currently cannot be anything more. See the skipped test below.
     */
    it("stores and returns the near plane", () => {
      ar.setProjectionNearPlane(0.5);
      expect(ar.getProjectionNearPlane()).toBeCloseTo(0.5, 5);
    });

    it("stores and returns the far plane", () => {
      ar.setProjectionFarPlane(2000);
      expect(ar.getProjectionFarPlane()).toBeCloseTo(2000, 5);
    });

    /**
     * SKIPPED — documents behaviour the library does not currently have.
     *
     * The planes feed `arglCameraFrustumRH`, which builds the camera lens, so
     * changing them ought to change the matrix `getCameraMatrix()` returns.
     * Two things prevent it:
     *
     * 1. `_initialize()` caches `camera_mat` from `getCameraLens()` *before*
     *    calling `setProjectionNearPlane(0.1)` / `setProjectionFarPlane(1000)`,
     *    so the cached matrix is built from the constructor defaults
     *    (near 0.0001) and those two calls never reach it.
     * 2. `recalculateCameraLens()` is implemented in C++ and bound via embind,
     *    but `src/ARToolkitNFT.ts` does not proxy it, so nothing in JavaScript
     *    can trigger a rebuild.
     *
     * The setters are therefore observably inert through the public API.
     */
    it.skip("feeds the camera frustum, so changing them changes the matrix", () => {
      ar.setProjectionNearPlane(0.1);
      ar.setProjectionFarPlane(1000);
      const before = Array.from(ar.getCameraMatrix() as ArrayLike<number>);

      ar.setProjectionNearPlane(0.5);
      ar.setProjectionFarPlane(2000);
      const after = Array.from(ar.getCameraMatrix() as ArrayLike<number>);

      expect(before.length).toBe(16);
      expect(after).not.toEqual(before);
    });
  });

  describe("settings", () => {
    it("toggles debug mode", () => {
      ar.setDebugMode(true);
      expect(ar.getDebugMode()).toBeTruthy();
      ar.setDebugMode(false);
      expect(ar.getDebugMode()).toBeFalsy();
    });
  });

  describe("events", () => {
    it("dispatches to registered listeners and stops after removal", () => {
      let fired = 0;
      const listener = () => {
        fired += 1;
      };

      ar.addEventListener("testEvent", listener);
      ar.dispatchEvent({ name: "testEvent", target: ar });
      expect(fired).toBe(1);

      ar.removeEventListener("testEvent", listener);
      ar.dispatchEvent({ name: "testEvent", target: ar });
      expect(fired).toBe(1);
    });
  });
});
