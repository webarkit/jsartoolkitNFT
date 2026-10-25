// A classic worker that loads the published bundle the way js/*.worker.js, the
// examples and ARnft do, and reports whether the public API arrived as a global.
// Fixture for tests/vitest/dist-bundle.test.ts.
importScripts("/dist/ARToolkitNFT.js");
postMessage(typeof ARControllerNFT);
