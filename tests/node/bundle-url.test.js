/**
 * The banner that the Vite UMD bundles run first, to capture their own URL.
 *
 * The Emscripten glue reads `import.meta.url`, which a UMD bundle cannot contain, and
 * the threaded bundle resolves its pthread worker (`ARToolkitNFT_td.worker.js`) against
 * that URL. The banner reproduces webpack's "auto" publicPath rule, which the webpack
 * bundles used, so the worker keeps resolving next to the bundle (#741, D5.2).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { bundleUrlBanner } = require("../../tools/bundle-url.js");

function run(globals) {
  const context = vm.createContext({ ...globals });
  vm.runInContext(bundleUrlBanner("__t"), context);
  return context.__t;
}

describe("bundleUrlBanner", () => {
  it("uses self.location in a worker", () => {
    assert.equal(
      run({ self: { location: { href: "https://h/js/w.js" } } }),
      "https://h/js/",
    );
  });

  it("uses document.currentScript on a page", () => {
    assert.equal(
      run({
        document: {
          currentScript: { src: "https://h/dist/ARToolkitNFT_td.js" },
        },
      }),
      "https://h/dist/",
    );
  });

  it("falls back to the last http(s) <script> when currentScript is null", () => {
    assert.equal(
      run({
        document: {
          currentScript: null,
          getElementsByTagName: () => [
            { src: "https://h/a.js" },
            { src: "https://h/app/bundle.js?v=1#x" },
          ],
        },
      }),
      "https://h/app/",
    );
  });

  it("skips trailing scripts without an http(s) src", () => {
    assert.equal(
      run({
        document: {
          currentScript: null,
          getElementsByTagName: () => [
            { src: "https://h/app/b.js" },
            { src: "" },
          ],
        },
      }),
      "https://h/app/",
    );
  });

  it("strips a blob: prefix", () => {
    assert.equal(
      run({ self: { location: { href: "blob:https://h/js/123" } } }),
      "https://h/js/",
    );
  });
});
