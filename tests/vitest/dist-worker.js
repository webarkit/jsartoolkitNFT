// A classic worker that loads the published bundle the way js/*.worker.js, the
// examples and ARnft do, and reports whether the public API arrived as a global.
// Fixture for tests/vitest/dist-bundle.test.ts. The test sends the bundle's URL: a Blob
// URL of the untransformed dist/ARToolkitNFT.js, because the Vite dev server would turn
// /dist/ARToolkitNFT.js into an ES module, which importScripts() refuses (#720 D15).
onmessage = (e) => {
  importScripts(e.data);
  postMessage(typeof ARControllerNFT);
};
