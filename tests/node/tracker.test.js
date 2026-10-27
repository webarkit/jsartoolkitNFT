/**
 * createNFTTracker on the Node build (#720 D10), against the committed dist bundle;
 * tests/vitest/tracker.test.ts covers the browser builds. Run `npm run build-ts` first.
 *
 * Run with `npm run test:node`, from examples/node as the Node examples are.
 */
const { describe, it, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const sharp = require("sharp");

const EXAMPLE_DIR = path.resolve(__dirname, "../../examples/node");
const {
  ARControllerNFT,
  createNFTTracker,
} = require("../../dist/ARToolkitNFT_node.js");

describe("Node build, createNFTTracker", () => {
  let rgba;
  let width;
  let height;
  const trackers = [];

  /** A tracker on the example image's size; the suite disposes it. */
  async function make() {
    const t = await createNFTTracker({
      width,
      height,
      cameraParam: "camera_para.dat",
    });
    trackers.push(t);
    return t;
  }

  before(async () => {
    process.chdir(EXAMPLE_DIR);
    // As example_dist.js loads it: process() takes RGBA, so add the alpha channel.
    const { data, info } = await sharp("pinball-demo.jpg")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    width = info.width;
    height = info.height;
    rgba = { data: new Uint8ClampedArray(data), width, height };
  });

  after(() => {
    for (const t of trackers) t.dispose();
  });

  it("loads one source and reports the missing one as a network failure", async () => {
    const t = await make();
    const results = await t.addNFTTargets([
      "DataNFT/pinball",
      "DataNFT/missing",
    ]);
    assert.equal(results.length, 2);
    assert.equal(results[0].status, "loaded");
    assert.equal(results[0].info.url, "DataNFT/pinball");
    assert.equal(results[1].status, "error");
    assert.equal(results[1].reason, "network");
  });

  it("finds pinball with a single found transition", async () => {
    const t = await make();
    const [loaded] = await t.addNFTTargets(["DataNFT/pinball"]);
    let found = 0;
    let lastFound = false;
    for (let i = 0; i < 30; i++) {
      const r = t.process(rgba, i * 33);
      found += r.transitions.filter((x) => x.type === "found").length;
      lastFound = r.targets[0].found;
      assert.equal(r.targets[0].id, loaded.info.id);
    }
    assert.equal(found, 1);
    assert.equal(lastFound, true);
  });

  it("poses equal the Node controller's matrixGL_RH", async () => {
    // Two things keep the comparison exact, neither of them a facade difference:
    // - D9b: the facade uses the WASM luma path (lumaInternal = true) while the Node
    //   controller always passes its JS-computed luma, so the controller's toolkit is
    //   made to pass lumaInternal = true as well.
    // - AR2 seeds rand() with srand(time(NULL)) (WebARKitLib selectTemplate.c), so cores
    //   built in different seconds can differ by a few millimetres: Date.now() is pinned.
    const wall = mock.method(Date, "now", () => 1_700_000_000_000);
    try {
      const ctrl = await ARControllerNFT.initWithDimensions(
        width,
        height,
        "camera_para.dat",
      );
      const toolkit = ctrl.artoolkitNFT;
      const pass = toolkit.passVideoData.bind(toolkit);
      toolkit.passVideoData = (frame, luma) => pass(frame, luma, true);
      assert.deepEqual(await ctrl.loadNFTMarkers(["DataNFT/pinball"]), [0]);

      const t = await make();
      await t.addNFTTargets(["DataNFT/pinball"]);

      let ctrlPose = null;
      ctrl.addEventListener("getNFTMarker", (e) => {
        if (e.data.index === 0) ctrlPose = e.data.matrixGL_RH;
      });

      let compared = 0;
      for (let i = 0; i < 30; i++) {
        ctrlPose = null;
        ctrl.process(rgba.data);
        const target = t.process(rgba, i * 33).targets[0];
        // The same found/lost on both sides, then the same pose.
        assert.equal(target.found, ctrlPose !== null);
        if (ctrlPose && target.found) {
          assert.equal(target.pose.length, 16);
          for (let k = 0; k < 16; k++) {
            assert.ok(
              Math.abs(target.pose[k] - ctrlPose[k]) <= 1e-9,
              `pose[${k}]`,
            );
          }
          compared++;
        }
      }
      assert.ok(compared > 20, `only ${compared} of 30 frames compared`);
    } finally {
      wall.mock.restore();
    }
  });

  it("dispose makes process throw", async () => {
    const t = await make();
    t.dispose();
    assert.throws(() => t.process(rgba, 0), /disposed/);
  });
});
