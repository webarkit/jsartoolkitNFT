import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import {
  createNFTTrackerWorker,
  __setWorkerFactory,
} from "../../src/tracker/worker/createNFTTrackerWorker";
import {
  WORKER_FILES,
  type BuildName,
} from "../../src/tracker/worker/selectBuild";
import { projectionFor } from "../../src/tracker/geometry";
import {
  CAMERA_PARAM,
  MARKER_PINBALL,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
} from "./helpers";
import { loadCompositeFrames } from "./frames";

/**
 * createNFTTrackerWorker (#720 D13) on the three built worker bundles.
 *
 * **How the workers start (D15).** Vitest's browser mode rewrites `import()` in the JS
 * files it serves (`wrapDynamicImport`, plus an import of `/@vite/client`), which breaks
 * inside a worker: the worker dies before it answers init. So the test does not start
 * `dist/NFTTracker*.worker.js` by URL. The globalSetup (`setup/worker-sources.ts`) copies
 * each bundle to `tests/vitest/.workers/<file>.txt`, which Vite serves untransformed;
 * the test fetches that text and starts the worker from a Blob URL, through the
 * `__setWorkerFactory` seam.
 *
 * `workerBase` still points at `/dist/`: the wrapper resolves the worker file against it
 * (the seam receives that URL), and the td host resolves its pthread file against it and
 * passes it as `mainScriptUrlOrBlob` (D16). That is why td runs from a Blob URL here; the
 * suite is cross-origin isolated (vitest.config.ts), so SharedArrayBuffer exists.
 *
 * The URLs in the config are absolute: a Blob worker's base URL is the `blob:` URL, against
 * which a root-relative path such as `/examples/...` does not resolve.
 */

const ORIGIN = location.origin;
const WORKER_BASE = ORIGIN + "/dist/";
const CONFIG = {
  width: VIDEO_WIDTH,
  height: VIDEO_HEIGHT,
  cameraParam: ORIGIN + CAMERA_PARAM,
};
const PINBALL = ORIGIN + MARKER_PINBALL;
const AVERAGE_FILTER = ORIGIN + "/examples/filters/average-filter.js";

/** Blob URLs of the worker bundles' text, by file name. */
const blobUrls = new Map<string, string>();
/** Every worker the wrapper started, with the URL it asked for. */
const started: { url: string; worker: Worker }[] = [];

function blobUrlOf(file: string): string {
  const url = blobUrls.get(file);
  if (!url) throw new Error(`no worker source for ${file}`);
  return url;
}

/** Starts the bundle the wrapper asked for from its Blob URL (D15), and records it. */
function factory(url: string): Worker {
  const file = url.slice(url.lastIndexOf("/") + 1);
  const worker = new Worker(blobUrlOf(file), { type: "module" });
  started.push({ url, worker });
  return worker;
}

let frames: { pinballOnly: ImageData };
/** A fresh copy per call: process() transfers the frame's buffer (D6). */
const pinballFrame = () =>
  new ImageData(
    new Uint8ClampedArray(frames.pinballOnly.data),
    frames.pinballOnly.width,
    frames.pinballOnly.height,
  );
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Processes the pinball photo until the target's `found` transition comes. */
async function processUntilFound(tracker: any, maxFrames = 150) {
  for (let i = 0; i < maxFrames; i++) {
    const r = await tracker.process(pinballFrame(), i * 33);
    expect(r.skipped).toBeUndefined();
    if (r.transitions.some((x: any) => x.type === "found")) return r;
    // The threaded build detects on a pthread; give it time between frames.
    await tick(20);
  }
  throw new Error(`no found transition after ${maxFrames} frames`);
}

beforeAll(async () => {
  for (const file of Object.values(WORKER_FILES)) {
    const res = await fetch(`/tests/vitest/.workers/${file}.txt`);
    expect(res.ok, `${file}.txt: run npm run build-ts`).toBe(true);
    const text = await res.text();
    blobUrls.set(
      file,
      URL.createObjectURL(new Blob([text], { type: "text/javascript" })),
    );
  }
  __setWorkerFactory(factory);
  frames = await loadCompositeFrames(0.32);
}, 120_000);

afterAll(() => {
  __setWorkerFactory(null);
  for (const url of blobUrls.values()) URL.revokeObjectURL(url);
});

describe.each(["default", "simd", "td"] as BuildName[])(
  "createNFTTrackerWorker (%s)",
  (build) => {
    const owned: any[] = [];
    const create = async (extra: object = {}) => {
      const t = await createNFTTrackerWorker(
        { ...CONFIG, ...extra },
        { build, workerBase: WORKER_BASE },
      );
      owned.push(t);
      return t;
    };

    // After each test, not at the end: each td worker holds its own shared WASM memory
    // and pthreads until it is terminated, and the other suites run alongside this one.
    afterEach(async () => {
      await Promise.all(owned.splice(0).map((t) => t.dispose()));
    });

    it("init, addNFTTargets, process until found", async () => {
      const before = started.length;
      const tracker = await create();
      // The wrapper asked for this build's file, resolved against workerBase (D4).
      expect(started.slice(before).map((s) => s.url)).toEqual([
        WORKER_BASE + WORKER_FILES[build],
      ]);
      expect(tracker.cameraMatrix).toBeInstanceOf(Float64Array);
      expect(tracker.cameraMatrix.length).toBe(16);

      const loads = await tracker.addNFTTargets([PINBALL]);
      expect(loads).toHaveLength(1);
      expect(loads[0].status).toBe("loaded");
      expect(loads[0].info.id).toBe(0);

      const r = await processUntilFound(tracker);
      expect(r.transitions).toEqual([{ type: "found", id: 0 }]);
      expect(r.targets[0].pose).toBeInstanceOf(Float64Array);
    });

    it("transfers the frame", async () => {
      const tracker = await create();
      const frame = pinballFrame();
      const r = await tracker.process(frame, 0);
      expect(r.time).toBe(0);
      // D6: the buffer moved to the worker, it was not copied.
      expect(frame.data.buffer.byteLength).toBe(0);
    });

    it("custom filter module", async () => {
      const tracker = await create({
        filter: { module: AVERAGE_FILTER, options: { weight: 0.5 } },
      });
      expect((await tracker.addNFTTargets([PINBALL]))[0].status).toBe("loaded");
      const r = await processUntilFound(tracker);
      expect(r.targets[0].pose).toBeInstanceOf(Float64Array);
    });
  },
);

describe("createNFTTrackerWorker wrapper (default)", () => {
  const opts = { build: "default" as const, workerBase: WORKER_BASE };
  let tracker: any;
  /** The worker behind `tracker`. */
  let worker: Worker;

  beforeAll(async () => {
    tracker = await createNFTTrackerWorker(CONFIG, opts);
    worker = started[started.length - 1].worker;
    expect((await tracker.addNFTTargets([PINBALL]))[0].status).toBe("loaded");
  }, 120_000);

  afterAll(async () => {
    await tracker?.dispose();
  });

  it("rejects a { create } filter before posting", async () => {
    const before = started.length;
    await expect(
      createNFTTrackerWorker(
        { ...CONFIG, filter: { create: () => ({}) as any } },
        opts,
      ),
    ).rejects.toThrow(TypeError);
    // D3: refused on the page, so no worker was even started.
    expect(started.length).toBe(before);

    const post = vi.spyOn(worker, "postMessage");
    await expect(
      tracker.configure({ filter: { create: () => ({}) as any } }),
    ).rejects.toThrow(TypeError);
    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
  });

  it("skips a frame while one is in flight", async () => {
    // D13: the second call does not queue, it resolves at once.
    const first = tracker.process(pinballFrame(), 1000);
    const kept = pinballFrame();
    const second = await tracker.process(kept, 1001);
    expect(second).toEqual({ skipped: true });
    // A skipped frame is not transferred: the caller still owns it.
    expect(kept.data.byteLength).toBeGreaterThan(0);
    expect((await first).time).toBe(1000);
    const third = await tracker.process(pinballFrame(), 1002);
    expect(third.time).toBe(1002);
    expect(Array.isArray(third.targets)).toBe(true);
  });

  it("configure updates cameraMatrix", async () => {
    const before = new Float64Array(tracker.cameraMatrix);
    await tracker.configure({ near: 1, far: 500 });
    const m = tracker.cameraMatrix;
    // m[10] = -(f + n) / (f - n), m[14] = -2fn / (f - n)
    expect(m[14] / (m[10] - 1)).toBeCloseTo(1, 6);
    expect(m[14] / (m[10] + 1)).toBeCloseTo(500, 3);
    expect(Array.from(m)).not.toEqual(Array.from(before));
  });

  it("errors keep their name", async () => {
    const e = await tracker
      .configure({ filtering: true })
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(TypeError);
    expect((e as Error).message).toMatch(/filter/);
  });

  it("projectionFor runs locally", () => {
    const post = vi.spyOn(worker, "postMessage");
    const viewport = { width: 1280, height: 720, fit: "cover" as const };
    const p = tracker.projectionFor(viewport);
    expect(Array.from(p)).toEqual(
      Array.from(
        projectionFor(
          tracker.cameraMatrix,
          VIDEO_WIDTH,
          VIDEO_HEIGHT,
          viewport,
        ),
      ),
    );
    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
  });

  it("rejects after dispose", async () => {
    const t = await createNFTTrackerWorker(CONFIG, opts);
    await t.dispose();
    await expect(t.process(pinballFrame(), 0)).rejects.toThrow(
      new Error("NFTTracker: disposed"),
    );
    await expect(t.configure({ near: 1 })).rejects.toThrow(
      "NFTTracker: disposed",
    );
    await expect(t.addNFTTargets([PINBALL])).rejects.toThrow(
      "NFTTracker: disposed",
    );
    // A second dispose is a no-op, as on the same thread.
    await t.dispose();
  });

  it("a crashed worker rejects instead of hanging", async () => {
    const crashing = URL.createObjectURL(
      new Blob(["throw new Error('boom');"], { type: "text/javascript" }),
    );
    __setWorkerFactory(() => new Worker(crashing, { type: "module" }));
    try {
      await expect(createNFTTrackerWorker(CONFIG, opts)).rejects.toThrow(
        /NFTTracker worker/,
      );
    } finally {
      __setWorkerFactory(factory);
      URL.revokeObjectURL(crashing);
    }
  });
});
