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
  distBlobUrl,
} from "./helpers";
import { loadCompositeFrames } from "./frames";

/**
 * createNFTTrackerWorker (#720 D13) on the three built worker bundles.
 *
 * **How the workers start (D15).** The Vite dev server behind Vitest's browser mode
 * rewrites every non-literal `import()` in the JS files it serves to
 * `__vite__injectQuery(...)`, even under `/* @vite-ignore *\/`, and prepends an import of
 * `/@vite/client`. That breaks inside a worker: it dies before it answers init. So the test does not start
 * `dist/NFTTracker*.worker.js` by URL. The globalSetup (`setup/worker-sources.ts`) copies
 * each bundle to `tests/vitest/.dist/<file>.txt`, which Vite serves untransformed;
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

/** A root-relative path as a URL relative to the test page, e.g. "../examples/...". */
function pageRelative(path: string): string {
  const dir = new URL(".", document.baseURI).pathname;
  const depth = dir.split("/").filter(Boolean).length;
  return "../".repeat(depth) + path.replace(/^\//, "");
}

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
    blobUrls.set(file, await distBlobUrl(file));
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

  it("resolves relative URLs against the page", async () => {
    // The worker would resolve them against its own (here, Blob) URL; the wrapper resolves
    // them against the page first, so they mean what they mean on the same thread.
    const camera = pageRelative(CAMERA_PARAM);
    const pinball = pageRelative(MARKER_PINBALL);
    const filter = pageRelative("/examples/filters/average-filter.js");
    expect(camera.startsWith("/")).toBe(false);
    const t = await createNFTTrackerWorker(
      {
        ...CONFIG,
        cameraParam: camera,
        filter: { module: filter, options: { weight: 0.5 } },
      },
      opts,
    );
    try {
      const loads = await t.addNFTTargets([pinball]);
      expect(loads[0].status).toBe("loaded");
      // Reported as passed, as on the same thread.
      expect((loads[0] as any).info.url).toBe(pinball);
      await t.configure({
        filter: { module: filter, options: { weight: 0.25 } },
      });
      const r = await processUntilFound(t);
      expect(r.targets[0].pose).toBeInstanceOf(Float64Array);
    } finally {
      await t.dispose();
    }
  });

  it("dispose does not hang on a worker that stops answering", async () => {
    // D13 (amended): a fake worker that answers init and nothing else, as the threaded
    // worker did once under load. dispose() waits a bounded time, then terminates.
    let fake: any;
    __setWorkerFactory(() => {
      fake = {
        onmessage: null,
        onerror: null,
        terminate: vi.fn(),
        postMessage: vi.fn((msg: any) => {
          if (msg.type !== "init") return;
          Promise.resolve().then(() =>
            fake.onmessage({
              data: {
                v: 1,
                id: msg.id,
                type: "ok",
                cameraMatrix: new Float64Array(16),
              },
            }),
          );
        }),
      };
      return fake;
    });
    try {
      const t = await createNFTTrackerWorker(CONFIG, opts);
      vi.useFakeTimers();
      const pending = t.process(
        { data: new Uint8ClampedArray(4), width: 1, height: 1 },
        0,
      );
      const rejected = expect(pending).rejects.toThrow("NFTTracker: disposed");
      let resolved = false;
      const disposing = t.dispose().then(() => (resolved = true));
      await vi.advanceTimersByTimeAsync(1999);
      // Still waiting for the answer.
      expect(resolved).toBe(false);
      expect(fake.terminate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await disposing;
      expect(fake.terminate).toHaveBeenCalledTimes(1);
      await rejected;
    } finally {
      vi.useRealTimers();
      __setWorkerFactory(factory);
    }
  });

  /**
   * A fake worker (no WASM) through the factory seam: it answers init, and the request
   * types in `answers`. Its cameraMatrix is non-zero so projectionFor has something to scale.
   */
  async function withFake(
    answers: string[],
    run: (t: any, fake: any) => Promise<void>,
    config: any = CONFIG,
  ): Promise<void> {
    let fake: any;
    __setWorkerFactory(() => {
      fake = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        terminate: vi.fn(),
        postMessage: vi.fn((msg: any) => {
          if (msg.type !== "init" && !answers.includes(msg.type)) return;
          Promise.resolve().then(() =>
            fake.onmessage({
              data: {
                v: 1,
                id: msg.id,
                type: "ok",
                value:
                  msg.type === "process"
                    ? { time: msg.timestampMs }
                    : undefined,
                cameraMatrix: Float64Array.from(
                  { length: 16 },
                  (_, i) => i + 1,
                ),
              },
            }),
          );
        }),
      };
      return fake;
    });
    try {
      const t = await createNFTTrackerWorker(config, opts);
      await run(t, fake);
    } finally {
      vi.useRealTimers();
      __setWorkerFactory(factory);
    }
  }

  it("dispose resolves when the worker crashes during the wait", async () => {
    await withFake([], async (t, fake) => {
      const disposing = t.dispose();
      fake.onerror({ preventDefault() {}, message: "boom" });
      await expect(disposing).resolves.toBeUndefined();
      expect(fake.terminate).toHaveBeenCalled();
    });
  });

  it("a second dispose returns the same promise, settled after terminate", async () => {
    await withFake(["dispose"], async (t, fake) => {
      const first = t.dispose();
      const second = t.dispose();
      expect(second).toBe(first);
      // A caller awaiting either may create a new tracker at once: the old worker
      // must already be terminated by then (D13).
      const terminatedAtSettle = second.then(
        () => fake.terminate.mock.calls.length,
      );
      expect(await terminatedAtSettle).toBe(1);
      await t.dispose();
      expect(fake.terminate).toHaveBeenCalledTimes(1);
    });
  });

  it("process never throws synchronously", async () => {
    await withFake(["process"], async (t) => {
      let p: Promise<unknown> | undefined;
      expect(() => {
        p = t.process(null, 0);
      }).not.toThrow();
      await expect(p).rejects.toThrow(TypeError);
      // The refused frame did not leave a process() in flight.
      expect(
        await t.process(
          { data: new Uint8ClampedArray(4), width: 1, height: 1 },
          7,
        ),
      ).toEqual({ time: 7 });
    });
  });

  it("a reply that cannot be deserialised rejects instead of hanging", async () => {
    await withFake([], async (t, fake) => {
      const pending = t.addNFTTargets([PINBALL]);
      fake.onmessageerror(new MessageEvent("messageerror"));
      await expect(pending).rejects.toThrow(/could not be deserialised/);
      await expect(t.configure({ near: 1 })).rejects.toThrow(
        /could not be deserialised/,
      );
    });
  });

  it("projectionFor keeps the size given at creation", async () => {
    const config = { ...CONFIG };
    await withFake(
      [],
      async (t) => {
        const viewport = { width: 1280, height: 720 };
        const before = Array.from(t.projectionFor(viewport));
        config.width = 1;
        config.height = 1000;
        expect(Array.from(t.projectionFor(viewport))).toEqual(before);
      },
      config,
    );
  });

  it("a view of part of a buffer is copied, not transferred", async () => {
    const size = VIDEO_WIDTH * VIDEO_HEIGHT * 4;
    const pixels = pinballFrame().data;
    // A view at offset 0 of a bigger buffer: transferring it would detach the rest.
    const big = new Uint8ClampedArray(size + 64);
    big.set(pixels);
    const head = big.subarray(0, size);
    const r1 = await tracker.process(
      { data: head, width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
      3000,
    );
    expect(r1.time).toBe(3000);
    expect(big.buffer.byteLength).toBe(size + 64);
    expect(head[0]).toBe(pixels[0]);
    // A view at an offset.
    const tail = new Uint8ClampedArray(size + 64);
    tail.set(pixels, 64);
    const r2 = await tracker.process(
      { data: tail.subarray(64), width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
      3001,
    );
    expect(r2.time).toBe(3001);
    expect(tail.buffer.byteLength).toBe(size + 64);
    // A view of WebAssembly memory, whose buffer cannot be transferred at all.
    const memory = new WebAssembly.Memory({
      initial: Math.ceil(size / 65536) + 1,
    });
    const wasmView = new Uint8ClampedArray(memory.buffer, 0, size);
    wasmView.set(pixels);
    const r3 = await tracker.process(
      { data: wasmView, width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
      3002,
    );
    expect(r3.time).toBe(3002);
    expect(memory.buffer.byteLength).toBeGreaterThan(0);
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
