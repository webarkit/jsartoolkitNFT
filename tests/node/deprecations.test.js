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

// The default, SIMD and threaded builds declare these methods once, in the shared
// base classes their ARControllerNFT and ARToolkitNFT extend, and inherit the JSDoc
// from there (#734). The Node build still has its own classes.
const FILES = {
  "ARControllerNFTBase.d.ts": [...METHODS, "debugSetup"],
  "ARControllerNFT_node.d.ts": [...METHODS, "debugSetup"],
  "ARToolkitNFTBase.d.ts": METHODS,
  "ARToolkitNFT_node.d.ts": METHODS,
  "abstractions/AbstractARControllerNFT.d.ts": [...METHODS, "debugSetup"],
  "abstractions/IARToolkitNFT.d.ts": METHODS,
};

// The browser builds' own classes inherit these methods. A build may still override
// one only to publish its own JSDoc, as _td does for setDetectionInterval; that
// JSDoc then replaces the base's, so it has to carry @deprecated itself.
const VARIANT_FILES = {
  "ARControllerNFT.d.ts": [...METHODS, "debugSetup"],
  "ARControllerNFT_simd.d.ts": [...METHODS, "debugSetup"],
  "ARControllerNFT_td.d.ts": [...METHODS, "debugSetup"],
  "ARToolkitNFT.d.ts": METHODS,
  "ARToolkitNFT_simd.d.ts": METHODS,
  "ARToolkitNFT_td.d.ts": METHODS,
};

/** Whether `source` declares `name`. */
function declares(source, name) {
  return new RegExp(`^\\s*${name}\\s*[(:]`, "m").test(source);
}

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

  for (const [file, names] of Object.entries(VARIANT_FILES)) {
    it(`keeps them @deprecated where ${file} redeclares them`, () => {
      const source = fs.readFileSync(path.join(TYPES, file), "utf8");
      const missing = names
        .filter((name) => declares(source, name))
        .filter((name) => !/@deprecated/.test(jsdocBefore(source, name)));
      assert.deepEqual(missing, []);
    });
  }
});
