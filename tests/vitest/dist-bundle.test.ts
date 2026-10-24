import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CAMERA_PARAM,
  MARKER_PINBALL,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  blankFrame,
  loadMarker,
} from "./helpers";
import { loadCompositeFrames, isFound, processUntil } from "./frames";

/**
 * Smoke test against the built bundle rather than the sources.
 *
 * `controller.test.ts` imports `src/` — good for coverage and fast feedback, but
 * it cannot catch a stale or broken `dist/`. Browser consumers get
 * `dist/ARToolkitNFT.js`, and that artifact is committed to the repository
 * rather than built during CI, so it can drift from the sources it is supposed
 * to represent — so a packaging regression would pass every source-level test
 * and still break consumers.
 *
 * The bundles are loaded with a script tag rather than an `import`. They are Vite
 * UMD output whose footer copies each export onto the global object, as webpack's
 * nameless UMD did (#741); they are not importable as ES modules. This is also
 * exactly how a `<script src="dist/ARToolkitNFT.js">` consumer receives them.
 *
 * Deliberately thin. Detailed behaviour is covered against `src/`; this only asks
 * whether the shipped artifacts work at all:
 * - the default bundle: one load and one frame;
 * - a classic worker that `importScripts()` the default bundle sees the globals;
 * - the threaded bundle: the only test that starts its pthread worker
 *   (`dist/ARToolkitNFT_td.worker.js`), which the bundle resolves next to itself
 *   while this page sits at the server root, in a different folder (D5).
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

  it("keeps the __esModule marker on the UMD exports", () => {
    // A default import of the UMD bundle must keep resolving as it did with webpack (D8).
    expect((globalThis as any).ARToolkitNFT_exports.__esModule).toBe(true);
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

describe("dist/ARToolkitNFT.js in a classic worker", () => {
  it("puts ARControllerNFT on the worker's global object", async () => {
    const worker = new Worker("/tests/vitest/dist-worker.js");
    try {
      const type = await new Promise((resolve, reject) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.onerror = (e) =>
          reject(new Error(`worker failed: ${e.message}`));
      });
      expect(type).toBe("function");
    } finally {
      worker.terminate();
    }
  });
});

describe("dist/ARToolkitNFT_td.js (the threaded browser bundle)", () => {
  let ar: any;

  beforeAll(async () => {
    // Loaded after the default bundle's tests: its globals replace the default ones.
    await loadScript("/dist/ARToolkitNFT_td.js");
  });

  afterAll(() => {
    ar?.dispose?.();
  });

  it("is cross-origin isolated (threads need SharedArrayBuffer)", () => {
    expect(globalThis.crossOriginIsolated).toBe(true);
  });

  it("puts the public API on the global object", () => {
    expect(typeof (globalThis as any).ARControllerNFT).toBe("function");
    expect(typeof (globalThis as any).ARToolkitNFT).toBe("function");
  });

  it("detects and tracks pinball, which needs the pthread worker", async () => {
    const { both, width, height } = await loadCompositeFrames(0.5);
    const { ARControllerNFT } = globalThis as any;
    ar = await ARControllerNFT.initWithDimensions(
      width,
      height,
      CAMERA_PARAM,
      true,
    );
    const id = await loadMarker(ar, MARKER_PINBALL, 120_000);
    expect(id).toBe(0);
    ar.trackNFTMarkerId(id);
    await processUntil(ar, both, () => isFound(ar, 0), 300);
    expect(isFound(ar, 0)).toBe(true);
  }, 180_000);
});
