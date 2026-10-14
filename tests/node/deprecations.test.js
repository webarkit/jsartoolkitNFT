/**
 * The published declarations (types/) mark the square-marker ARHandle methods as
 * deprecated (#659). They have no effect on NFT tracking, which never runs the
 * square-marker labeling that reads them, and go in the next major version.
 *
 * The deprecation reaches consumers only through the JSDoc in the .d.ts files, where
 * editors strike the methods through. tsconfig's removeComments used to strip every
 * comment from them, so this checks the committed declarations, not the sources.
 *
 * Run with `npm run test:node`.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const TYPES = path.resolve(__dirname, "../../types/src");

const METHODS = [
  "setDebugMode",
  "getDebugMode",
  "getProcessingImage",
  "setThresholdMode",
  "getThresholdMode",
  "setThreshold",
  "getThreshold",
  "setImageProcMode",
  "getImageProcMode",
];

const FILES = {
  "ARControllerNFT.d.ts": [...METHODS, "debugSetup"],
  "ARControllerNFT_simd.d.ts": [...METHODS, "debugSetup"],
  "ARControllerNFT_td.d.ts": [...METHODS, "debugSetup"],
  "ARControllerNFT_node.d.ts": [...METHODS, "debugSetup"],
  "ARToolkitNFT.d.ts": METHODS,
  "ARToolkitNFT_simd.d.ts": METHODS,
  "ARToolkitNFT_td.d.ts": METHODS,
  "ARToolkitNFT_node.d.ts": METHODS,
  "abstractions/AbstractARControllerNFT.d.ts": [...METHODS, "debugSetup"],
  "abstractions/IARToolkitNFT.d.ts": METHODS,
};

/** The JSDoc block right before `name`'s declaration in `source`, or "". */
function jsdocBefore(source, name) {
  const declaration = new RegExp(`^\\s*${name}\\s*[(:]`, "m").exec(source);
  assert.ok(declaration, `no declaration of ${name}`);
  const before = source.slice(0, declaration.index).trimEnd();
  if (!before.endsWith("*/")) return "";
  return before.slice(before.lastIndexOf("/**"));
}

describe("deprecated ARHandle methods in types/", () => {
  for (const [file, names] of Object.entries(FILES)) {
    it(`marks them @deprecated in ${file}`, () => {
      const source = fs.readFileSync(path.join(TYPES, file), "utf8");
      const missing = names.filter(
        (name) => !/@deprecated/.test(jsdocBefore(source, name)),
      );
      assert.deepEqual(missing, []);
    });
  }
});
