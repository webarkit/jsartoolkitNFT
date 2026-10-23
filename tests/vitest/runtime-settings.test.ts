import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { VARIANTS } from "./variants";
import { CAMERA_PARAM, VIDEO_WIDTH, VIDEO_HEIGHT } from "./helpers";

/**
 * configure() and getRuntimeSettings() on ARControllerNFT (#720), on every browser build.
 *
 * configure(patch) deep-merges the patch into getRuntimeSettings() and hands the result to
 * the core, which validates everything first and changes nothing on failure (D7, D8). An
 * unknown key is a TypeError, a value the core refuses a RangeError. getCameraMatrix()
 * follows the planes at once, from initialisation on (D4, D5).
 */

/** The near and far planes encoded in an OpenGL frustum matrix (column-major). */
function planesOf(m: ArrayLike<number>): { near: number; far: number } {
  // m[10] = -(f + n) / (f - n), m[14] = -2fn / (f - n)
  return { near: m[14] / (m[10] - 1), far: m[14] / (m[10] + 1) };
}

describe.each(VARIANTS)("runtime settings ($name)", (variant) => {
  let ar: any;
  let initial: any;

  beforeAll(async () => {
    const { ARControllerNFT } = await variant.load();
    ar = await ARControllerNFT.initWithDimensions(
      VIDEO_WIDTH,
      VIDEO_HEIGHT,
      CAMERA_PARAM,
    );
    initial = ar.getRuntimeSettings();
  });

  afterAll(() => {
    ar?.dispose?.();
  });

  // Every test starts from the settings right after init. getRuntimeSettings() returns a
  // complete settings object, which is also a valid patch.
  afterEach(() => {
    ar.configure(initial);
  });

  const cameraMatrix = () =>
    Array.from(ar.getCameraMatrix() as ArrayLike<number>);

  it("starts with the documented defaults", () => {
    expect(initial.near).toBeCloseTo(0.1, 10);
    expect(initial.far).toBe(1000);
    expect(initial.continuousDetection).toBe(true);
    // The sentinel -1 is resolved to the build's preset.
    expect(initial.detectionInterval).toBe(variant.detectionIntervalMs);
    expect(initial.logLevel).toBe(1);
    expect(initial.ar2.trackingThresh).toBe(5);
    expect(initial.ar2.simThresh).toBe(0.5);
    expect(initial.ar2.searchFeatureNum).toBe(16);
    expect(initial.ar2.templateSize1).toBe(6);
    expect(initial.ar2.templateSize2).toBe(6);
    // 0 is resolved to the preset's 6, or 12 on a multi-CPU threaded build.
    expect([6, 12]).toContain(initial.ar2.searchSize);
  });

  it("matrix follows the planes from init", async () => {
    const planes = planesOf(cameraMatrix());
    expect(planes.near).toBeCloseTo(0.1, 6);
    expect(planes.far).toBeCloseTo(1000, 2);

    const { ARControllerNFT } = await variant.load();
    const other = await ARControllerNFT.initWithDimensions(
      VIDEO_WIDTH,
      VIDEO_HEIGHT,
      CAMERA_PARAM,
    );
    try {
      other.configure({ near: 0.1, far: 1000 });
      expect(cameraMatrix()).toEqual(
        Array.from(other.getCameraMatrix() as ArrayLike<number>),
      );
    } finally {
      other.dispose?.();
    }
  });

  it("setter rebuilds the matrix", () => {
    const before = cameraMatrix();
    ar.setProjectionNearPlane(10);
    const after = cameraMatrix();
    expect(after[10]).not.toBe(before[10]);
    expect(after[14]).not.toBe(before[14]);
    expect(after).toEqual(
      Array.from(ar.artoolkitNFT.getCameraLens() as ArrayLike<number>),
    );
    expect(planesOf(after).near).toBeCloseTo(10, 6);
  });

  it("configure() rebuilds the matrix at once", () => {
    ar.configure({ near: 1, far: 500 });
    const planes = planesOf(cameraMatrix());
    expect(planes.near).toBeCloseTo(1, 6);
    expect(planes.far).toBeCloseTo(500, 3);
    expect(ar.getProjectionNearPlane()).toBe(1);
    expect(ar.getProjectionFarPlane()).toBe(500);
  });

  it("configure round trip with nested ar2", () => {
    // 0.75, not 0.6: the AR2 thresholds are float32 in the core, and 0.75 is exact there.
    ar.configure({ ar2: { simThresh: 0.75 } });
    const after = ar.getRuntimeSettings();
    expect(after.ar2).toEqual({ ...initial.ar2, simThresh: 0.75 });
    const { ar2: _a, ...restAfter } = after;
    const { ar2: _b, ...restBefore } = initial;
    expect(restAfter).toEqual(restBefore);
  });

  it("unknown and deprecated keys throw TypeError", () => {
    const matrix = cameraMatrix();
    expect(() => ar.configure({ nearPlane: 1 })).toThrow(TypeError);
    expect(() => ar.configure({ nearPlane: 1 })).toThrow(/nearPlane/);
    expect(() => ar.configure({ threshold: 5 })).toThrow(TypeError);
    expect(() => ar.configure({ debugMode: true })).toThrow(TypeError);
    expect(() => ar.configure({ ar2: { searchFeature: 3 } })).toThrow(
      /ar2\.searchFeature/,
    );
    // A known key with the wrong type is not coerced.
    expect(() => ar.configure({ near: "1" })).toThrow(TypeError);
    expect(() => ar.configure({ filtering: 1 })).toThrow(TypeError);
    expect(() => ar.configure({ ar2: 5 })).toThrow(TypeError);
    expect(ar.getRuntimeSettings()).toEqual(initial);
    expect(cameraMatrix()).toEqual(matrix);
  });

  it("non-integer values for integer settings throw TypeError", () => {
    // These are int in the core, and Embind would truncate 3.5 to 3 instead of failing.
    const matrix = cameraMatrix();
    expect(() => ar.configure({ ar2: { searchFeatureNum: 3.5 } })).toThrow(
      /ar2\.searchFeatureNum/,
    );
    expect(() => ar.configure({ ar2: { searchFeatureNum: 3.5 } })).toThrow(
      TypeError,
    );
    expect(() => ar.configure({ ar2: { templateSize1: 6.2 } })).toThrow(
      TypeError,
    );
    expect(() => ar.configure({ ar2: { templateSize2: NaN } })).toThrow(
      TypeError,
    );
    expect(() => ar.configure({ ar2: { searchSize: 1.5 } })).toThrow(TypeError);
    expect(() => ar.configure({ logLevel: 1.5 })).toThrow(/logLevel/);
    // Nothing is applied, not even the valid keys of the same patch.
    expect(() =>
      ar.configure({ near: 2, ar2: { searchFeatureNum: 3.5 } }),
    ).toThrow(TypeError);
    expect(ar.getRuntimeSettings()).toEqual(initial);
    expect(cameraMatrix()).toEqual(matrix);
  });

  it("invalid values throw RangeError", () => {
    const matrix = cameraMatrix();
    expect(() => ar.configure({ near: 0 })).toThrow(RangeError);
    expect(() => ar.configure({ near: 1, far: 0.5 })).toThrow(RangeError);
    expect(() => ar.configure({ ar2: { searchFeatureNum: 41 } })).toThrow(
      RangeError,
    );
    expect(() => ar.configure({ detectionInterval: -2 })).toThrow(RangeError);
    expect(() => ar.configure({ logLevel: 99 })).toThrow(RangeError);
    expect(ar.getRuntimeSettings()).toEqual(initial);
    expect(cameraMatrix()).toEqual(matrix);
  });

  it("configure({}) changes nothing", () => {
    const matrix = cameraMatrix();
    ar.configure({});
    expect(ar.getRuntimeSettings()).toEqual(initial);
    expect(cameraMatrix()).toEqual(matrix);
  });

  it("filtering is accepted on every variant", () => {
    // Every build constructs its binding with filtering on, the threaded one too (D13).
    expect(initial.filtering).toBe(true);
    ar.configure({ filtering: false });
    expect(ar.getRuntimeSettings().filtering).toBe(false);
    ar.configure({ filtering: true });
    expect(ar.getRuntimeSettings().filtering).toBe(true);
  });

  it("logLevel is the controller's log level", () => {
    ar.configure({ logLevel: 3 });
    expect(ar.getLogLevel()).toBe(3);
    expect(ar.getRuntimeSettings().logLevel).toBe(3);
    ar.setLogLevel(2);
    expect(ar.getRuntimeSettings().logLevel).toBe(2);
  });

  it("is on ARToolkitNFT too", () => {
    const toolkit = ar.artoolkitNFT;
    toolkit.configure({ continuousDetection: false, detectionInterval: 50 });
    const s = toolkit.getRuntimeSettings();
    expect(s.continuousDetection).toBe(false);
    expect(s.detectionInterval).toBe(50);
    expect(() => toolkit.configure({ bogus: 1 })).toThrow(TypeError);
    expect(() => toolkit.configure({ far: -1 })).toThrow(RangeError);
  });
});
