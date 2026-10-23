/**
 * configure() and getRuntimeSettings() on the Node build (#720), against the committed dist
 * bundle; tests/vitest/runtime-settings.test.ts covers the browser builds.
 *
 * configure(patch) deep-merges the patch into getRuntimeSettings() and hands the result to
 * the core, which validates everything first and changes nothing on failure (D7, D8). An
 * unknown key is a TypeError, a value the core refuses a RangeError. getCameraMatrix()
 * follows the planes at once, from initialisation on (D4, D5; #720 phase 1).
 *
 * Run with `npm run test:node`, from examples/node as the Node examples are.
 */
const { describe, it, before, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const EXAMPLE_DIR = path.resolve(__dirname, "../../examples/node");
const { ARControllerNFT } = require("../../dist/ARToolkitNFT_node.js");

/** The near and far planes encoded in an OpenGL frustum matrix (column-major). */
function planesOf(m) {
  // m[10] = -(f + n) / (f - n), m[14] = -2fn / (f - n)
  return { near: m[14] / (m[10] - 1), far: m[14] / (m[10] + 1) };
}

function assertClose(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} is not within ${tolerance} of ${expected}`,
  );
}

/** #720 phase 1: the matrix is built with the planes the getters report. */
function assertMatrixMatchesPlanes(ar) {
  const planes = planesOf(ar.getCameraMatrix());
  assertClose(planes.near, ar.getProjectionNearPlane(), 1e-6, "near plane");
  assertClose(planes.far, ar.getProjectionFarPlane(), 1e-2, "far plane");
}

const init = () => ARControllerNFT.initWithDimensions(640, 480, "camera_para.dat");

describe("Node build, runtime settings", () => {
  let ar;
  let initial;
  const cameraMatrix = () => Array.from(ar.getCameraMatrix());

  before(async () => {
    process.chdir(EXAMPLE_DIR);
    ar = await init();
    initial = ar.getRuntimeSettings();
  });

  afterEach(() => {
    ar.configure(initial);
  });

  it("starts with the documented defaults", () => {
    assertClose(initial.near, 0.1, 1e-10, "near");
    assert.equal(initial.far, 1000);
    assert.equal(initial.continuousDetection, true);
    assert.equal(initial.detectionInterval, 300);
    assert.equal(initial.filtering, true);
    assert.equal(initial.logLevel, 1);
    assert.deepEqual(initial.ar2, {
      trackingThresh: 5,
      simThresh: 0.5,
      searchFeatureNum: 16,
      templateSize1: 6,
      templateSize2: 6,
      searchSize: 6,
    });
  });

  it("matrix matches the planes right after load and after a change (#720 phase 1)", () => {
    assertMatrixMatchesPlanes(ar);
    assertClose(planesOf(ar.getCameraMatrix()).near, 0.1, 1e-6, "near after load");
    ar.setProjectionNearPlane(2);
    assertMatrixMatchesPlanes(ar);
    ar.configure({ near: 0.5, far: 300 });
    assertMatrixMatchesPlanes(ar);
  });

  it("matrix follows the planes from init", async () => {
    const other = await init();
    other.configure({ near: 0.1, far: 1000 });
    assert.deepEqual(cameraMatrix(), Array.from(other.getCameraMatrix()));
  });

  it("setter rebuilds the matrix", () => {
    const before = cameraMatrix();
    ar.setProjectionNearPlane(10);
    const after = cameraMatrix();
    assert.notEqual(after[10], before[10]);
    assert.notEqual(after[14], before[14]);
    assert.deepEqual(after, Array.from(ar.artoolkitNFT.getCameraLens()));
  });

  it("configure round trip with nested ar2", () => {
    // 0.75, not 0.6: the AR2 thresholds are float32 in the core, and 0.75 is exact there.
    ar.configure({ ar2: { simThresh: 0.75 } });
    const after = ar.getRuntimeSettings();
    assert.deepEqual(after.ar2, { ...initial.ar2, simThresh: 0.75 });
    const { ar2: _a, ...restAfter } = after;
    const { ar2: _b, ...restBefore } = initial;
    assert.deepEqual(restAfter, restBefore);
  });

  it("unknown and deprecated keys throw TypeError", () => {
    const matrix = cameraMatrix();
    assert.throws(() => ar.configure({ nearPlane: 1 }), TypeError);
    assert.throws(() => ar.configure({ nearPlane: 1 }), /nearPlane/);
    assert.throws(() => ar.configure({ threshold: 5 }), TypeError);
    assert.throws(() => ar.configure({ imageProcMode: 0 }), TypeError);
    assert.throws(() => ar.configure({ ar2: { searchFeature: 3 } }), /ar2\.searchFeature/);
    assert.throws(() => ar.configure({ near: "1" }), TypeError);
    assert.throws(() => ar.configure({ ar2: null }), TypeError);
    assert.deepEqual(ar.getRuntimeSettings(), initial);
    assert.deepEqual(cameraMatrix(), matrix);
  });

  it("invalid values throw RangeError", () => {
    const matrix = cameraMatrix();
    assert.throws(() => ar.configure({ near: 0 }), RangeError);
    assert.throws(() => ar.configure({ near: 1, far: 0.5 }), RangeError);
    assert.throws(() => ar.configure({ ar2: { searchFeatureNum: 41 } }), RangeError);
    assert.throws(() => ar.configure({ detectionInterval: -2 }), RangeError);
    assert.deepEqual(ar.getRuntimeSettings(), initial);
    assert.deepEqual(cameraMatrix(), matrix);
  });

  it("configure({}) changes nothing", () => {
    const matrix = cameraMatrix();
    ar.configure({});
    assert.deepEqual(ar.getRuntimeSettings(), initial);
    assert.deepEqual(cameraMatrix(), matrix);
  });

  it("filtering is accepted", () => {
    ar.configure({ filtering: false });
    assert.equal(ar.getRuntimeSettings().filtering, false);
    ar.configure({ filtering: true });
    assert.equal(ar.getRuntimeSettings().filtering, true);
  });

  it("logLevel is the controller's log level", () => {
    ar.configure({ logLevel: 3 });
    assert.equal(ar.getLogLevel(), 3);
    assert.equal(ar.getRuntimeSettings().logLevel, 3);
  });

  it("is on ARToolkitNFT too", () => {
    const toolkit = ar.artoolkitNFT;
    toolkit.configure({ continuousDetection: false, detectionInterval: 50 });
    const s = toolkit.getRuntimeSettings();
    assert.equal(s.continuousDetection, false);
    assert.equal(s.detectionInterval, 50);
    assert.throws(() => toolkit.configure({ bogus: 1 }), TypeError);
    assert.throws(() => toolkit.configure({ far: -1 }), RangeError);
  });
});
