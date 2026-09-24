import { describe, it, expect, beforeAll } from "vitest";
import { CAMERA_PARAM, MARKER_PINBALL, loadMarker } from "./helpers";
import { loadCompositeFrames } from "./frames";

/**
 * One detection suite for every build that exposes the legacy controller API:
 * the global builds (`js/artoolkitNFT.api.js`, injected with a script tag) and
 * the embed ES6 build (`js/artoolkitNFT_ES6.api.js`, imported).
 *
 * Each suite detects the pinball print in `examples/node/pinball-demo.jpg`, so a
 * build that loads but no longer tracks (a bad SIMD flag, a missing runtime
 * export) fails here rather than in a user's camera. It replaces Karma, whose
 * specs only checked that methods existed (#579).
 *
 * The global builds set page globals (`Module`, `artoolkitNFT`,
 * `ARControllerNFT`), so two cannot share a page. Vitest's browser mode runs each
 * test file in its own iframe, which is why there is one `legacy-*.test.ts` file
 * per build.
 */

/** What a suite needs from a build: the legacy controller class. */
export interface LegacyApi {
  ARControllerNFT: new (
    width: number,
    height: number,
    cameraParam: string,
  ) => any;
}

export interface SuiteOptions {
  /** Scale for the 2000x1500 photo. The spec allows 0.5 only for a file over 30 s. */
  frameScale?: number;
  /** Frames to push before giving up on detection. The threaded build needed 28. */
  maxFrames?: number;
  /**
   * Expect `dispose()` to abort. The legacy bindings' `teardown()`
   * (emscripten/ARToolKitJS.cpp, ARToolKitJS_td.cpp) calls `delete` on a pointer
   * into its `std::unordered_map` and then erases the same entry, a double free.
   * Every legacy build has it (#663); only the debug build's allocator checks catch it.
   * The test then asserts that exact abort. Once the C++ is fixed, dispose() stops
   * throwing, the assertion fails, and this option should be removed.
   */
  disposeAborts?: boolean;
}

/** Longest a build or its camera parameters may take to become ready. */
const READY_TIMEOUT_MS = 30_000;

/**
 * The asm.js builds (`min`, `debug`) took about 4 s to load pinball and 5.5 s for
 * one detection pass at 2000x1500 on a desktop; CI runners are slower.
 */
const DETECT_TIMEOUT_MS = 120_000;

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Load a global build from `build/` and resolve once its runtime is ready. */
export function injectLegacyBuild(buildFile: string): Promise<LegacyApi> {
  const w = window as any;
  if (w.artoolkitNFT || w.ARControllerNFT) {
    return Promise.reject(
      new Error(
        `legacy globals are already defined before loading ${buildFile}: ` +
          "another build ran in this page, so test-file isolation is off",
      ),
    );
  }
  return new Promise<LegacyApi>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `${buildFile} loaded but never fired artoolkitNFT-loaded within ${READY_TIMEOUT_MS} ms`,
          ),
        ),
      READY_TIMEOUT_MS,
    );
    // Listen before injecting: a cached script can initialise before a listener
    // attached afterwards would exist.
    window.addEventListener(
      "artoolkitNFT-loaded",
      () => {
        clearTimeout(timer);
        resolve({ ARControllerNFT: w.ARControllerNFT });
      },
      { once: true },
    );
    const script = document.createElement("script");
    script.src = `/build/${buildFile}`;
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`could not load /build/${buildFile}`));
    };
    document.head.appendChild(script);
  });
}

/**
 * Construct a controller and wait for it. The legacy API reports readiness by
 * calling `onload` from a `setTimeout`, so assigning it after construction is in
 * time. A failed camera load also calls `onload`, with the error as argument.
 */
function createController(
  api: LegacyApi,
  width: number,
  height: number,
): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    const ar = new api.ARControllerNFT(width, height, CAMERA_PARAM);
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `controller never called onload within ${READY_TIMEOUT_MS} ms`,
          ),
        ),
      READY_TIMEOUT_MS,
    );
    ar.onload = (err?: unknown) => {
      clearTimeout(timer);
      if (err !== undefined) {
        reject(
          new Error(
            `camera parameters failed to load (${CAMERA_PARAM}): ${err}`,
          ),
        );
      } else {
        resolve(ar);
      }
    };
  });
}

/**
 * A pose from a real detection: 16 finite values, not the identity, and a
 * non-zero translation (elements 12-14 of the column-major matrix). A detected
 * marker is always some distance from the camera, so a zeroed or identity pose
 * means the build reported "found" without really tracking.
 */
export function expectRealPose(matrix: ArrayLike<number>): void {
  const values = Array.from(matrix);
  expect(values).toHaveLength(16);
  expect(values.every(Number.isFinite)).toBe(true);
  expect(values).not.toEqual(IDENTITY);
  expect(values.slice(12, 15).some((v) => v !== 0)).toBe(true);
}

export function controllerDetectionSuite(
  label: string,
  loadApi: () => Promise<LegacyApi>,
  options: SuiteOptions = {},
): void {
  const maxFrames = options.maxFrames ?? 200;

  describe(`legacy controller API (${label})`, () => {
    let ar: any;
    let frame: ImageData;

    beforeAll(async () => {
      const api = await loadApi();
      const frames = await loadCompositeFrames(options.frameScale ?? 1);
      frame = frames.pinballOnly;
      ar = await createController(api, frames.width, frames.height);
    }, 90_000);

    it("initialises a controller", () => {
      expect(ar.id).toBeGreaterThanOrEqual(0);
      const camera = Array.from(ar.getCameraMatrix() as ArrayLike<number>);
      expect(camera).toHaveLength(16);
      expect(camera.every(Number.isFinite)).toBe(true);
    });

    it(
      "detects the pinball marker",
      async () => {
        const id = await loadMarker(ar, MARKER_PINBALL, 60_000);
        ar.trackNFTMarkerId(id);

        const found: { pose?: number[] } = {};
        const onFound = (ev: any) => {
          if (ev.data.index === id)
            found.pose = Array.from(ev.data.matrixGL_RH as ArrayLike<number>);
        };
        ar.addEventListener("getNFTMarker", onFound);
        try {
          // Yield between frames: the threaded build detects on a worker, so a
          // frame only reports the marker once that worker has finished.
          for (let i = 0; i < maxFrames && !found.pose; i++) {
            ar.process(frame);
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        } finally {
          ar.removeEventListener("getNFTMarker", onFound);
        }

        if (!found.pose)
          throw new Error(`pinball was not detected in ${maxFrames} frames`);
        expectRealPose(found.pose);
      },
      DETECT_TIMEOUT_MS,
    );

    it("sets and reads the projection planes", () => {
      ar.setProjectionNearPlane(1);
      expect(ar.getProjectionNearPlane()).toBeCloseTo(1, 5);
      ar.setProjectionFarPlane(2000);
      expect(ar.getProjectionFarPlane()).toBeCloseTo(2000, 5);
    });

    // Last, because it tears the controller down. A test rather than an afterAll
    // hook, so a teardown failure is reported by name.
    if (options.disposeAborts) {
      // Pinned to the Emscripten abort, so a different teardown error still
      // fails. Once the double free is fixed, dispose() stops throwing, this
      // fails, and `disposeAborts` should go.
      it("disposes the controller (aborts: teardown double free)", () => {
        expect(() => ar.dispose()).toThrow(
          /Aborted\(native code called abort\(\)\)/,
        );
      });
    } else {
      it("disposes the controller", () => {
        ar.dispose();
      });
    }
  });
}

/** The suite for one global build in `build/`, loaded with a script tag. */
export function legacyDetectionSuite(
  buildFile: string,
  options?: SuiteOptions,
): void {
  controllerDetectionSuite(
    buildFile,
    () => injectLegacyBuild(buildFile),
    options,
  );
}
