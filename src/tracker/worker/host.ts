/**
 * The worker side of createNFTTrackerWorker (#720 D13): one same-thread NFTTracker in a
 * dedicated worker, driven by the messages of protocol.ts. Each build's entry
 * (host_default.ts, host_simd.ts, host_td.ts) calls runHost() with its own factory.
 */
import type { createTrackerFactory } from "../NFTTracker";
import type { NFTTracker } from "../types";
import { PROTOCOL_VERSION, type Request, type Response } from "./protocol";

/** The parts of the dedicated worker scope the host uses (tsconfig has no webworker lib). */
interface HostScope {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: Response): void;
}

/**
 * Installs `self.onmessage` and answers each request with one response of the same id.
 *
 * @param createNFTTracker the build's factory, created with `where = "worker"` so that
 * `{ create }` filters, which cannot cross postMessage, are refused (D3).
 * @param pthreadFile the threaded build's pthread worker file name. The host resolves it
 * against the `workerBase` of the init message and hands it to the Emscripten module as
 * `mainScriptUrlOrBlob` (D16), so the pthreads do not depend on this file's
 * `import.meta.url`, which is a Blob URL in the tests (D15) or a re-bundled URL in apps.
 */
export function runHost(
  createNFTTracker: ReturnType<typeof createTrackerFactory>,
  pthreadFile?: string,
): void {
  const scope = self as unknown as HostScope;
  /** Set by the init request; every other request waits for it. */
  let ready: Promise<NFTTracker> | null = null;
  /**
   * The last projection sent, kept so that the dispose answer can carry it: the tracker's
   * own `cameraMatrix` throws once it is disposed.
   */
  let matrix: Float64Array | undefined;

  function reply(message: Response): void {
    scope.postMessage(message);
  }

  async function handle(request: Request): Promise<Response> {
    const { id } = request;
    if (request.type === "init") {
      if (ready !== null)
        throw new Error("NFTTracker worker: already initialised");
      const moduleOptions =
        pthreadFile === undefined
          ? undefined
          : {
              mainScriptUrlOrBlob: new URL(pthreadFile, request.workerBase)
                .href,
            };
      ready = createNFTTracker(request.config, { moduleOptions });
      const tracker = await ready;
      matrix = tracker.cameraMatrix;
      return { v: PROTOCOL_VERSION, id, type: "ok", cameraMatrix: matrix };
    }

    if (ready === null) throw new Error("NFTTracker worker: not initialised");
    // A failed init rejects here too, with the init's own error.
    const tracker = await ready;
    switch (request.type) {
      case "configure":
        await tracker.configure(request.patch);
        matrix = tracker.cameraMatrix;
        return { v: PROTOCOL_VERSION, id, type: "ok", cameraMatrix: matrix };
      case "addNFTTargets": {
        const value = await tracker.addNFTTargets(
          request.sources,
          request.opts,
        );
        return { v: PROTOCOL_VERSION, id, type: "ok", value };
      }
      case "process": {
        const { frame } = request;
        try {
          const value = tracker.process(frame, request.timestampMs);
          return { v: PROTOCOL_VERSION, id, type: "ok", value };
        } finally {
          // The bitmap was transferred to this worker (D6), so nothing else frees it.
          if (
            typeof ImageBitmap !== "undefined" &&
            frame instanceof ImageBitmap
          )
            frame.close();
        }
      }
      case "dispose":
        // On the threaded build dispose() skips the native teardown(), which would block
        // (#695). The page-side wrapper terminates the worker after this answer, and that
        // frees the WASM memory.
        tracker.dispose();
        return { v: PROTOCOL_VERSION, id, type: "ok", cameraMatrix: matrix };
      default:
        throw new TypeError(
          `NFTTracker worker: unknown request type ${(request as { type: unknown }).type}`,
        );
    }
  }

  scope.onmessage = (event) => {
    const request = event.data;
    const id = request?.id;
    if (request?.v !== PROTOCOL_VERSION) {
      reply({
        v: PROTOCOL_VERSION,
        id,
        type: "error",
        name: "TypeError",
        message: `NFTTracker worker: protocol version ${request?.v}, expected ${PROTOCOL_VERSION}: the worker file and the library come from different releases`,
      });
      return;
    }
    // Requests are not serialised, as on the same thread: a process() may run while a
    // target is loading. Only init is awaited first.
    handle(request).then(reply, (e: unknown) => {
      // { name, message }, not the Error itself: a TypeError or RangeError keeps its name
      // across the boundary, and a non-cloneable error value cannot break the reply.
      const error =
        e instanceof Error
          ? { name: e.name, message: e.message }
          : { name: "Error", message: String(e) };
      reply({ v: PROTOCOL_VERSION, id, type: "error", ...error });
    });
  };
}
