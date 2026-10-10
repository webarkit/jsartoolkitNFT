/**
 * The single-thread binding as an adapter over the NFT core (#683), against the committed
 * dist bundle: what the adapter adds around the core, beyond tools/compare-builds.js.
 *
 * - A marker index out of range reaches the core as a null state; the binding still
 *   answers ERROR_MARKER_INDEX_OUT_OF_BOUNDS (-3).
 * - A second setup() applies the camera again: the core frees and recreates paramLT, KPM
 *   and AR2, and the adapter recreates its ARHandle from the new paramLT. Tracking goes
 *   on, and a marker loaded afterwards is found. The assertions pin what the build before
 *   the adapter does.
 *
 * Run with `npm run test:node`, from examples/node as the Node examples are.
 */
const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const sharp = require("sharp");

const EXAMPLE_DIR = path.resolve(__dirname, "../../examples/node");
const { ARControllerNFT } = require("../../dist/ARToolkitNFT_node.js");

const WIDTH = 2000;
const HEIGHT = 1500;
const MARKER_INDEX_OUT_OF_BOUNDS = -3;

async function loadBothMarkersFrame() {
  const photo = path.join(EXAMPLE_DIR, "pinball-demo.jpg");
  const both = await sharp(photo).ensureAlpha().raw().toBuffer();
  return new Uint8Array(both.buffer, both.byteOffset, both.length);
}

function isFound(ar, index) {
  return Boolean(ar.getNFTMarker(index)?.found);
}

function processUntil(ar, frame, done, maxFrames = 60) {
  for (let i = 0; i < maxFrames; i++) {
    ar.process(frame);
    if (done()) return;
  }
  throw new Error(`condition not met after ${maxFrames} frames`);
}

function loadMarkers(ar, urls) {
  return new Promise((resolve, reject) => ar.loadNFTMarkers(urls, resolve, reject));
}

describe("Node build, the single-thread adapter", () => {
  let ar;
  let both;

  before(async () => {
    process.chdir(EXAMPLE_DIR);
    both = await loadBothMarkersFrame();
    ar = await ARControllerNFT.initWithDimensions(WIDTH, HEIGHT, "camera_para.dat");
    const ids = await loadMarkers(ar, ["DataNFT/pinball", "DataNFT/kuva"]);
    assert.deepEqual(ids, [0, 1]);
    ids.forEach((id) => ar.trackNFTMarkerId(id));
  });

  it("answers -3 for a marker index out of range", () => {
    assert.equal(ar.getNFTMarker(-1), MARKER_INDEX_OUT_OF_BOUNDS);
    assert.equal(ar.getNFTMarker(2), MARKER_INDEX_OUT_OF_BOUNDS);
  });

  it("keeps tracking after a second setup, and finds a marker loaded after it", async () => {
    processUntil(ar, both, () => isFound(ar, 0) && isFound(ar, 1));

    // The bound setup(), which applies the camera again; `artoolkitNFT` and `id` are
    // private in TypeScript only. The camera id must be valid, or setup() would leave
    // the camera as it is: a relative path for _loadCamera() is not on the module's
    // filesystem, so the controller's loadCamera() (which mounts the working directory)
    // loads it.
    const toolkit = ar.artoolkitNFT;
    const inst = toolkit.instance;
    // A threshold away from the default, so the default after setup() shows a new ARHandle.
    inst.setThreshold(50);
    assert.equal(inst.getThreshold(), 50);
    const cameraId = await toolkit.loadCamera("camera_para.dat");
    assert.ok(cameraId >= 0, `camera not loaded (${cameraId})`);
    assert.equal(inst.setup(WIDTH, HEIGHT, cameraId), ar.id + 1);
    assert.equal(inst.setupAR2(), 0);
    // The ARHandle was created again from the new camera, with the default threshold.
    assert.equal(inst.getThreshold(), 100);

    assert.deepEqual(await loadMarkers(ar, ["DataNFT/pinball"]), [2]);
    ar.trackNFTMarkerId(2);
    processUntil(ar, both, () => isFound(ar, 0) && isFound(ar, 1) && isFound(ar, 2));
  });
});
