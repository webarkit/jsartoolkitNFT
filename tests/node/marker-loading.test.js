/**
 * The Node controller's Promise loading contract (#685, D8, D9, D15, D16),
 * against the dist bundle. Run `npm run build-ts` first.
 */
const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const EXAMPLE_DIR = path.resolve(__dirname, "../../examples/node");
const lib = require("../../dist/ARToolkitNFT_node.js");
const { ARControllerNFT } = lib;

describe("Node marker loading", () => {
  let ar;

  before(async () => {
    process.chdir(EXAMPLE_DIR);
    ar = await ARControllerNFT.initWithDimensions(2000, 1500, "camera_para.dat");
  });

  it("returns a Promise with the real ids, callbacks already run", async () => {
    const calls = [];
    const p = ar.loadNFTMarkers(["DataNFT/pinball"], (ids) => calls.push(ids));
    assert.ok(p instanceof Promise);
    assert.deepEqual(calls, [[0]], "callback ran before the method returned");
    assert.deepEqual(await p, [0]);

    assert.deepEqual(await ar.loadNFTMarkers(["DataNFT/kuva"]), [1]);
  });

  it("loadNFTMarker passes the single id to onSuccess", async () => {
    // Load a fresh controller so the id is predictable.
    const fresh = await ARControllerNFT.initWithDimensions(2000, 1500, "camera_para.dat");
    const got = [];
    const p = fresh.loadNFTMarker("DataNFT/pinball", (id) => got.push(id));
    assert.deepEqual(got, [0]);
    assert.deepEqual(await p, [0]);
  });

  it("a missing file calls onError(-1) once and resolves []", async () => {
    const codes = [];
    const p = ar.loadNFTMarkers(["DataNFT/nope"], undefined, (c) => codes.push(c));
    assert.deepEqual(codes, [-1]);
    assert.deepEqual(await p, []);
    assert.deepEqual(codes, [-1]);
  });

  it("Promise style rejects with kind missing", async () => {
    await assert.rejects(ar.loadNFTMarkers(["DataNFT/nope"]), {
      name: "NFTLoadError",
      kind: "missing",
    });
  });

  it("an empty URL is argument", async () => {
    await assert.rejects(ar.loadNFTMarker(""), { name: "NFTLoadError", kind: "argument" });
    const codes = [];
    const p = ar.loadNFTMarker("", undefined, (c) => codes.push(c));
    assert.deepEqual(codes, [-1]);
    assert.deepEqual(await p, []);
  });

  it("a throwing callback rejects without calling onError", async () => {
    const boom = new Error("boom");
    let errored = false;
    const fresh = await ARControllerNFT.initWithDimensions(2000, 1500, "camera_para.dat");
    await assert.rejects(
      fresh.loadNFTMarkers(
        ["DataNFT/pinball"],
        () => {
          throw boom;
        },
        () => {
          errored = true;
        },
      ),
      boom,
    );
    assert.equal(errored, false);
  });

  it("toolkit addNFTMarkers stays synchronous and never throws", () => {
    const ids = ar.artoolkitNFT.addNFTMarkers(["DataNFT/nope"]);
    assert.deepEqual(ids, []);
    const codes = [];
    const ids2 = ar.artoolkitNFT.addNFTMarkers(["DataNFT/nope"], undefined, (c) => codes.push(c));
    assert.deepEqual(ids2, []);
    assert.deepEqual(codes, [-1]);
  });

  it("NFTLoadError is exported", () => {
    assert.equal(typeof lib.NFTLoadError, "function");
    const e = new lib.NFTLoadError("missing", "x");
    assert.equal(e.name, "NFTLoadError");
    assert.equal(e.kind, "missing");
  });
});
