import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { VARIANTS } from "./variants";
import { CAMERA_PARAM, VIDEO_WIDTH, VIDEO_HEIGHT } from "./helpers";

/**
 * recalculateCameraLens() on the public API (#630).
 *
 * The projection setters only store the planes; recalculateCameraLens() rebuilds the
 * frustum from them. It was reachable only through the private `instance` of
 * ARToolkitNFT, and getCameraMatrix() kept returning the matrix cached at
 * initialisation. Both ARControllerNFT and ARToolkitNFT now proxy it, and the
 * controller's getCameraMatrix() returns the rebuilt matrix after it.
 */
describe.each(VARIANTS)("recalculateCameraLens ($name)", (variant) => {
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

  it("rebuilds the frustum on the controller and refreshes getCameraMatrix()", () => {
    const initial = cameraMatrix();

    ar.setProjectionNearPlane(0.5);
    ar.setProjectionFarPlane(2000);
    expect(cameraMatrix()).toEqual(initial);

    ar.recalculateCameraLens();
    expect(lens()).not.toEqual(initial);
    expect(cameraMatrix()).toEqual(lens());
  });

  it("rebuilds the frustum on ARToolkitNFT", () => {
    const before = lens();

    ar.setProjectionNearPlane(0.25);
    ar.artoolkitNFT.recalculateCameraLens();
    expect(lens()).not.toEqual(before);
  });
});
