/**
 * The committed dist bundles must not embed a path from the machine that built them.
 *
 * The Emscripten ES6 glue reads `import.meta.url`, and webpack replaces it with the
 * `file://` URL of the source file when it emits a UMD bundle. That string then ships in
 * the npm package and in every app that bundles it (#684).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DIST_DIR = path.resolve(__dirname, "../../dist");
const bundles = fs.readdirSync(DIST_DIR).filter((name) => name.endsWith(".js"));

describe("dist bundles", () => {
  it("are present", () => {
    assert.ok(bundles.length > 0, `no .js files in ${DIST_DIR}`);
  });

  for (const name of bundles) {
    it(`${name} embeds no file:// URL`, () => {
      const source = fs.readFileSync(path.join(DIST_DIR, name), "utf8");
      // A bare "file://" is fine: the Emscripten glue tests URLs against that prefix.
      const match = source.match(/file:\/\/[^"'`\s)]+/);
      assert.equal(match?.[0], undefined, `${name} contains ${match?.[0]}`);
    });
  }
});
