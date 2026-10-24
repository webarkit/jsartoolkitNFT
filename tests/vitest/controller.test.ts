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
 * The other build artifacts get one detection suite each (`legacy-*.test.ts`,
 * `embed-es6.test.ts`); this file covers the shipped API in depth. #614 is why
 * both exist: `process()` was broken on every path while a suite that never
 * pushed a frame stayed green. See #579.
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
     * Since WebARKitLib 0.12.0 the setters rebuild the frustum themselves once a
     * camera is loaded (#720, D5): the old two-step, store then
     * `recalculateCameraLens()`, left getCameraMatrix() wrong until the second
     * step. `recalculateCameraLens()` is kept for compatibility.
     */
    it("stores and returns the near plane", () => {
      ar.setProjectionNearPlane(0.5);
      expect(ar.getProjectionNearPlane()).toBeCloseTo(0.5, 5);
    });

    it("stores and returns the far plane", () => {
      ar.setProjectionFarPlane(2000);
      expect(ar.getProjectionFarPlane()).toBeCloseTo(2000, 5);
    });

    it("rebuilds the camera frustum on recalculateCameraLens()", () => {
      const nft = ar.artoolkitNFT;

      ar.setProjectionNearPlane(0.1);
      ar.setProjectionFarPlane(1000);
      nft.instance.recalculateCameraLens();
      const before = Array.from(nft.getCameraLens() as ArrayLike<number>);

      ar.setProjectionNearPlane(0.5);
      ar.setProjectionFarPlane(2000);
      nft.instance.recalculateCameraLens();
      const after = Array.from(nft.getCameraLens() as ArrayLike<number>);

      expect(before.length).toBe(16);
      expect(after.length).toBe(16);
      expect(after).not.toEqual(before);
    });

    it("rebuilds the frustum on every plane change", () => {
      const nft = ar.artoolkitNFT;
      const lens = () => Array.from(nft.getCameraLens() as ArrayLike<number>);

      const before = lens();
      ar.setProjectionNearPlane(0.25);
      const afterNear = lens();
      expect(afterNear).not.toEqual(before);
      ar.setProjectionFarPlane(1500);
      expect(lens()).not.toEqual(afterNear);

      // recalculateCameraLens() now rebuilds the same matrix.
      const rebuilt = lens();
      nft.instance.recalculateCameraLens();
      expect(lens()).toEqual(rebuilt);
    });
  });

  describe("log level", () => {
    let original: number;

    beforeAll(() => {
      original = ar.getLogLevel();
    });

    afterAll(() => {
      ar.setLogLevel(original);
    });

    /**
     * `setLogLevel` takes a *level*, not a boolean — lower is more verbose.
     * It was typed as `boolean` until recently, which made `false` (0) the most
     * verbose setting and left Warn and Error unreachable.
     */
    it("round-trips each level", () => {
      for (const level of [0, 1, 2, 3, 4]) {
        ar.setLogLevel(level);
        expect(ar.getLogLevel()).toBe(level);
      }
    });

    /**
     * The native setter is `void`, so there is nothing to return. It was typed
     * as `number` and forwarded the binding call, which handed callers
     * `undefined` while the types promised a level. Asserting the absence keeps
     * anyone from restoring the `number` annotation without also making the C++
     * side return a value.
     */
    it("returns nothing — read the level back with getLogLevel()", () => {
      ar.setLogLevel(3);
      expect(ar.setLogLevel(2)).toBeUndefined();
      expect(ar.getLogLevel()).toBe(2);
    });

    it("ignores a negative level", () => {
      // Matches ARToolKit5's arwSetLogLevel guard. Without it a negative value
      // makes arLog's `logLevel < arLogLevel` test pass for every message, so
      // an apparent "off" would be maximum verbosity.
      ar.setLogLevel(2);
      ar.setLogLevel(-1);
      expect(ar.getLogLevel()).toBe(2);
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

    it("still reaches later listeners when one removes itself during dispatch", () => {
      // Regression for #686: dispatchEvent must iterate over a snapshot, or
      // splicing A out of the live array skips B (the array shifts under the loop).
      let firedA = 0;
      let firedB = 0;
      const listenerA = () => {
        firedA += 1;
        ar.removeEventListener("selfRemove", listenerA);
      };
      const listenerB = () => {
        firedB += 1;
      };

      ar.addEventListener("selfRemove", listenerA);
      ar.addEventListener("selfRemove", listenerB);
      ar.dispatchEvent({ name: "selfRemove", target: ar });
      expect(firedA).toBe(1);
      expect(firedB).toBe(1);

      // A is gone, B stays registered.
      ar.dispatchEvent({ name: "selfRemove", target: ar });
      expect(firedA).toBe(1);
      expect(firedB).toBe(2);

      ar.removeEventListener("selfRemove", listenerB);
    });

    it("treats Object.prototype property names as ordinary event names", () => {
      // The listener registry has no prototype, so a name such as "toString" is not
      // mistaken for a listener array inherited from Object.prototype (#731).
      for (const name of [
        "toString",
        "constructor",
        "hasOwnProperty",
        "__proto__",
      ]) {
        expect(() => ar.dispatchEvent({ name, target: ar }), name).not.toThrow();

        let fired = 0;
        const listener = () => {
          fired += 1;
        };
        ar.addEventListener(name, listener);
        ar.dispatchEvent({ name, target: ar });
        expect(fired, name).toBe(1);

        ar.removeEventListener(name, listener);
        ar.dispatchEvent({ name, target: ar });
        expect(fired, name).toBe(1);
      }
    });

    it("fires a callback registered twice on the same event twice", () => {
      // Listeners are an array, not a set: duplicate registrations are intentional.
      let fired = 0;
      const listener = () => {
        fired += 1;
      };

      ar.addEventListener("twice", listener);
      ar.addEventListener("twice", listener);
      ar.dispatchEvent({ name: "twice", target: ar });
      expect(fired).toBe(2);

      // removeEventListener drops one registration per call.
      ar.removeEventListener("twice", listener);
      ar.dispatchEvent({ name: "twice", target: ar });
      expect(fired).toBe(3);

      ar.removeEventListener("twice", listener);
      ar.dispatchEvent({ name: "twice", target: ar });
      expect(fired).toBe(3);
    });
  });
});
