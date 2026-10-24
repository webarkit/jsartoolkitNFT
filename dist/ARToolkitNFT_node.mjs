/**
 * ESM entry for Node (#577, D7). tools/build-ts.mjs copies this file, unchanged, to
 * dist/ARToolkitNFT_node.mjs. It is a thin wrapper over the CommonJS bundle, on purpose:
 *
 * - The dual-package hazard. Bundling index_node.ts a second time as ESM would give an
 *   app that loads both the .js and the .mjs two WASM instances and two NFTLoadError
 *   classes, so `instanceof` would fail. Re-exporting the CJS module keeps one instance.
 * - A bundled ESM build fails at init(): the Emscripten glue reads `__dirname`, which
 *   does not exist in ESM.
 *
 * Importing a CJS file gives its module.exports as the default export, also when the
 * bundle sets __esModule. The names are listed one by one because Node cannot see the
 * named exports of a bundled CJS file statically. Keep them in step with the runtime
 * exports of src/index_node.ts.
 */
import cjs from "./ARToolkitNFT_node.js";

export const { ARToolkitNFT, ARControllerNFT, ARLogLevel, NFTLoadError } = cjs;
