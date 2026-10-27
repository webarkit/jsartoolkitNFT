import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { VARIANTS } from "./variants";
import {
  CAMERA_PARAM,
  MARKER_PINBALL,
  MARKER_KUVA,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  blankFrame,
  loadMarker,
} from "./helpers";
import { loadCompositeFrames } from "./frames";
import { centerOrigin } from "../../src/tracker/geometry";

/**
 * createNFTTracker (#720), the facade on ARToolkitNFT (D2), on every browser build:
 * creation, configure, addNFTTargets (one source at a time, D10) and dispose; then
 * process(): found/lost (D8), filtering (D3, D18) and pose equality with the controller (D9).
 */

/** The near and far planes encoded in an OpenGL frustum matrix (column-major). */
function planesOf(m: ArrayLike<number>): { near: number; far: number } {
  // m[10] = -(f + n) / (f - n), m[14] = -2fn / (f - n)
  return { near: m[14] / (m[10] - 1), far: m[14] / (m[10] + 1) };
}

const MISSING = "/examples/DataNFT/missing";
const PAGES_MAX = 20;

const create = async (
  variant: (typeof VARIANTS)[number],
  extra: object = {},
) => {
  const { createNFTTracker } = await variant.load();
  return createNFTTracker({
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    cameraParam: CAMERA_PARAM,
    ...extra,
  });
};

describe.each(VARIANTS)("NFTTracker ($name)", (variant) => {
  let tracker: any;

  beforeAll(async () => {
    tracker = await create(variant);
  });

  afterAll(() => {
    tracker?.dispose();
  });

  it("creates a tracker with a cameraMatrix consistent with near/far", () => {
    expect(tracker.cameraMatrix).toBeInstanceOf(Float64Array);
    expect(tracker.cameraMatrix.length).toBe(16);
    const planes = planesOf(tracker.cameraMatrix);
    expect(planes.near).toBeCloseTo(0.1, 6);
    expect(planes.far).toBeCloseTo(1000, 2);
  });

  it("loads per source", async () => {
    const res = await tracker.addNFTTargets([MARKER_PINBALL, MISSING]);
    expect(res).toHaveLength(2);

    expect(res[0].status).toBe("loaded");
    const info = res[0].info;
    expect(info.id).toBe(0);
    expect(info.url).toBe(MARKER_PINBALL);
    expect(info.widthPx).toBeGreaterThan(0);
    expect(info.dpi).toBeGreaterThan(0);
    expect(info.widthMm).toBe((info.widthPx / info.dpi) * 25.4);
    expect(info.origin).toBe("corner");

    expect(res[1]).toEqual({
      status: "error",
      url: MISSING,
      reason: "network",
      message: expect.any(String),
    });
    expect(res[1].message.length).toBeGreaterThan(0);

    // No result carries an undefined id: an error has no id at all.
    for (const r of res) {
      if (r.status === "loaded") expect(r.info.id).toEqual(expect.any(Number));
      else expect("id" in r).toBe(false);
    }
  }, 120_000);

  it("ids are stable and never reused", async () => {
    const res = await tracker.addNFTTargets([MARKER_KUVA]);
    expect(res[0].status).toBe("loaded");
    expect(res[0].info.id).toBe(1);
  }, 120_000);

  it("configure is live", async () => {
    const before = planesOf(tracker.cameraMatrix);
    await tracker.configure({ near: 1, far: 500 });
    const after = planesOf(tracker.cameraMatrix);
    expect(before.near).toBeCloseTo(0.1, 6);
    expect(after.near).toBeCloseTo(1, 6);
    expect(after.far).toBeCloseTo(500, 2);
    await tracker.configure({ near: 0.1, far: 1000 });
  });

  it("configure rejects filtering", async () => {
    const p = tracker.configure({ filtering: true } as any);
    await expect(p).rejects.toThrow(TypeError);
    await expect(tracker.configure({ filtering: true } as any)).rejects.toThrow(
      /filter/,
    );
  });

  it("configure rejects an unknown key", async () => {
    await expect(tracker.configure({ nope: 1 } as any)).rejects.toThrow(
      TypeError,
    );
  });

  it("createNFTTracker rejects filtering in the config", async () => {
    await expect(create(variant, { filtering: true })).rejects.toThrow(
      TypeError,
    );
    await expect(create(variant, { filtering: true })).rejects.toThrow(
      /filter/,
    );
  });

  it("createNFTTracker rejects a bad size", async () => {
    await expect(create(variant, { width: 0 })).rejects.toThrow(RangeError);
    await expect(create(variant, { height: 480.5 })).rejects.toThrow(
      RangeError,
    );
  });

  it("logLevel above 4 goes through setLogLevel", async () => {
    // The core's configure() refuses a level above 4 (D18); the facade routes it to setLogLevel.
    await expect(tracker.configure({ logLevel: 5 })).resolves.toBeUndefined();
    await tracker.configure({ logLevel: 1 });
  });

  it("dispose is idempotent and later calls throw", async () => {
    // The threaded build skips the native teardown() on purpose: it never returns on the
    // main thread (#695), so dispose() only drops the JS side there.
    const { ARToolkitNFT } = await variant.load();
    expect(ARToolkitNFT.teardownBlocksMainThread).toBe(
      variant.name === "wasm-threaded",
    );
    const t = await create(variant);
    t.dispose();
    expect(() => t.dispose()).not.toThrow();
    const disposed = "NFTTracker: disposed";
    expect(() =>
      t.process({ data: new Uint8Array(0), width: 0, height: 0 }, 0),
    ).toThrow(disposed);
    await expect(t.configure({ near: 1 })).rejects.toThrow(disposed);
    await expect(t.addNFTTargets([MARKER_PINBALL])).rejects.toThrow(disposed);
    expect(() => t.projectionFor({ width: 640, height: 480 })).toThrow(
      disposed,
    );
    expect(() => t.cameraMatrix).toThrow(disposed);
  });

  // The threaded build never calls teardown(), so this is about the other builds; the
  // behaviour is the facade's JS, so one build is enough.
  it.runIf(variant.name === "wasm")(
    "a throwing teardown still disposes, once",
    async () => {
      const t: any = await create(variant);
      const toolkit = t.toolkit;
      const teardown = vi
        .spyOn(toolkit, "teardown")
        .mockImplementationOnce(() => {
          throw new Error("teardown failed");
        });
      expect(() => t.dispose()).toThrow("teardown failed");
      // Disposed anyway: a second dispose() does not run teardown() again.
      expect(() => t.dispose()).not.toThrow();
      expect(teardown).toHaveBeenCalledTimes(1);
      expect(() => t.cameraMatrix).toThrow("NFTTracker: disposed");
      teardown.mockRestore();
      // The stub replaced the real teardown: free the core now.
      toolkit.teardown();
    },
  );

  // KPM rebuilds its matcher once per source (D10), so 20 loads are slow: wasm only.
  it.runIf(variant.name === "wasm")(
    "reports capacity past 20",
    async () => {
      const t = await create(variant);
      try {
        const started = performance.now();
        const res = await t.addNFTTargets(
          Array(PAGES_MAX + 1).fill(MARKER_PINBALL),
        );
        console.log(
          `[tracker] 21 sources loaded one at a time in ${Math.round(performance.now() - started)} ms`,
        );
        for (let i = 0; i < PAGES_MAX; i++) {
          expect(res[i].status).toBe("loaded");
          expect(res[i].info.id).toBe(i);
        }
        expect(res[PAGES_MAX]).toMatchObject({
          status: "error",
          reason: "capacity",
        });
      } finally {
        t.dispose();
      }
    },
    600_000,
  );
});

/** The frame step the process() tests use, in ms (about 30 fps). */
const STEP = 33;

/** Yields between frames so the threaded build's detection worker can run (see processUntil). */
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Comparing the poses of two cores fed the same frames needs the same timing on both:
 *
 * - **The AR2 seed.** AR2's template selection seeds `rand()` with `time(NULL)`
 *   (WebARKitLib `lib/SRC/AR2/selectTemplate.c`), which Emscripten reads from `Date.now()`.
 *   Two cores that first track in different wall-clock seconds pick different templates,
 *   and their poses differ by up to a few millimetres. `pinWallClock` pins `Date.now()`
 *   so that both seed alike; the core's detection clock is `performance.now()`, untouched.
 * - **The detection pass (threaded build).** KPM runs on a worker per core, and its
 *   result is collected on the first frame after it finishes. While a tracker under
 *   comparison has not found the target, `SETTLE_MS` between frames lets every worker
 *   finish, so all of them start tracking on the same frame.
 *
 * With both, the poses are equal to 1e-9 on every build. Without either, they are not,
 * for reasons outside the facade.
 */
const SETTLE_MS = 1000;
function pinWallClock() {
  return vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
}

/** A caller-side clock (D7): each call returns the next timestamp. */
function clock(start = 0) {
  let t = start - STEP;
  return () => (t += STEP);
}

/**
 * Feeds `frame` to every tracker, one timestamp per step, until `done(step)` holds for
 * that step's results. Returns every step's results, one array per tracker. With
 * `settle`, it waits SETTLE_MS after a step where some tracker has not found the target.
 */
async function feedUntil(
  trackers: any[],
  frame: ImageData,
  next: () => number,
  done: (step: any[]) => boolean,
  maxFrames = 120,
  settle = false,
): Promise<any[][]> {
  const all: any[][] = trackers.map(() => []);
  for (let i = 0; i < maxFrames; i++) {
    const t = next();
    const step = trackers.map((tr) => tr.process(frame, t));
    step.forEach((r, k) => all[k].push(r));
    if (done(step)) return all;
    await tick(settle && !allFound(step) ? SETTLE_MS : 5);
  }
  throw new Error(`condition not met after ${maxFrames} frames`);
}

/** Feeds exactly `n` frames. */
function feedN(
  trackers: any[],
  frame: ImageData,
  next: () => number,
  n: number,
  settle = false,
) {
  let left = n;
  return feedUntil(trackers, frame, next, () => --left === 0, n, settle);
}

function allFound(step: any[]): boolean {
  return step.every((r) => r.targets[0].found);
}
const transitionsOf = (results: any[]) => results.flatMap((r) => r.transitions);
const hasEdge = (r: any, type: "found" | "lost") =>
  r.transitions.some((x: any) => x.type === type);

function expectPosesEqual(a: ArrayLike<number>, b: ArrayLike<number>, eps = 1e-9) {
  expect(a.length).toBe(16);
  expect(b.length).toBe(16);
  for (let i = 0; i < 16; i++) expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(eps);
}

function maxDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let d = 0;
  for (let i = 0; i < 16; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
  return d;
}

describe.each(VARIANTS)("NFTTracker.process ($name)", (variant) => {
  let frames: { pinballOnly: ImageData; width: number; height: number };
  let blank: ImageData;
  let tracker: any;
  const owned: any[] = [];

  /** A tracker with pinball loaded; the suite disposes it. */
  const withPinball = async (extra: object = {}, origin?: "corner" | "center") => {
    const t = await create(variant, extra);
    owned.push(t);
    const res = await t.addNFTTargets([MARKER_PINBALL], origin ? { origin } : undefined);
    expect(res[0].status).toBe("loaded");
    return { t, info: res[0].info };
  };

  beforeAll(async () => {
    frames = await loadCompositeFrames(0.32);
    expect([frames.width, frames.height]).toEqual([VIDEO_WIDTH, VIDEO_HEIGHT]);
    blank = blankFrame();
    ({ t: tracker } = await withPinball());
  }, 120_000);

  afterAll(() => {
    for (const t of owned) t.dispose();
  });

  it("process finds the target and fires found once", async () => {
    const next = clock();
    const [found] = await feedUntil([tracker], frames.pinballOnly, next, allFound);
    const [after] = await feedN([tracker], frames.pinballOnly, next, 5);
    const results = [...found, ...after];

    expect(transitionsOf(results)).toEqual([{ type: "found", id: 0 }]);
    // The edge comes on the first tracked frame (D8).
    expect(found[found.length - 1].transitions).toEqual([{ type: "found", id: 0 }]);
    results.forEach((r, i) => {
      expect(r.time).toBe(i * STEP);
      expect(r.processMs).toBeGreaterThanOrEqual(0);
    });
    const target = found[found.length - 1].targets[0];
    expect(target.id).toBe(0);
    expect(target.found).toBe(true);
    expect(target.pose).toBeInstanceOf(Float64Array);
    expect(target.pose.length).toBe(16);
    expect(typeof target.error).toBe("number");
  });

  /** Tracks, then feeds `n` blank frames; returns their results and the last tracked time. */
  async function hide(t: any, next: () => number, n: number) {
    const [found] = await feedUntil([t], frames.pinballOnly, next, allFound);
    const lastTracked = found[found.length - 1].time;
    const [hidden] = await feedN([t], blank, next, n);
    return { hidden, lastTracked };
  }

  function expectOneLostAfter(hidden: any[], lastTracked: number, timeout: number) {
    // D8: within the grace window `targets` is this frame's raw tracking; only the
    // transitions are debounced.
    expect(hidden[0].targets[0].found).toBe(false);
    expect(hidden[0].targets[0].pose).toBeNull();
    expect(hidden[0].targets[0].error).toBeNull();
    expect(hidden.every((r) => !r.targets[0].found)).toBe(true);
    expect(transitionsOf(hidden)).toEqual([{ type: "lost", id: 0 }]);
    const at = hidden.findIndex((r) => r.transitions.length > 0);
    expect(at).toBe(hidden.findIndex((r) => r.time - lastTracked > timeout));
  }

  it("hiding the target gives exactly one lost after lostTimeout", async () => {
    const { hidden, lastTracked } = await hide(tracker, clock(10_000), 10);
    expectOneLostAfter(hidden, lastTracked, 200);
    // 33 ms steps: the 7th blank frame (231 ms) is the first past 200 ms.
    expect(hidden.findIndex((r) => r.transitions.length > 0)).toBe(6);
  });

  it("configure({ lostTimeout }) is live", async () => {
    await tracker.configure({ lostTimeout: 50 });
    try {
      const { hidden, lastTracked } = await hide(tracker, clock(20_000), 5);
      expectOneLostAfter(hidden, lastTracked, 50);
      // The 2nd blank frame (66 ms) is the first past 50 ms.
      expect(hidden.findIndex((r) => r.transitions.length > 0)).toBe(1);
    } finally {
      await tracker.configure({ lostTimeout: 200 });
    }
  });

  it("rejects a wrongly sized frame and recovers", () => {
    expect(() => tracker.process(blankFrame(641, 480), 30_000)).toThrow(RangeError);
    const r = tracker.process(blank, 30_033);
    expect(r.time).toBe(30_033);
    expect(r.targets).toHaveLength(1);
  });

  it("poses equal the controller's matrixGL_RH", async () => {
    // Defaults on both sides: the tracker's filter is 'native' (D18) and the controller's
    // core filters by default. The controller takes the WASM luma path, as the tracker
    // does (D9b), and the same detection defaults: same core, same defaults.
    const { ARControllerNFT } = await variant.load();
    const ctrl = await ARControllerNFT.initWithDimensions(
      frames.width,
      frames.height,
      CAMERA_PARAM,
      true,
    );
    expect(await loadMarker(ctrl, MARKER_PINBALL)).toBe(0);
    const { t } = await withPinball();

    let ctrlPose: Float64Array | null = null;
    ctrl.addEventListener("getNFTMarker", (e: any) => {
      if (e.data.index === 0) ctrlPose = e.data.matrixGL_RH;
    });

    const next = clock();
    let compared = 0;
    const wall = pinWallClock();
    try {
      for (let i = 0; i < 30; i++) {
        const time = next();
        ctrlPose = null;
        ctrl.process(frames.pinballOnly);
        const target = t.process(frames.pinballOnly, time).targets[0];
        // The same found/lost on both sides (anti-goal), then the same pose.
        expect(target.found).toBe(ctrlPose !== null);
        if (ctrlPose && target.found) {
          expectPosesEqual(target.pose, ctrlPose);
          compared++;
        }
        await tick(target.found ? 5 : SETTLE_MS);
      }
    } finally {
      wall.mockRestore();
    }
    console.log(`[tracker] ${variant.name}: ${compared} of 30 frames compared with the controller`);
    expect(compared).toBeGreaterThan(20);
  }, 120_000);

  it("origin center shifts the pose", async () => {
    const { t: corner } = await withPinball();
    const { t: center, info } = await withPinball({}, "center");
    expect(info.origin).toBe("center");
    const next = clock();
    const wall = pinWallClock();
    let c1: any[], m1: any[], c2: any[], m2: any[];
    try {
      [c1, m1] = await feedUntil([corner, center], frames.pinballOnly, next, allFound, 120, true);
      [c2, m2] = await feedN([corner, center], frames.pinballOnly, next, 5);
    } finally {
      wall.mockRestore();
    }
    const cornerRes = [...c1, ...c2];
    const centerRes = [...m1, ...m2];
    let compared = 0;
    cornerRes.forEach((c, i) => {
      const a = c.targets[0];
      const b = centerRes[i].targets[0];
      if (a.found && b.found) {
        expectPosesEqual(b.pose, centerOrigin(a.pose, info));
        expect(maxDiff(a.pose, b.pose)).toBeGreaterThan(1);
        compared++;
      }
    });
    expect(compared).toBeGreaterThan(0);
  }, 120_000);

  describe("JS filters", () => {
    let oneEuro: any;
    let raw: any;

    it("the default filter is native", async () => {
      const { ARToolkitNFT } = await variant.load();
      const spy = vi.spyOn(ARToolkitNFT.prototype, "configure");
      try {
        await withPinball();
        const flags = spy.mock.calls.map((c: any[]) => c[0]?.filtering);
        expect(flags).toContain(true);
        expect(flags).not.toContain(false);
      } finally {
        spy.mockRestore();
      }
    }, 120_000);

    it("a JS filter turns native filtering off and resets on lost", async () => {
      const { ARToolkitNFT } = await variant.load();
      const spy = vi.spyOn(ARToolkitNFT.prototype, "configure");
      try {
        ({ t: oneEuro } = await withPinball({ filter: { type: "oneEuro" } }));
        const flags = spy.mock.calls.map((c: any[]) => c[0]?.filtering);
        expect(flags).toContain(false);
        expect(flags).not.toContain(true);
      } finally {
        spy.mockRestore();
      }
      // The raw pose, for the same frames (D18: 'none' turns native filtering off too).
      ({ t: raw } = await withPinball({ filter: "none" }));

      const next = clock();
      const wall = pinWallClock();
      try {
        await feedUntil([oneEuro, raw], frames.pinballOnly, next, allFound, 120, true);
        const [o1, r1] = await feedN([oneEuro, raw], frames.pinballOnly, next, 10);
        // The filter is on: the filtered pose leaves the raw one.
        expect(
          o1.some((o, i) => maxDiff(o.targets[0].pose, r1[i].targets[0].pose) > 0),
        ).toBe(true);

        const lost = new Set<number>();
        await feedUntil([oneEuro, raw], blank, next, (step) => {
          step.forEach((r, k) => hasEdge(r, "lost") && lost.add(k));
          return lost.size === 2;
        });

        const [o2, r2] = await feedUntil(
          [oneEuro, raw],
          frames.pinballOnly,
          next,
          (step) => hasEdge(step[0], "found"),
          120,
          true,
        );
        const a = o2[o2.length - 1].targets[0];
        const b = r2[r2.length - 1].targets[0];
        expect(b.found).toBe(true);
        // Reset on lost (D3): the first sample after a reset passes through unchanged.
        expect(Array.from(a.pose)).toEqual(Array.from(b.pose));
      } finally {
        wall.mockRestore();
      }
    }, 120_000);

    // The checks below are the facade's JS, the same on every build: wasm only.
    it.runIf(variant.name === "wasm")(
      "a filter that returns the wrong number of values throws a TypeError",
      async () => {
        const { t } = await withPinball({
          filter: {
            create: () => ({
              filter: (_t: number, p: Float64Array) => p.subarray(0, 15),
              reset() {},
            }),
          },
        });
        const next = clock(100_000);
        let error: unknown = null;
        for (let i = 0; i < 120 && error === null; i++) {
          try {
            t.process(frames.pinballOnly, next());
          } catch (e) {
            error = e;
          }
          await tick(5);
        }
        expect(error).toBeInstanceOf(TypeError);
        expect((error as Error).message).toMatch(/15/);
      },
      120_000,
    );

    it.runIf(variant.name === "wasm")(
      "a kept pose is not changed by the next frame",
      async () => {
        // A filter that reuses one output array, as a filter avoiding allocations may.
        const { t } = await withPinball({
          filter: {
            create: () => {
              const out = new Float64Array(16);
              return {
                filter: (time: number, p: Float64Array) => {
                  out.set(p);
                  out[15] = time;
                  return out;
                },
                reset() {},
              };
            },
          },
        });
        const next = clock(200_000);
        const [found] = await feedUntil([t], frames.pinballOnly, next, allFound);
        const kept = found[found.length - 1].targets[0].pose as Float64Array;
        const keptTime = kept[15];
        const [after] = await feedN([t], frames.pinballOnly, next, 1);
        expect(after[0].targets[0].found).toBe(true);
        expect(after[0].targets[0].pose[15]).not.toBe(keptTime);
        expect(kept[15]).toBe(keptTime);
      },
      120_000,
    );

    it("keeps the old filter when a new module fails", async () => {
      const next = clock(50_000);
      await feedUntil([oneEuro, raw], frames.pinballOnly, next, allFound, 120, true);
      await feedN([oneEuro, raw], frames.pinballOnly, next, 10);
      const missing = new URL("/examples/filters/missing-filter.js", location.origin).href;
      await expect(oneEuro.configure({ filter: { module: missing } })).rejects.toThrow(
        /missing-filter/,
      );
      const [[o], [r]] = await feedN([oneEuro, raw], frames.pinballOnly, next, 1);
      expect(o.targets[0].found).toBe(true);
      expect(r.targets[0].found).toBe(true);
      expect(maxDiff(o.targets[0].pose, r.targets[0].pose)).toBeGreaterThan(0);
    }, 120_000);
  });
});
