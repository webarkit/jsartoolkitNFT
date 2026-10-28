import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CAMERA_PARAM,
  MARKER_PINBALL,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  blankFrame,
  loadMarker,
  distBlobUrl,
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
 *
 * **Delivery (#720 D15).** The bundles are not loaded from `/dist/` through the Vite dev
 * server: it rewrites every non-literal `import()` to `__vite__injectQuery(...)`, even under
 * `/* @vite-ignore *\/` (which only silences its warning), and prepends an import of
 * `/@vite/client`, so the served file becomes an ES module that a <script> tag and
 * importScripts() refuse. The pose filter loader's `import(url)` (D14) triggers this.
 * Consumers get the file untransformed (from public/ or a CDN), and so does this test: the
 * globalSetup copies each bundle to `tests/vitest/.dist/<file>.txt`, and the test runs it
 * from a Blob URL. The bundle-URL banner would then see the `blob:` URL, so its URL global
 * is pinned to `/dist/` first (see `loadBundle`): the td bundle still starts its pthread
 * worker from `dist/ARToolkitNFT_td.worker.js`, next to where the bundle is published.
 */

/** The folder the bundles are published in; their sibling files are served from it. */
const DIST_URL = location.origin + "/dist/";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}

/**
 * Runs `dist/<file>` from a Blob URL of its untransformed text, with its bundle-URL global
 * (`urlGlobal`, set by the banner from tools/bundle-url.js) pinned to `DIST_URL`: the banner
 * assigns the global, and a setter-less accessor keeps that assignment from replacing the
 * folder with the Blob URL's.
 */
async function loadBundle(file: string, urlGlobal: string): Promise<void> {
  Object.defineProperty(globalThis, urlGlobal, {
    configurable: true,
    get: () => DIST_URL,
    set: () => {},
  });
  await loadScript(await distBlobUrl(file));
}

describe("dist/ARToolkitNFT.js (the published browser bundle)", () => {
  let ar: any;

  beforeAll(async () => {
    await loadBundle("ARToolkitNFT.js", "__artkBundleUrl");
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
      const reply = new Promise((resolve, reject) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.onerror = (e) =>
          reject(new Error(`worker failed: ${e.message}`));
      });
      // The fixture importScripts() the untransformed bundle from this Blob URL.
      worker.postMessage(await distBlobUrl("ARToolkitNFT.js"));
      const type = await reply;
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
    await loadBundle("ARToolkitNFT_td.js", "__artkTdBundleUrl");
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
