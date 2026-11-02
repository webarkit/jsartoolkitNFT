import { describe, it, expect } from "vitest";
import { expSO3, logSO3, polarStep } from "../../src/tracker/filters/so3";

/**
 * The SO(3) helpers of the oneEuro pose filter (#766). 3×3 matrices are column-major
 * Float64Array(9): m[c * 3 + r]. No WASM, so this file is not in THREADED.
 */

/** A seeded generator, so a failure reproduces. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (m: Float64Array, r: number, c: number) => m[c * 3 + r];

/** Column norms, column dot products and det against 1, 0, 1. */
function rigidityError(m: Float64Array): number {
  let err = 0;
  for (let a = 0; a < 3; a++) {
    for (let b = a; b < 3; b++) {
      let dot = 0;
      for (let r = 0; r < 3; r++) dot += at(m, r, a) * at(m, r, b);
      err = Math.max(err, Math.abs(dot - (a === b ? 1 : 0)));
    }
  }
  const det =
    at(m, 0, 0) * (at(m, 1, 1) * at(m, 2, 2) - at(m, 2, 1) * at(m, 1, 2)) -
    at(m, 0, 1) * (at(m, 1, 0) * at(m, 2, 2) - at(m, 2, 0) * at(m, 1, 2)) +
    at(m, 0, 2) * (at(m, 1, 0) * at(m, 2, 1) - at(m, 2, 0) * at(m, 1, 1));
  return Math.max(err, Math.abs(det - 1));
}

const maxDiff = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
  return d;
};

const AXES: Array<[number, number, number]> = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1 / Math.sqrt(14), 2 / Math.sqrt(14), 3 / Math.sqrt(14)],
];
const ANGLES = [0, 1e-12, 1e-6, 0.5, 2, Math.PI - 1e-9, Math.PI];

const rot = (axis: [number, number, number], angle: number) =>
  expSO3(
    Float64Array.of(axis[0] * angle, axis[1] * angle, axis[2] * angle),
    new Float64Array(9),
  );

describe("SO(3) helpers (#766)", () => {
  it("exp then log gives the vector back", () => {
    const rand = rng(1);
    const w = new Float64Array(3);
    const m = new Float64Array(9);
    const back = new Float64Array(3);
    for (let i = 0; i < 200; i++) {
      const axis = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
      const n = Math.hypot(axis[0], axis[1], axis[2]);
      // Angles spread over [1e-12, π − 1e-6], on a log scale below 1.
      const angle =
        i < 50 ? 10 ** (-12 + (i / 50) * 12) : 1e-6 + rand() * (Math.PI - 2e-6);
      for (let k = 0; k < 3; k++) w[k] = (axis[k] / n) * angle;
      logSO3(expSO3(w, m), back);
      expect(maxDiff(back, w)).toBeLessThan(1e-9);
    }
  });

  it("log then exp gives the rotation back near 0 and near π", () => {
    const w = new Float64Array(3);
    const back = new Float64Array(9);
    for (const axis of AXES) {
      for (const angle of ANGLES) {
        const r = rot(axis, angle);
        // Compare rotations, not vectors: at π, ω and −ω are the same rotation.
        expSO3(logSO3(r, w), back);
        expect(maxDiff(back, r)).toBeLessThan(1e-9);
      }
    }
  });

  it("exp gives a rotation", () => {
    for (const axis of AXES) {
      for (const angle of ANGLES) {
        expect(rigidityError(rot(axis, angle))).toBeLessThan(1e-12);
      }
    }
  });

  it("a polar step reduces the error", () => {
    const r = rot(AXES[3], 0.7);
    const m = Float64Array.from(r);
    for (let k = 0; k < 3; k++) m[k] *= 1.01; // column 0 longer
    m[3] += 1e-3; // column 1 sheared
    expect(rigidityError(m)).toBeGreaterThan(1e-3);
    for (let i = 0; i < 3; i++) polarStep(m);
    expect(rigidityError(m)).toBeLessThan(1e-12);

    // A rotation is a fixed point.
    const same = Float64Array.from(r);
    polarStep(same);
    expect(maxDiff(same, r)).toBeLessThan(1e-15);
  });

  it("log of a matrix that is not a rotation is finite", () => {
    const w = new Float64Array(3);
    for (const m of [new Float64Array(9), new Float64Array(9).fill(2)]) {
      logSO3(m, w);
      expect(Array.from(w).every(Number.isFinite)).toBe(true);
    }
  });
});
