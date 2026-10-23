/**
 * The camera lens on the Node build follows the projection planes (#630, #720), against
 * the committed dist bundle; tests/vitest/camera-lens.test.ts covers the browser builds.
 *
 * Since WebARKitLib 0.12.0 the plane setters rebuild the frustum themselves (D5), and the
 * controller's getCameraMatrix() follows them at once. recalculateCameraLens() is kept for
 * compatibility and changes nothing.
 *
 * Run with `npm run test:node`, from examples/node as the Node examples are.
 */
const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const EXAMPLE_DIR = path.resolve(__dirname, "../../examples/node");
const { ARControllerNFT } = require("../../dist/ARToolkitNFT_node.js");

describe("Node build, camera lens", () => {
  let ar;
  const lens = () => Array.from(ar.artoolkitNFT.getCameraLens());
  const cameraMatrix = () => Array.from(ar.getCameraMatrix());

  before(async () => {
    process.chdir(EXAMPLE_DIR);
    ar = await ARControllerNFT.initWithDimensions(640, 480, "camera_para.dat");
  });

  it("the controller's setters rebuild the frustum and getCameraMatrix() follows", () => {
    const initial = cameraMatrix();

    ar.setProjectionNearPlane(0.5);
    ar.setProjectionFarPlane(2000);
    assert.notDeepEqual(lens(), initial);
    assert.deepEqual(cameraMatrix(), lens());

    const rebuilt = cameraMatrix();
    ar.recalculateCameraLens();
    assert.deepEqual(cameraMatrix(), rebuilt);
  });

  it("the ARToolkitNFT setters rebuild the frustum", () => {
    const before = lens();

    ar.artoolkitNFT.setProjectionNearPlane(0.25);
    const after = lens();
    assert.notDeepEqual(after, before);
    ar.artoolkitNFT.recalculateCameraLens();
    assert.deepEqual(lens(), after);
  });
});
