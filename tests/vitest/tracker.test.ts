import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { VARIANTS } from "./variants";
import {
  CAMERA_PARAM,
  MARKER_PINBALL,
  MARKER_KUVA,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
} from "./helpers";

/**
 * createNFTTracker (#720), the facade on ARToolkitNFT (D2), on every browser build:
 * creation, configure, addNFTTargets (one source at a time, D10) and dispose.
 * process() and the pose-equality tests are in the next part of this file (Task 6).
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
