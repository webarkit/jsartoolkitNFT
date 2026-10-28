import { describe, it, expect } from "vitest";
import { ARControllerNFT } from "../../src/index";
import { transMatToGLMat, arglCameraViewRHf } from "../../src/poseMath";
import { CAMERA_PARAM } from "./helpers";

/**
 * The GL pose conversion is shared by both controllers and the tracker facade
 * (#720 D9): one copy, so the poses of the two APIs cannot drift apart.
 */
const TRANS_MAT = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

describe("poseMath", () => {
  it("transMatToGLMat maps a 3x4 row-major matrix to column-major 4x4", () => {
    expect(Array.from(transMatToGLMat(TRANS_MAT))).toEqual([
      1, 5, 9, 0, 2, 6, 10, 0, 3, 7, 11, 0, 4, 8, 12, 1,
    ]);
  });

  it("transMatToGLMat scales only the translation", () => {
    const gl = transMatToGLMat(TRANS_MAT, new Float64Array(16), 2);
    expect(Array.from(gl.slice(12, 15))).toEqual([8, 16, 24]);
    expect(Array.from(gl.slice(0, 12))).toEqual([
      1, 5, 9, 0, 2, 6, 10, 0, 3, 7, 11, 0,
    ]);
  });

  it("arglCameraViewRHf negates rows 1 and 2", () => {
    const gl = transMatToGLMat(TRANS_MAT);
    const rh = arglCameraViewRHf(gl);
    for (const i of [1, 5, 9, 13, 2, 6, 10, 14]) expect(rh[i]).toBe(-gl[i]);
    for (const i of [0, 4, 8, 12]) expect(rh[i]).toBe(gl[i]);
    expect([rh[3], rh[7], rh[11], rh[15]]).toEqual([0, 0, 0, 1]);
  });

  it("arglCameraViewRHf scale = 2 doubles the translation", () => {
    const gl = transMatToGLMat(TRANS_MAT);
    const plain = arglCameraViewRHf(gl);
    const scaled = arglCameraViewRHf(gl, new Float64Array(16), 2);
    for (const i of [12, 13, 14]) expect(scaled[i]).toBe(plain[i] * 2);
  });

  it("the controller methods return the same values as the free functions", async () => {
    const ar = await ARControllerNFT.initWithDimensions(
      640,
      480,
      CAMERA_PARAM,
      false,
    );
    const gl = ar.transMatToGLMat(TRANS_MAT, new Float64Array(16), 1.5);
    expect(Array.from(gl)).toEqual(
      Array.from(transMatToGLMat(TRANS_MAT, new Float64Array(16), 1.5)),
    );
    expect(Array.from(ar.arglCameraViewRHf(gl, undefined, 1.5))).toEqual(
      Array.from(arglCameraViewRHf(gl, undefined, 1.5)),
    );
    ar?.dispose?.();
  });
});
