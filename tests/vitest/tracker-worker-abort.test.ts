import { describe, it, expect, afterEach, vi } from "vitest";
import {
  createNFTTrackerWorker,
  __setWorkerFactory,
} from "../../src/tracker/worker/createNFTTrackerWorker";

/**
 * createNFTTrackerWorker's `signal` (#749): the caller bounds the init, which otherwise
 * waits for the worker's answer with no limit. Fake workers only, through the
 * `__setWorkerFactory` seam: no WASM starts, so this file is not in THREADED.
 */

const CONFIG = { width: 640, height: 480, cameraParam: "/camera_para.dat" };
const OPTS = { build: "default" as const, workerBase: "/dist/" };

/** A fake worker that answers init only when the test calls `answerInit()`. */
function fakeWorkers() {
  const workers: any[] = [];
  const factory = vi.fn(() => {
    const w: any = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      terminate: vi.fn(),
      postMessage: vi.fn(),
    };
    w.answerInit = () => {
      const msg = w.postMessage.mock.calls.find(
        (c: any[]) => c[0].type === "init",
      )?.[0];
      w.onmessage?.({
        data: {
          v: 1,
          id: msg.id,
          type: "ok",
          cameraMatrix: new Float64Array(16),
        },
      });
    };
    workers.push(w);
    return w;
  });
  __setWorkerFactory(factory);
  return { factory, workers };
}

afterEach(() => {
  __setWorkerFactory(null);
});

describe("createNFTTrackerWorker signal (#749)", () => {
  it("an aborted signal rejects before a worker starts", async () => {
    const { factory } = fakeWorkers();
    const c = new AbortController();
    c.abort();
    await expect(
      createNFTTrackerWorker(CONFIG, { ...OPTS, signal: c.signal }),
    ).rejects.toBe(c.signal.reason);
    expect(factory).not.toHaveBeenCalled();
  });

  it("abort during init terminates the worker and rejects with the reason", async () => {
    const { workers } = fakeWorkers();
    const c = new AbortController();
    const reason = new Error("mine");
    const created = createNFTTrackerWorker(CONFIG, {
      ...OPTS,
      signal: c.signal,
    });
    c.abort(reason);
    await expect(created).rejects.toBe(reason);
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it("AbortSignal.timeout rejects with a TimeoutError", async () => {
    const { workers } = fakeWorkers();
    await expect(
      createNFTTrackerWorker(CONFIG, {
        ...OPTS,
        signal: AbortSignal.timeout(20),
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it("a late init reply after the abort changes nothing", async () => {
    const { workers } = fakeWorkers();
    const c = new AbortController();
    const created = createNFTTrackerWorker(CONFIG, {
      ...OPTS,
      signal: c.signal,
    });
    c.abort();
    await expect(created).rejects.toBe(c.signal.reason);
    expect(() => workers[0].answerInit()).not.toThrow();
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it("an abort in the same tick as the init reply still rejects", async () => {
    // The reply settles the init first, the abort closes the wrapper right after: the call
    // must not resolve with a tracker that is already closed.
    const { workers } = fakeWorkers();
    const c = new AbortController();
    const reason = new Error("late");
    const created = createNFTTrackerWorker(CONFIG, {
      ...OPTS,
      signal: c.signal,
    });
    await Promise.resolve();
    workers[0].answerInit();
    c.abort(reason);
    await expect(created).rejects.toBe(reason);
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it("abort after init has no effect", async () => {
    const { workers } = fakeWorkers();
    const c = new AbortController();
    const created = createNFTTrackerWorker(CONFIG, {
      ...OPTS,
      signal: c.signal,
    });
    await Promise.resolve();
    workers[0].answerInit();
    const t = await created;
    c.abort();
    expect(workers[0].terminate).not.toHaveBeenCalled();
    void t.configure({});
    expect(
      workers[0].postMessage.mock.calls.some(
        (call: any[]) => call[0].type === "configure",
      ),
    ).toBe(true);
  });
});
