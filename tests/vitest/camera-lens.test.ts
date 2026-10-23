import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { VARIANTS } from "./variants";
import { CAMERA_PARAM, VIDEO_WIDTH, VIDEO_HEIGHT } from "./helpers";

/**
 * The camera lens follows the projection planes (#630, #720).
 *
 * Since WebARKitLib 0.12.0 the plane setters rebuild the frustum themselves once a
 * camera is loaded (D5), and the controller's getCameraMatrix() follows them at once.
 * recalculateCameraLens() is kept for compatibility on both ARControllerNFT and
 * ARToolkitNFT; it rebuilds the same matrix, so calling it changes nothing.
 */
describe.each(VARIANTS)("camera lens ($name)", (variant) => {
  let ar: any;

  beforeAll(async () => {
    const { ARControllerNFT } = await variant.load();
    ar = await ARControllerNFT.initWithDimensions(
      VIDEO_WIDTH,
      VIDEO_HEIGHT,
      CAMERA_PARAM,
    );
  });

  afterAll(() => {
    ar?.dispose?.();
  });

  const lens = () =>
    Array.from(ar.artoolkitNFT.getCameraLens() as ArrayLike<number>);
  const cameraMatrix = () =>
    Array.from(ar.getCameraMatrix() as ArrayLike<number>);

  it("the controller's setters rebuild the frustum and getCameraMatrix() follows", () => {
    const initial = cameraMatrix();

    ar.setProjectionNearPlane(0.5);
    ar.setProjectionFarPlane(2000);
    expect(lens()).not.toEqual(initial);
    expect(cameraMatrix()).toEqual(lens());

    const rebuilt = cameraMatrix();
    ar.recalculateCameraLens();
    expect(cameraMatrix()).toEqual(rebuilt);
  });

  it("the ARToolkitNFT setters rebuild the frustum", () => {
    const before = lens();

    ar.artoolkitNFT.setProjectionNearPlane(0.25);
    const after = lens();
    expect(after).not.toEqual(before);
    ar.artoolkitNFT.recalculateCameraLens();
    expect(lens()).toEqual(after);
  });
});
