import { describe, it, expect, beforeAll, vi } from "vitest";
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

/**
 * What a suite needs from a build: the legacy controller and camera classes,
 * and the `artoolkitNFT` object that holds the loaders.
 */
export interface LegacyApi {
  artoolkitNFT: any;
  ARControllerNFT: new (
    width: number,
    height: number,
    cameraParam: string,
  ) => any;
  ARCameraParamNFT: new (
    src: string,
    onload: () => void,
    onerror: (err: unknown) => void,
  ) => any;
}

export interface SuiteOptions {
  /** Scale for the 2000x1500 photo. The spec allows 0.5 only for a file over 30 s. */
  frameScale?: number;
  /** Frames to push before giving up on detection. The threaded build needed 28. */
  maxFrames?: number;
}

/** Longest a build or its camera parameters may take to become ready. */
const READY_TIMEOUT_MS = 30_000;

/**
 * The asm.js builds (`min`, `debug`) took about 4 s to load pinball and 5.5 s for
 * one detection pass at 2000x1500 on a desktop; CI runners are slower.
 */
const DETECT_TIMEOUT_MS = 120_000;

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * One load per build and page: the detection and the loading suites of a file
 * share it, since a second script tag would redefine the page globals.
 */
const injected = new Map<string, Promise<LegacyApi>>();

/** Load a global build from `build/` and resolve once its runtime is ready. */
export function injectLegacyBuild(buildFile: string): Promise<LegacyApi> {
  let api = injected.get(buildFile);
  if (!api) {
    api = injectOnce(buildFile);
    injected.set(buildFile, api);
  }
  return api;
}

function injectOnce(buildFile: string): Promise<LegacyApi> {
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
        resolve({
          artoolkitNFT: w.artoolkitNFT,
          ARControllerNFT: w.ARControllerNFT,
          ARCameraParamNFT: w.ARCameraParamNFT,
        });
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
    let api: LegacyApi;
    let ar: any;
    let frame: ImageData;

    beforeAll(async () => {
      api = await loadApi();
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

    // The setters only store the planes; recalculateCameraLens() rebuilds the
    // frustum, and getCameraMatrix() must return the rebuilt one (#630).
    it("refreshes getCameraMatrix() on recalculateCameraLens()", () => {
      const before = Array.from(ar.getCameraMatrix() as ArrayLike<number>);
      ar.setProjectionNearPlane(0.5);
      ar.setProjectionFarPlane(2500);
      ar.recalculateCameraLens();
      const after = Array.from(ar.getCameraMatrix() as ArrayLike<number>);
      expect(after).toHaveLength(16);
      expect(after).not.toEqual(before);
    });

    // dispose() called artoolkitNFT.deleteCamera(), which no binding defines, so
    // it threw for every loaded camera (#277).
    it("disposes a loaded camera parameter", async () => {
      const camera = await new Promise<any>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(`camera never loaded within ${READY_TIMEOUT_MS} ms`),
            ),
          READY_TIMEOUT_MS,
        );
        const param = new api.ARCameraParamNFT(
          CAMERA_PARAM,
          () => {
            clearTimeout(timer);
            resolve(param);
          },
          (err) => {
            clearTimeout(timer);
            reject(new Error(`camera failed to load: ${err}`));
          },
        );
      });
      expect(camera.id).toBeGreaterThanOrEqual(0);
      expect(() => camera.dispose()).not.toThrow();
      expect(camera.id).toBe(-1);
      expect(camera.complete).toBe(false);
    });

    // Last, because it tears the controller down. A test rather than an afterAll
    // hook, so a teardown failure is reported by name.
    it("disposes the controller", () => {
      ar.dispose();
    });
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

/** What a legacy load called back with, collected over a settle window. */
interface Outcome {
  ok: unknown[];
  err: unknown[];
}

/**
 * Runs a callback-style legacy load and collects its callbacks. It resolves a
 * short while after the first one, so a second call (the old loader called
 * `onerror` once per failed file) is seen, and rejects if none comes in time.
 */
function collectOutcome(
  start: (ok: (v: unknown) => void, err: (e: unknown) => void) => void,
  timeoutMs = 60_000,
  settleMs = 1_000,
): Promise<Outcome> {
  return new Promise<Outcome>((resolve, reject) => {
    const outcome: Outcome = { ok: [], err: [] };
    let settling = false;
    const timer = setTimeout(
      () => reject(new Error(`no callback within ${timeoutMs} ms`)),
      timeoutMs,
    );
    const record = (list: unknown[]) => (value: unknown) => {
      list.push(value);
      if (settling) return;
      settling = true;
      clearTimeout(timer);
      setTimeout(() => resolve(outcome), settleMs);
    };
    start(record(outcome.ok), record(outcome.err));
  });
}

/** The path a `fetch` call asked for, whatever form its input took. */
function requestPath(input: RequestInfo | URL): string {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  return new URL(url, location.href).pathname;
}

export interface LoadingSuiteOptions {
  /**
   * The build carries `js/artoolkitNFT_ES6.api.js`, whose controller had a
   * `loadNFTMarkerNew` that could never succeed (D18).
   */
  es6?: boolean;
}

/**
 * The legacy loaders' contract (#685): one outcome per call, the HTTP status or
 * -1 in `onerror`, a native refusal reported instead of `callback([])`, and the
 * legacy native 20-marker limit refused before any request (D17).
 *
 * The legacy native loader gives ids per call and replaces the earlier markers
 * (D17), so every successful load here gets id 0.
 */
export function controllerLoadingSuite(
  label: string,
  loadApi: () => Promise<LegacyApi>,
  options: LoadingSuiteOptions = {},
): void {
  describe(`legacy NFT loading (${label})`, () => {
    let api: LegacyApi;
    let ar: any;

    beforeAll(async () => {
      api = await loadApi();
      ar = await createController(api, 640, 480);
    }, 90_000);

    // The old loader passed the status as the first argument of a
    // (filename, errorNumber) handler, so onerror got undefined, once per file.
    it("a 404 calls onError once with 404", async () => {
      const outcome = await collectOutcome((ok, err) =>
        ar.loadNFTMarker("/examples/DataNFT/missing", ok, err),
      );
      expect(outcome.ok).toEqual([]);
      expect(outcome.err).toEqual([404]);
    });

    it("an explicit .zft loads", async () => {
      const outcome = await collectOutcome((ok, err) =>
        ar.loadNFTMarker("/examples/DataNFT/zft/pinball.zft", ok, err),
      );
      expect(outcome.err).toEqual([]);
      expect(outcome.ok).toEqual([0]);
    });

    // An unreadable .fset makes the legacy native loader return no id: that
    // used to reach callback([]), and the controller's onSuccess(undefined).
    // The file is empty, not 16 zero bytes: ar2ReadFeatureSet accepts zeros
    // as a set of 0 features, so the legacy core registered it as id 0.
    it("a native refusal calls onError once", async () => {
      const realFetch = globalThis.fetch.bind(globalThis);
      const spy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation((input, init) =>
          requestPath(input).endsWith(".fset")
            ? Promise.resolve(new Response(new Uint8Array(0)))
            : realFetch(input, init),
        );
      try {
        const outcome = await collectOutcome(
          (ok, err) => ar.loadNFTMarker(MARKER_PINBALL, ok, err),
          10_000,
        );
        expect(outcome.ok).toEqual([]);
        expect(outcome.err).toHaveLength(1);
      } finally {
        spy.mockRestore();
      }
    });

    // The legacy native loader runs exit(-1) at 20 markers (D17), so the JS
    // refuses the call before downloading anything.
    it("20 URLs are refused up front", async () => {
      const spy = vi.spyOn(globalThis, "fetch");
      try {
        const outcome = await collectOutcome((ok, err) =>
          api.artoolkitNFT.addNFTMarkers(
            ar.id,
            Array(20).fill(MARKER_PINBALL),
            ok,
            err,
          ),
        );
        expect(outcome.ok).toEqual([]);
        expect(outcome.err).toEqual([-1]);
        expect(spy).toHaveBeenCalledTimes(0);
      } finally {
        spy.mockRestore();
      }
      // The module is still usable: nothing reached the native exit(-1).
      const after = await collectOutcome((ok, err) =>
        ar.loadNFTMarker(MARKER_PINBALL, ok, err),
      );
      expect(after.err).toEqual([]);
      expect(after.ok).toEqual([0]);
    });

    // addNFTMarker called Module._addNFTMarker, which no binding defines.
    it("addNFTMarker works", async () => {
      const outcome = await collectOutcome((ok, err) =>
        api.artoolkitNFT.addNFTMarker(ar.id, MARKER_PINBALL, ok, err),
      );
      expect(outcome.err).toEqual([]);
      expect(outcome.ok).toHaveLength(1);
      expect(typeof outcome.ok[0]).toBe("number");
    });

    if (options.es6) {
      it("has no loadNFTMarkerNew (D18)", () => {
        expect(typeof ar.loadNFTMarkerNew).toBe("undefined");
      });
    }

    it("disposes the controller", () => {
      ar.dispose();
    });
  });
}

/** The loading suite for one global build in `build/`. */
export function legacyLoadingSuite(buildFile: string): void {
  controllerLoadingSuite(buildFile, () => injectLegacyBuild(buildFile));
}
