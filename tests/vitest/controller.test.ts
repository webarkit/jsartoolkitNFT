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

  describe("settings", () => {
    it("round-trips the projection near plane", () => {
      ar.setProjectionNearPlane(123.45);
      expect(ar.getProjectionNearPlane()).toBeCloseTo(123.45, 2);
    });

    it("round-trips the projection far plane", () => {
      ar.setProjectionFarPlane(543.21);
      expect(ar.getProjectionFarPlane()).toBeCloseTo(543.21, 2);
    });

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
