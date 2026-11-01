/**
 * The light client entry (#765): `@webarkit/jsartoolkit-nft/client` resolves to
 * dist/NFTTracker.client.mjs, which holds createNFTTrackerWorker and no WASM. Run
 * `npm run build-ts` first.
 *
 * The package imports itself by name, so this exercises the `exports` map, not a path. The
 * client never touches the DOM at import time, so it loads in Node; its worker start is
 * checked against a fake `Worker` global.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONFIG = { width: 640, height: 480, cameraParam: "/camera_para.dat" };

/** A fake Worker that records its URL and answers init. */
class FakeWorker {
  static urls = [];
  constructor(url) {
    FakeWorker.urls.push(String(url));
    this.onmessage = null;
  }
  postMessage(msg) {
    if (msg.type === "init" || msg.type === "dispose") {
      queueMicrotask(() =>
        this.onmessage?.({
          data: {
            v: 1,
            id: msg.id,
            type: "ok",
            cameraMatrix: new Float64Array(16),
          },
        }),
      );
    }
  }
  terminate() {}
}

describe("client entry", () => {
  let saved;
  before(() => {
    saved = { Worker: globalThis.Worker, location: globalThis.location };
    globalThis.Worker = FakeWorker;
    globalThis.location = { href: "https://example.test/app/" };
  });
  after(() => {
    globalThis.Worker = saved.Worker;
    if (saved.location === undefined) delete globalThis.location;
    else globalThis.location = saved.location;
  });

  it("resolves to dist/NFTTracker.client.mjs", () => {
    assert.match(
      import.meta.resolve("@webarkit/jsartoolkit-nft/client"),
      /dist\/NFTTracker\.client\.mjs$/,
    );
  });

  it("exports createNFTTrackerWorker only", async () => {
    const client = await import("@webarkit/jsartoolkit-nft/client");
    assert.deepEqual(Object.keys(client), ["createNFTTrackerWorker"]);
    assert.equal(typeof client.createNFTTrackerWorker, "function");
  });

  /** Starts a tracker from the client at `url` and returns the worker URL it asked for. */
  async function workerUrlFrom(url) {
    const { createNFTTrackerWorker } = await import(url);
    FakeWorker.urls.length = 0;
    const t = await createNFTTrackerWorker(CONFIG, { build: "default" });
    await t.dispose();
    return FakeWorker.urls[0];
  }

  it("starts the worker next to the client by default", async () => {
    const url = import.meta.resolve("@webarkit/jsartoolkit-nft/client");
    assert.equal(
      await workerUrlFrom(url),
      new URL("NFTTracker.worker.js", url).href,
    );
  });

  it("follows the client when it is copied out of dist/", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "nft-client-"));
    try {
      const file = path.join(dir, "client.mjs");
      copyFileSync(
        new URL(import.meta.resolve("@webarkit/jsartoolkit-nft/client")),
        file,
      );
      const url = pathToFileURL(file).href;
      assert.equal(
        await workerUrlFrom(url),
        new URL("NFTTracker.worker.js", url).href,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
