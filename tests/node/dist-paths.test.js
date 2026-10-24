/**
 * The committed dist bundles must not embed a path from the machine that built them.
 *
 * The Emscripten ES6 glue reads `import.meta.url`, and a bundler that resolves it at build
 * time writes the `file://` URL of the source file into a UMD bundle. That string then
 * ships in the npm package and in every app that bundles it (#684). The Vite build maps
 * it to the bundle URL captured at runtime instead (tools/bundle-url.js).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DIST_DIR = path.resolve(__dirname, "../../dist");
// .mjs too: the Node ESM entry (dist/ARToolkitNFT_node.mjs, #577) ships alongside the
// .js bundles, and so does the threaded build's pthread worker (ARToolkitNFT_td.worker.js).
const bundles = fs
  .readdirSync(DIST_DIR)
  .filter((name) => name.endsWith(".js") || name.endsWith(".mjs"));

describe("dist bundles", () => {
  it("are present", () => {
    assert.ok(bundles.length > 0, `no .js files in ${DIST_DIR}`);
  });

  it("include the threaded build's pthread worker", () => {
    assert.ok(
      bundles.includes("ARToolkitNFT_td.worker.js"),
      "dist/ARToolkitNFT_td.worker.js is missing",
    );
  });

  for (const name of bundles) {
    it(`${name} embeds only the package version, not the whole package.json`, () => {
      // `import { version } from "../package.json"` is tree-shaken to the version; a default
      // import would inline devDependencies and scripts too (#741).
      const source = fs.readFileSync(path.join(DIST_DIR, name), "utf8");
      assert.ok(!source.includes("devDependencies"), `${name} inlines package.json`);
    });

    it(`${name} embeds no file:// URL`, () => {
      const source = fs.readFileSync(path.join(DIST_DIR, name), "utf8");
      // A bare "file://" is fine: the Emscripten glue tests URLs against that prefix.
      const match = source.match(/file:\/\/[^"'`\s)]+/);
      assert.equal(match?.[0], undefined, `${name} contains ${match?.[0]}`);
    });
  }
});
