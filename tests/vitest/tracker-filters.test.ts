import { describe, it, expect } from "vitest";
import { OneEuroFilter } from "@webarkit/oneeurofilter-ts";
import {
  createPoseFilter,
  ONE_EURO_DEFAULTS,
} from "../../src/tracker/filters/oneEuro";
import {
  loadFilter,
  usesNativeFiltering,
} from "../../src/tracker/filters/loadFilter";
import type { PoseFilter } from "../../src/tracker/filters/PoseFilter";
import { expSO3 } from "../../src/tracker/filters/so3";

const abs = (p: string) => new URL(p, location.origin).href;

type Vec3 = [number, number, number];
const Z: Vec3 = [0, 0, 1];

/**
 * A rigid pose in the facade's layout (column-major GL: R columns at 0–2, 4–6, 8–10,
 * translation at 12–14): rotation `angle` about `axis`, translation `t`. Poses must be rigid
 * since #766: the filter works on the rotation, so a matrix filled with one value is not a
 * valid input any more.
 */
function rigid(axis: Vec3, angle: number, t: Vec3 = [0, 0, 0]): Float64Array {
  const n = Math.hypot(axis[0], axis[1], axis[2]);
  const r = expSO3(
    Float64Array.of(
      (axis[0] / n) * angle,
      (axis[1] / n) * angle,
      (axis[2] / n) * angle,
    ),
    new Float64Array(9),
  );
  const p = new Float64Array(16);
  for (let c = 0; c < 3; c++)
    for (let row = 0; row < 3; row++) p[c * 4 + row] = r[c * 3 + row];
  p[12] = t[0];
  p[13] = t[1];
  p[14] = t[2];
  p[15] = 1;
  return p;
}

/** Column norms, column dot products and det of a pose's R, against 1, 0 and 1. */
function rigidityError(p: Float64Array): number {
  const at = (row: number, c: number) => p[c * 4 + row];
  let err = 0;
  for (let a = 0; a < 3; a++) {
    for (let b = a; b < 3; b++) {
      let dot = 0;
      for (let row = 0; row < 3; row++) dot += at(row, a) * at(row, b);
      err = Math.max(err, Math.abs(dot - (a === b ? 1 : 0)));
    }
  }
  const det =
    at(0, 0) * (at(1, 1) * at(2, 2) - at(2, 1) * at(1, 2)) -
    at(0, 1) * (at(1, 0) * at(2, 2) - at(2, 0) * at(1, 2)) +
    at(0, 2) * (at(1, 0) * at(2, 1) - at(2, 0) * at(1, 1));
  return Math.max(err, Math.abs(det - 1));
}

const maxDiff = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
  return d;
};

/** A seeded generator, so a failure reproduces. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("OneEuro", () => {
  it("the first sample passes through", () => {
    const f = createPoseFilter({ type: "oneEuro" });
    const x = rigid([1, 2, 3], 0.7, [10, -20, -300]);
    expect(Array.from(f.filter(0, x))).toEqual(Array.from(x));
  });
  it("a constant input stays constant", () => {
    const f = createPoseFilter({ type: "oneEuro" });
    const x = rigid([1, 2, 3], 0.7, [10, -20, -300]);
    for (let i = 0; i < 10; i++) {
      expect(maxDiff(f.filter(i * 33, x), x)).toBeLessThan(1e-12);
    }
  });
  it("a step is smoothed", () => {
    const f = createPoseFilter({ type: "oneEuro" });
    for (let i = 0; i < 5; i++) f.filter(i * 33, rigid(Z, 0));
    const y = f.filter(5 * 33, rigid(Z, 0.5, [0, 0, 10]));
    // A rotation about z: column 0 is (cos θ, sin θ, 0).
    const angle = Math.atan2(y[1], y[0]);
    expect(angle).toBeGreaterThan(0);
    expect(angle).toBeLessThan(0.5);
    expect(y[14]).toBeGreaterThan(0);
    expect(y[14]).toBeLessThan(10);
  });
  it("the translation matches the package", () => {
    const f = createPoseFilter({ type: "oneEuro" });
    const ref = new OneEuroFilter(
      ONE_EURO_DEFAULTS.minCutOff,
      ONE_EURO_DEFAULTS.beta,
    );
    for (let i = 0; i < 12; i++) {
      const t: Vec3 = [Math.sin(i) * 5 + i, i, -2 * i];
      const a = f.filter(i * 33, rigid([1, 2, 3], 0.1 * i, t));
      const b = ref.filter(i * 33, Float64Array.from(t));
      expect(maxDiff(a.subarray(12, 15), b)).toBeLessThan(1e-12);
    }
  });
  it("a rotation about one axis is filtered as its angle", () => {
    // About a coordinate axis on purpose: ω = log(R̂ᵀR) is then (0, 0, θ − θ̂), one
    // non-zero component, so the 3-component filter and a 1-D filter of the angle agree.
    // About a general axis they do not: each component has its own α.
    const f = createPoseFilter({ type: "oneEuro" });
    const ref = new OneEuroFilter(
      ONE_EURO_DEFAULTS.minCutOff,
      ONE_EURO_DEFAULTS.beta,
    );
    const angle = (i: number) => 0.3 * Math.sin(i / 3);
    let est = angle(0);
    f.filter(0, rigid(Z, est));
    for (let i = 1; i < 40; i++) {
      est += ref.filterStep(33, Float64Array.of(angle(i) - est)).step[0];
      const y = f.filter(i * 33, rigid(Z, angle(i)));
      expect(maxDiff(y, rigid(Z, est))).toBeLessThan(1e-9);
    }
  });
  it("filtered poses stay rigid", () => {
    // #766: smoothing the 9 entries of R one by one gave column norms of 0.989 to 1.0007
    // on a hand-held camera.
    const f = createPoseFilter({ type: "oneEuro" });
    const rand = rng(766);
    const noise = (s: number) => (rand() - 0.5) * 2 * s;
    let worst = 0;
    for (let i = 0; i < 5000; i++) {
      const axis: Vec3 = [
        Math.sin(i / 200),
        Math.cos(i / 300),
        0.5 + noise(0.05),
      ];
      const y = f.filter(
        i * 33,
        rigid(axis, 0.8 * Math.sin(i / 50) + noise(0.01), [
          100 * Math.sin(i / 40) + noise(0.5),
          50 * Math.cos(i / 30) + noise(0.5),
          -300 + noise(0.5),
        ]),
      );
      worst = Math.max(worst, rigidityError(y));
    }
    expect(worst).toBeLessThan(1e-9);
  });
  it("a time that does not increase returns the previous output", () => {
    const f = createPoseFilter({ type: "oneEuro" });
    f.filter(0, rigid(Z, 0));
    const second = Array.from(f.filter(33, rigid(Z, 0.4, [5, 0, 0])));
    expect(Array.from(f.filter(33, rigid(Z, 1, [50, 0, 0])))).toEqual(second);
    expect(Array.from(f.filter(10, rigid(Z, -1, [-50, 0, 0])))).toEqual(second);
  });
  it("non-rotation input stays finite", () => {
    const f = createPoseFilter({ type: "oneEuro" });
    f.filter(0, rigid([1, 2, 3], 0.7, [10, -20, -300]));
    const y = f.filter(33, new Float64Array(16));
    expect(Array.from(y).every(Number.isFinite)).toBe(true);
  });
  it("warmUp samples pass through", () => {
    const f = createPoseFilter({ type: "oneEuro", warmUp: 3 });
    for (let i = 0; i < 3; i++) {
      const x = rigid(Z, i * 0.3, [i * 10, 0, 0]);
      expect(Array.from(f.filter(i * 33, x))).toEqual(Array.from(x));
    }
    // After warm-up the filter is smoothing, so a big jump is damped.
    const y = f.filter(3 * 33, rigid(Z, 0, [1000, 0, 0]));
    expect(y[12]).toBeLessThan(1000);
  });
  it("reset restarts", () => {
    const f = createPoseFilter({ type: "oneEuro" });
    f.filter(0, rigid(Z, 0));
    f.filter(33, rigid(Z, 0.5, [5, 0, 0]));
    f.reset();
    // A pose far from the old one passes through: nothing pulls it towards the old R̂.
    const x = rigid([1, 2, 3], 2, [9, 9, 9]);
    expect(Array.from(f.filter(66, x))).toEqual(Array.from(x));
  });
  // The filter reuses its output array; the tracker copies every filter's result, which
  // tracker.test.ts checks ("a kept pose is not changed by the next frame").
});

describe("loadFilter", () => {
  it("'none' and 'native' resolve to null", async () => {
    expect(await loadFilter("none", "thread")).toBeNull();
    expect(await loadFilter("native", "thread")).toBeNull();
    expect(usesNativeFiltering("native")).toBe(true);
    expect(usesNativeFiltering("none")).toBe(false);
    expect(usesNativeFiltering({ type: "oneEuro" })).toBe(false);
  });
  it("oneEuro gives independent filters", async () => {
    const make = (await loadFilter({ type: "oneEuro" }, "thread"))!;
    const a = make();
    const b = make();
    const steady = rigid(Z, 1, [100, 0, 0]);
    a.filter(0, rigid(Z, 0));
    b.filter(0, steady);
    a.filter(33, rigid(Z, 0.1, [1, 0, 0]));
    const yb = b.filter(33, steady);
    expect(maxDiff(yb, steady)).toBeLessThan(1e-9);
  });
  it("loads a module by URL", async () => {
    const make = (await loadFilter(
      {
        module: abs("/examples/filters/average-filter.js"),
        options: { weight: 0.5 },
      },
      "thread",
    ))!;
    const f = make();
    f.filter(0, new Float64Array([0, 0]));
    expect(Array.from(f.filter(33, new Float64Array([10, 20])))).toEqual([
      5, 10,
    ]);
  });
  it("a missing module rejects naming the URL, with the cause", async () => {
    const url = abs("/examples/filters/nope.js");
    const e = await loadFilter({ module: url }, "thread").catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toContain(url);
    // The import's own error is kept as `cause`, and its message in ours.
    expect(e.cause).toBeInstanceOf(Error);
    expect(e.message).toContain(e.cause.message);
  });
  it("a malformed filter config is a TypeError naming the problem", async () => {
    const cases: [unknown, RegExp][] = [
      ["raw", /"raw".*'none'.*'native'/],
      [null, /'none'.*'native'/],
      [{}, /module.*create.*type/],
      [{ type: "kalman" }, /"kalman".*oneEuro/],
      [{ module: 5 }, /module.*string/],
      [{ create: 5 }, /create.*function/],
      // A key the form does not take (G6), so a misspelt one is not ignored.
      [{ type: "oneEuro", minCutoff: 1 }, /"minCutoff".*minCutOff/],
      [{ type: "oneEuro", module: "/f.js" }, /"module".*type/],
      [{ module: "/f.js", option: 1 }, /"option".*options/],
      [{ create: () => ({}), extra: 1 }, /"extra"/],
    ];
    for (const [config, message] of cases) {
      const e = await loadFilter(config as any, "thread").catch((x) => x);
      expect(e, JSON.stringify(config)).toBeInstanceOf(TypeError);
      expect(e.message, JSON.stringify(config)).toMatch(message);
    }
  });
  it("a module without createPoseFilter rejects", async () => {
    const url = abs("/tests/vitest/fixtures/no-export-filter.js");
    const e = await loadFilter({ module: url }, "thread").catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toContain(url);
    expect(e.message).toContain("createPoseFilter");
  });
  it("a throwing createPoseFilter rejects at load, with the cause", async () => {
    const url = abs("/tests/vitest/fixtures/throwing-filter.js");
    const e = await loadFilter({ module: url }, "thread").catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toContain(url);
    expect(e.cause).toBeInstanceOf(Error);
    expect(e.message).toContain(e.cause.message);
  });
  it("{ create } works on the thread and is a TypeError in a worker", async () => {
    const mk = (): PoseFilter => ({ filter: (_t, p) => p, reset() {} });
    const make = (await loadFilter({ create: mk }, "thread"))!;
    expect(typeof make().filter).toBe("function");
    const e = await loadFilter({ create: mk }, "worker").catch((x) => x);
    expect(e).toBeInstanceOf(TypeError);
    expect(e.message).toContain("postMessage");
  });
});
