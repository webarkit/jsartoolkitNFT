import { describe, it, expect } from "vitest";
import { OneEuroFilter } from "@webarkit/oneeurofilter-ts";
import { createPoseFilter, ONE_EURO_DEFAULTS } from "../../src/tracker/filters/oneEuro";
import { loadFilter, usesNativeFiltering } from "../../src/tracker/filters/loadFilter";
import type { PoseFilter } from "../../src/tracker/filters/PoseFilter";

const abs = (p: string) => new URL(p, location.origin).href;
const pose = (v: number) => new Float64Array(16).fill(v);

describe("OneEuro", () => {
  it("the first sample passes through", () => {
    const f = createPoseFilter({ type: "oneEuro" });
    expect(Array.from(f.filter(0, pose(3)))).toEqual(Array.from(pose(3)));
  });
  it("a constant input stays constant", () => {
    const f = createPoseFilter({ type: "oneEuro" });
    for (let i = 0; i < 10; i++) {
      expect(Array.from(f.filter(i * 33, pose(2)))).toEqual(Array.from(pose(2)));
    }
  });
  it("a step is smoothed", () => {
    const f = createPoseFilter({ type: "oneEuro" });
    for (let i = 0; i < 5; i++) f.filter(i * 33, pose(0));
    const y = f.filter(5 * 33, pose(10));
    expect(y[0]).toBeGreaterThan(0);
    expect(y[0]).toBeLessThan(10);
  });
  it("matches the package", () => {
    const f = createPoseFilter({ type: "oneEuro" });
    const ref = new OneEuroFilter(ONE_EURO_DEFAULTS.minCutOff, ONE_EURO_DEFAULTS.beta);
    for (let i = 0; i < 12; i++) {
      const x = pose(Math.sin(i) * 5 + i);
      const t = i * 33;
      const a = f.filter(t, x);
      const b = ref.filter(t, x);
      for (let k = 0; k < 16; k++) expect(Math.abs(a[k] - b[k])).toBeLessThan(1e-12);
    }
  });
  it("warmUp samples pass through", () => {
    const f = createPoseFilter({ type: "oneEuro", warmUp: 3 });
    for (let i = 0; i < 3; i++) {
      const x = pose(i * 10);
      expect(Array.from(f.filter(i * 33, x))).toEqual(Array.from(x));
    }
    // After warm-up the filter is smoothing, so a big jump is damped.
    const y = f.filter(3 * 33, pose(1000));
    expect(y[0]).toBeLessThan(1000);
  });
  it("reset restarts", () => {
    const f = createPoseFilter({ type: "oneEuro" });
    f.filter(0, pose(0));
    f.filter(33, pose(5));
    f.reset();
    expect(Array.from(f.filter(66, pose(9)))).toEqual(Array.from(pose(9)));
  });
  it("returns a copy the caller can keep", () => {
    const f = createPoseFilter({ type: "oneEuro" });
    const a = f.filter(0, pose(1));
    f.filter(33, pose(50));
    expect(a[0]).toBe(1);
  });
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
    a.filter(0, pose(0));
    b.filter(0, pose(100));
    a.filter(33, pose(1));
    const yb = b.filter(33, pose(100));
    expect(yb[0]).toBeCloseTo(100, 9);
  });
  it("loads a module by URL", async () => {
    const make = (await loadFilter(
      { module: abs("/examples/filters/average-filter.js"), options: { weight: 0.5 } },
      "thread",
    ))!;
    const f = make();
    f.filter(0, new Float64Array([0, 0]));
    expect(Array.from(f.filter(33, new Float64Array([10, 20])))).toEqual([5, 10]);
  });
  it("a missing module rejects naming the URL", async () => {
    const url = abs("/examples/filters/nope.js");
    const e = await loadFilter({ module: url }, "thread").catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toContain(url);
  });
  it("a module without createPoseFilter rejects", async () => {
    const url = abs("/tests/vitest/fixtures/no-export-filter.js");
    const e = await loadFilter({ module: url }, "thread").catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toContain(url);
    expect(e.message).toContain("createPoseFilter");
  });
  it("a throwing createPoseFilter rejects at load", async () => {
    const url = abs("/tests/vitest/fixtures/throwing-filter.js");
    const e = await loadFilter({ module: url }, "thread").catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toContain(url);
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
