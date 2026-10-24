/**
 * The Node ESM entry (#577, D7): `import` on Node resolves to dist/ARToolkitNFT_node.mjs,
 * a thin wrapper over the CommonJS bundle. Run `npm run build-ts` first.
 *
 * The package imports itself by name, so this exercises the `exports` map, not a path.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esm from "@webarkit/jsartoolkit-nft";

const cjs = createRequire(import.meta.url)("@webarkit/jsartoolkit-nft");
const EXAMPLE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../examples/node",
);

describe("Node ESM entry", () => {
  it("resolves `import` to the .mjs wrapper and `require` to the CJS bundle", () => {
    assert.match(import.meta.resolve("@webarkit/jsartoolkit-nft"), /ARToolkitNFT_node.mjs$/);
    assert.match(createRequire(import.meta.url).resolve("@webarkit/jsartoolkit-nft"), /ARToolkitNFT_node.js$/);
  });

  it("has named ESM exports", () => {
    for (const k of ["ARToolkitNFT", "ARControllerNFT", "ARLogLevel", "NFTLoadError"]) {
      assert.notEqual(typeof esm[k], "undefined", k);
    }
  });

  it("shares one instance with CJS: same classes, so instanceof works", () => {
    assert.equal(esm.ARControllerNFT, cjs.ARControllerNFT);
    assert.equal(esm.ARToolkitNFT, cjs.ARToolkitNFT);
    assert.equal(esm.ARLogLevel, cjs.ARLogLevel);
    assert.equal(esm.NFTLoadError, cjs.NFTLoadError);
  });

  it("keeps __esModule on the CJS bundle", () => {
    assert.equal(cjs.__esModule, true);
  });

  describe("init", () => {
    let ar;
    before(async () => {
      process.chdir(EXAMPLE_DIR);
      ar = await esm.ARControllerNFT.initWithDimensions(640, 480, "camera_para.dat");
    });

    it("works through the ESM entry", () => {
      assert.ok(ar.id >= 0);
    });
  });
});
