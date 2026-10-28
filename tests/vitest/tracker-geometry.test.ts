import { describe, it, expect } from "vitest";
import { getProcessGeometry, toFrameGeometry } from "@webarkit/camera-view";
import {
  targetInfo,
  centerOrigin,
  projectionFor,
} from "../../src/tracker/geometry";
import type { FrameGeometry, TargetInfo } from "../../src/tracker/types";

const P = new Float64Array([
  1.1, 0.1, 0.2, 0.3, 0.4, 1.5, 0.5, 0.6, 0.7, 0.8, -1.01, -1, 0.9, 1.2, -0.02,
  0,
]);
const X = [0, 4, 8, 12];
const Y = [1, 5, 9, 13];

function scaled(base: Float64Array, idx: number[], k: number): Float64Array {
  const out = new Float64Array(base);
  for (const i of idx) out[i] *= k;
  return out;
}
function close(a: Float64Array, b: Float64Array, digits = 12) {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i], digits);
}

// ARnft NFTWorker.dispatchProjectionMatrix, inlined as the oracle (D17).
function arnftProjection(p: Float64Array, g: FrameGeometry): Float64Array {
  const out = new Float64Array(p);
  for (const i of X) out[i] *= g.frameWidth / g.width;
  for (const i of Y) out[i] *= g.frameHeight / g.height;
  if (g.rotated) {
    for (let c = 0; c < 4; c++) {
      const x = out[4 * c];
      const y = out[4 * c + 1];
      out[4 * c] = -y;
      out[4 * c + 1] = x;
    }
  }
  return out;
}

describe("targetInfo", () => {
  it("computes millimetres", () => {
    const info = targetInfo(
      3,
      "m",
      { width: 893, height: 1117, dpi: 120 },
      "corner",
    );
    expect(info.widthMm).toBeCloseTo((893 / 120) * 25.4, 9);
    expect(info.heightMm).toBeCloseTo((1117 / 120) * 25.4, 9);
    expect(info).toMatchObject({
      id: 3,
      url: "m",
      widthPx: 893,
      heightPx: 1117,
      dpi: 120,
      origin: "corner",
    });
  });
});

describe("centerOrigin", () => {
  const info: TargetInfo = targetInfo(
    0,
    "m",
    { width: 893, height: 1117, dpi: 120 },
    "center",
  );
  it("translates by half the size on the identity pose", () => {
    const id = new Float64Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]);
    const out = centerOrigin(id, info);
    expect(out).not.toBe(id);
    expect(out[12]).toBeCloseTo(info.widthMm / 2, 9);
    expect(out[13]).toBeCloseTo(info.heightMm / 2, 9);
    expect(out[14]).toBe(0);
    expect(id[12]).toBe(0);
  });
  it("adds R * (w/2, h/2, 0) on a rotated pose", () => {
    // 90 degrees about z, column-major: x axis -> y, y axis -> -x.
    const pose = new Float64Array([
      0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1,
    ]);
    const out = centerOrigin(pose, info);
    const hw = info.widthMm / 2;
    const hh = info.heightMm / 2;
    expect(out[12]).toBeCloseTo(10 - hh, 9);
    expect(out[13]).toBeCloseTo(20 + hw, 9);
    expect(out[14]).toBeCloseTo(30, 9);
    expect(out[15]).toBe(1);
  });
});

describe("projectionFor without geometry", () => {
  it("contain", () => {
    close(projectionFor(P, 640, 480, { width: 640, height: 480 }), P);
    close(
      projectionFor(P, 640, 480, { width: 1280, height: 480 }),
      scaled(P, X, 0.5),
    );
    close(
      projectionFor(P, 640, 480, { width: 640, height: 960 }),
      scaled(P, Y, 0.5),
    );
  });
  it("cover", () => {
    close(
      projectionFor(P, 640, 480, { width: 1280, height: 480, fit: "cover" }),
      scaled(P, Y, 2),
    );
    close(
      projectionFor(P, 640, 480, { width: 640, height: 960, fit: "cover" }),
      scaled(P, X, 2),
    );
  });
  it("returns a new matrix and leaves the input alone", () => {
    const copy = new Float64Array(P);
    const out = projectionFor(P, 640, 480, { width: 640, height: 480 });
    expect(out).not.toBe(P);
    close(P, copy);
  });
});

describe("projectionFor with geometry matches ARnft", () => {
  const cases: [string, number, number, boolean][] = [
    ["1280x720 not rotated", 1280, 720, false],
    ["720x1280 rotated", 720, 1280, true],
    ["720x1280 not rotated", 720, 1280, false],
  ];
  for (const [name, vw, vh, rotatePortrait] of cases) {
    it(name, () => {
      // Compile-time check: the package's type is assignable to the facade's (D20).
      const g: FrameGeometry = toFrameGeometry(
        vw,
        vh,
        getProcessGeometry(vw, vh, rotatePortrait),
      );
      // The viewport has the video's displayed aspect, so fit makes no difference.
      for (const fit of ["contain", "cover"] as const) {
        const out = projectionFor(
          P,
          g.frameWidth,
          g.frameHeight,
          { width: vw, height: vh, fit },
          g,
        );
        close(out, arnftProjection(P, g));
      }
    });
  }
});
