/**
 * recalculateCameraLens() on the Node build's public API (#630), against the committed
 * dist bundle; tests/vitest/camera-lens.test.ts covers the browser builds.
 *
 * The projection setters only store the planes; recalculateCameraLens() rebuilds the
 * frustum from them, and the controller's getCameraMatrix() returns the rebuilt
 * matrix after it.
 *
 * Run with `npm run test:node`, from examples/node as the Node examples are.
 */
const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const EXAMPLE_DIR = path.resolve(__dirname, "../../examples/node");
const { ARControllerNFT } = require("../../dist/ARToolkitNFT_node.js");

describe("Node build, recalculateCameraLens()", () => {
  let ar;
  const lens = () => Array.from(ar.artoolkitNFT.getCameraLens());
  const cameraMatrix = () => Array.from(ar.getCameraMatrix());

  before(async () => {
    process.chdir(EXAMPLE_DIR);
    ar = await ARControllerNFT.initWithDimensions(640, 480, "camera_para.dat");
  });

  it("rebuilds the frustum on the controller and refreshes getCameraMatrix()", () => {
    const initial = cameraMatrix();

    ar.setProjectionNearPlane(0.5);
    ar.setProjectionFarPlane(2000);
    assert.deepEqual(cameraMatrix(), initial);

    ar.recalculateCameraLens();
    assert.notDeepEqual(lens(), initial);
    assert.deepEqual(cameraMatrix(), lens());
  });

  it("rebuilds the frustum on ARToolkitNFT", () => {
    const before = lens();

    ar.setProjectionNearPlane(0.25);
    ar.artoolkitNFT.recalculateCameraLens();
    assert.notDeepEqual(lens(), before);
  });
});
