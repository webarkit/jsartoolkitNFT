/**
 * Multi-marker tracking in the Node build, against the committed dist bundle.
 *
 * `examples/node/pinball-demo.jpg` photographs a sheet carrying both targets: the
 * pinball print on the left and the kuva print on the right. `pinballOnly` is the same
 * photo with the kuva print painted over (the quad matches tests/vitest/frames.ts).
 *
 * Run with `npm run test:node`. Paths given to the library resolve against the working
 * directory, so the test runs from examples/node, as the Node examples do.
 */
const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const sharp = require("sharp");

const EXAMPLE_DIR = path.resolve(__dirname, "../../examples/node");
const { ARControllerNFT } = require("../../dist/ARToolkitNFT_node.js");

const WIDTH = 2000;
const HEIGHT = 1500;
const KUVA_PRINT = "1128,380 1705,452 1705,1165 1096,1100";

async function loadFrames() {
  const photo = path.join(EXAMPLE_DIR, "pinball-demo.jpg");
  const both = await sharp(photo).ensureAlpha().raw().toBuffer();
  const mask = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">` +
      `<polygon points="${KUVA_PRINT}" fill="#d9d4ca"/></svg>`,
  );
  const pinballOnly = await sharp(photo)
    .composite([{ input: mask, top: 0, left: 0 }])
    .ensureAlpha()
    .raw()
    .toBuffer();
  return {
    both: new Uint8Array(both.buffer, both.byteOffset, both.length),
    pinballOnly: new Uint8Array(pinballOnly.buffer, pinballOnly.byteOffset, pinballOnly.length),
  };
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

describe("Node build, two markers in view", () => {
  let ar;
  let frames;

  before(async () => {
    process.chdir(EXAMPLE_DIR);
    frames = await loadFrames();
    ar = await ARControllerNFT.initWithDimensions(WIDTH, HEIGHT, "camera_para.dat");
    const ids = await loadMarkers(ar, ["DataNFT/pinball", "DataNFT/kuva"]);
    assert.deepEqual(ids, [0, 1]);
    ids.forEach((id) => ar.trackNFTMarkerId(id));
  });

  it("fires getNFTMarker for both markers", () => {
    const seen = new Set();
    const onGet = (e) => seen.add(e.data.index);
    ar.addEventListener("getNFTMarker", onGet);
    try {
      processUntil(ar, frames.both, () => seen.has(0) && seen.has(1));
    } finally {
      ar.removeEventListener("getNFTMarker", onGet);
    }
    assert.deepEqual([...seen].sort(), [0, 1]);
  });

  it("gives the two markers different poses", () => {
    processUntil(ar, frames.both, () => isFound(ar, 0) && isFound(ar, 1));
    // pose is a row-major 3x4 [R|t]; index 3 is the x translation. Pinball is
    // on the left of the frame and kuva on the right.
    assert.ok(ar.getNFTMarker(0).pose[3] < ar.getNFTMarker(1).pose[3]);
  });

  it("does not look for kuva while pinball is tracked, with continuous detection off", () => {
    try {
      ar.setContinuousDetection(false);
      processUntil(ar, frames.pinballOnly, () => isFound(ar, 0) && !isFound(ar, 1));

      for (let i = 0; i < 10; i++) ar.process(frames.both);
      assert.equal(isFound(ar, 0), true);
      assert.equal(isFound(ar, 1), false);

      ar.setContinuousDetection(true);
      processUntil(ar, frames.both, () => isFound(ar, 1));
    } finally {
      ar.setContinuousDetection(true);
    }
  });

  it("detects at most once per detection interval while a marker is tracked", () => {
    try {
      // Detect on every frame while holding pinball alone, so a pass has just
      // run; then widen the interval past the length of the test.
      ar.setDetectionInterval(0);
      processUntil(ar, frames.pinballOnly, () => isFound(ar, 0) && !isFound(ar, 1));
      ar.setDetectionInterval(60_000);

      for (let i = 0; i < 10; i++) ar.process(frames.both);
      assert.equal(isFound(ar, 0), true);
      assert.equal(isFound(ar, 1), false);

      ar.setDetectionInterval(0);
      processUntil(ar, frames.both, () => isFound(ar, 1));
    } finally {
      ar.setDetectionInterval(300);
    }
  });

  it("reports missing marker files through onError", async () => {
    await assert.rejects(loadMarkers(ar, ["DataNFT/does-not-exist"]));
  });
});

describe("Node build, markers loaded in separate calls (#612)", () => {
  let ar;
  let frames;

  before(async () => {
    process.chdir(EXAMPLE_DIR);
    frames = await loadFrames();
    ar = await ARControllerNFT.initWithDimensions(WIDTH, HEIGHT, "camera_para.dat");
  });

  it("continues the ids and detects both markers", async () => {
    assert.deepEqual(await loadMarkers(ar, ["DataNFT/pinball"]), [0]);
    assert.deepEqual(await loadMarkers(ar, ["DataNFT/kuva"]), [1]);
    ar.trackNFTMarkerId(0);
    ar.trackNFTMarkerId(1);
    processUntil(ar, frames.both, () => isFound(ar, 0) && isFound(ar, 1));
  });

  it("accepts a retry after a failed load", async () => {
    const fresh = await ARControllerNFT.initWithDimensions(WIDTH, HEIGHT, "camera_para.dat");
    await assert.rejects(loadMarkers(fresh, ["DataNFT/does-not-exist"]));
    assert.deepEqual(await loadMarkers(fresh, ["DataNFT/pinball"]), [0]);
  });
});
