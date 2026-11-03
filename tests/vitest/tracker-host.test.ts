import { describe, it, expect, vi } from "vitest";
import { runHost, type HostScope } from "../../src/tracker/worker/host";

/**
 * The worker host (#720 D13) driven directly, on the page thread (#753): a fake scope stands
 * for the worker's `self`, and a stub factory for the build's createNFTTracker. No WASM and
 * no worker start, so this file is not in THREADED. Running in the page, it is also what
 * gives host.ts its coverage (#762): the built worker bundles are not instrumented.
 */

const CONFIG = { width: 640, height: 480, cameraParam: "/camera_para.dat" };
const WORKER_BASE = "https://example.test/dist/";

function stubTracker() {
  return {
    cameraMatrix: new Float64Array(16).fill(1),
    configure: vi.fn(async () => {}),
    addNFTTargets: vi.fn(async () => []),
    process: vi.fn(() => ({ targets: [] })),
    dispose: vi.fn(),
  };
}

/** Installs the host on a fake scope; `send` resolves with the reply to its message. */
function start(factory: any, pthreadFile?: string) {
  const replies: any[] = [];
  const waiting: Array<(r: any) => void> = [];
  const scope: HostScope = {
    onmessage: null,
    postMessage(message) {
      const next = waiting.shift();
      if (next) next(message);
      else replies.push(message);
    },
  };
  runHost(factory, pthreadFile, scope);
  const send = (data: unknown): Promise<any> =>
    new Promise((resolve) => {
      waiting.push(resolve);
      scope.onmessage!({ data } as MessageEvent);
    });
  return { send, replies };
}

const init = (id = 1) => ({
  v: 1,
  id,
  type: "init",
  config: CONFIG,
  workerBase: WORKER_BASE,
});

describe("tracker worker host", () => {
  it("answers a protocol version mismatch with a TypeError", async () => {
    const factory = vi.fn(async () => stubTracker());
    const { send } = start(factory);
    const reply = await send({ ...init(), v: 2 });
    expect(reply).toMatchObject({ id: 1, type: "error", name: "TypeError" });
    expect(reply.message).toMatch(/protocol version 2, expected 1/);
    expect(factory).not.toHaveBeenCalled();
  });

  it("answers a non-object message with a version error", async () => {
    const { send } = start(vi.fn(async () => stubTracker()));
    const reply = await send(null);
    expect(reply).toMatchObject({
      id: undefined,
      type: "error",
      name: "TypeError",
    });
  });

  it("refuses a second init", async () => {
    const factory = vi.fn(async () => stubTracker());
    const { send } = start(factory);
    expect(await send(init(1))).toMatchObject({ id: 1, type: "ok" });
    expect(await send(init(2))).toMatchObject({
      id: 2,
      type: "error",
      message: "NFTTracker worker: already initialised",
    });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("refuses a request before init", async () => {
    const { send } = start(vi.fn(async () => stubTracker()));
    expect(
      await send({ v: 1, id: 1, type: "configure", patch: {} }),
    ).toMatchObject({
      id: 1,
      type: "error",
      message: "NFTTracker worker: not initialised",
    });
  });

  it("a failed init rejects later requests with its own error", async () => {
    const { send } = start(
      vi.fn(async () => {
        throw new RangeError("bad width");
      }),
    );
    expect(await send(init(1))).toMatchObject({
      id: 1,
      type: "error",
      name: "RangeError",
      message: "bad width",
    });
    expect(
      await send({ v: 1, id: 2, type: "configure", patch: {} }),
    ).toMatchObject({
      id: 2,
      type: "error",
      name: "RangeError",
      message: "bad width",
    });
  });

  it("refuses an unknown request type", async () => {
    const { send } = start(vi.fn(async () => stubTracker()));
    await send(init());
    const reply = await send({ v: 1, id: 3, type: "nope" });
    expect(reply).toMatchObject({ id: 3, type: "error", name: "TypeError" });
    expect(reply.message).toMatch(/unknown request type nope/);
  });

  it("passes the pthread file resolved against workerBase", async () => {
    const factory = vi.fn(async () => stubTracker());
    const { send } = start(factory, "NFTTracker_td.pthread.js");
    await send(init());
    expect(factory).toHaveBeenCalledWith(CONFIG, {
      moduleOptions: {
        mainScriptUrlOrBlob: WORKER_BASE + "NFTTracker_td.pthread.js",
      },
    });
  });

  it("dispose answers with the last cameraMatrix", async () => {
    const tracker = stubTracker();
    const { send } = start(vi.fn(async () => tracker));
    await send(init());
    const reply = await send({ v: 1, id: 2, type: "dispose" });
    expect(reply).toMatchObject({ id: 2, type: "ok" });
    expect(Array.from(reply.cameraMatrix)).toEqual(
      Array.from(tracker.cameraMatrix),
    );
    expect(tracker.dispose).toHaveBeenCalledTimes(1);
  });
});
