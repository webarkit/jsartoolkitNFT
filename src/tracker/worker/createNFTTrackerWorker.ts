/**
 * The page side of the worker tracker (#720 D13): the same API as NFTTracker, with the
 * tracker in a dedicated worker (host.ts) and every call relayed over protocol.ts.
 * The same implementation is exported by all three browser entry points; the build the
 * worker runs is chosen here, at run time (D4).
 */
import { projectionFor } from "../geometry";
import type {
  AddTargetsOptions,
  FilterConfig,
  FrameGeometry,
  FrameResult,
  NFTTrackerConfig,
  NFTTrackerPatch,
  SkippedFrame,
  TargetLoad,
  TrackerFrame,
  Viewport,
} from "../types";
import { PROTOCOL_VERSION, type Request, type Response } from "./protocol";
import {
  WORKER_FILES,
  selectBuild,
  supportsWasmSimd,
  type BuildName,
} from "./selectBuild";

export interface WorkerOptions {
  /** `"auto"` (the default) picks td, then simd, then default (D4). */
  build?: "auto" | BuildName;
  /**
   * The URL of the folder that holds the worker files (D4). Defaults to the folder of
   * the script that loaded this library; a re-bundled app normally passes it.
   */
  workerBase?: string | URL;
}

/** NFTTracker, relayed to a worker (D13). */
export interface NFTTrackerWorker {
  /** The projection for the processing frame, as last sent by the worker. */
  readonly cameraMatrix: Float64Array;
  configure(patch: NFTTrackerPatch): Promise<void>;
  addNFTTargets(
    sources: string[],
    opts?: AddTargetsOptions,
  ): Promise<TargetLoad[]>;
  /**
   * Transfers the frame to the worker (D6): afterwards the caller's buffer is empty.
   * A call made while another is in flight resolves `{ skipped: true }` at once, and
   * that frame is neither sent nor transferred (D13).
   */
  process(
    frame: TrackerFrame,
    timestampMs: number,
  ): Promise<FrameResult | SkippedFrame>;
  /** Runs on this thread from the cached cameraMatrix: no round trip (D13). */
  projectionFor(viewport: Viewport, geometry?: FrameGeometry): Float64Array;
  /** Disposes the worker's tracker, then terminates the worker. */
  dispose(): Promise<void>;
}

const DISPOSED = "NFTTracker: disposed";

type WorkerFactory = (url: string) => Worker;
const defaultWorkerFactory: WorkerFactory = (url) =>
  // The worker bundles are ES modules (D16).
  new Worker(url, { type: "module" });
let workerFactory: WorkerFactory = defaultWorkerFactory;

/**
 * Replaces `new Worker(url, { type: "module" })`; `null` restores it. The tests start the
 * bundles from Blob URLs through it (D15).
 * @internal
 */
export function __setWorkerFactory(fn: WorkerFactory | null): void {
  workerFactory = fn ?? defaultWorkerFactory;
}

/** D3: a function cannot cross postMessage, so `{ create }` is refused before posting. */
function checkFilter(filter: FilterConfig | undefined): void {
  if (typeof filter === "object" && filter !== null && "create" in filter) {
    throw new TypeError(
      "createNFTTrackerWorker: filter.create is a function and cannot cross postMessage to a worker (D3); use { module } or createNFTTracker on the same thread",
    );
  }
}

/** Rebuilds a worker error; a TypeError or RangeError keeps its class (protocol.ts). */
function toError(response: { name: string; message: string }): Error {
  const Ctor =
    response.name === "TypeError"
      ? TypeError
      : response.name === "RangeError"
        ? RangeError
        : Error;
  const error = new Ctor(response.message);
  if (error.name !== response.name) error.name = response.name;
  return error;
}

/** The request without the fields `send` adds. */
type Body = Request extends infer R
  ? R extends Request
    ? Omit<R, "v" | "id">
    : never
  : never;
type Ok = Extract<Response, { type: "ok" }>;

/**
 * Starts the chosen build's worker and creates its tracker. Rejects with the worker's own
 * error (a TypeError or RangeError keeps its class) if the config is refused.
 */
export async function createNFTTrackerWorker(
  config: NFTTrackerConfig,
  opts: WorkerOptions = {},
): Promise<NFTTrackerWorker> {
  checkFilter(config?.filter);
  const build = selectBuild(opts.build ?? "auto", {
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    simd: supportsWasmSimd(),
  });
  // D4, the bundle-URL rule: next to the script that loaded this library. In the UMD
  // bundles `import.meta.url` is defined as the bundle's own URL. A relative workerBase
  // resolves against the page, as any URL the page passes.
  const workerBase = new URL(
    String(opts.workerBase ?? new URL(".", import.meta.url).href),
    location.href,
  ).href;
  const worker = workerFactory(new URL(WORKER_FILES[build], workerBase).href);

  const pending = new Map<
    number,
    { resolve: (r: Ok) => void; reject: (e: unknown) => void }
  >();
  let nextId = 1;
  /** Set once disposed or crashed: every later call rejects with it. */
  let closed: Error | null = null;
  /** D13: one process() at a time. */
  let inFlight = false;
  let matrix: Float64Array;

  /** Rejects every pending request with `error` and stops the worker. */
  function close(error: Error): void {
    closed ??= error;
    worker.terminate();
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  }

  worker.onmessage = (event: MessageEvent<Response>) => {
    const response = event.data;
    const p = pending.get(response?.id);
    if (!p) return;
    pending.delete(response.id);
    if (response.type === "ok") p.resolve(response);
    else p.reject(toError(response));
  };
  // A crashed worker (a script that fails to load, a WASM abort) never answers: reject
  // everything instead of leaving Promises hanging. preventDefault(): the error is
  // reported through those rejections, not again as an uncaught page error.
  worker.onerror = (event: ErrorEvent) => {
    event.preventDefault();
    close(
      new Error(
        `NFTTracker worker: ${event.message || "the worker failed to start"}`,
      ),
    );
  };

  function send(body: Body, transfer: Transferable[] = []): Promise<Ok> {
    if (closed) return Promise.reject(closed);
    return new Promise<Ok>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ v: PROTOCOL_VERSION, id, ...body }, transfer);
      } catch (e) {
        // e.g. a DataCloneError for a frame whose buffer was already transferred.
        pending.delete(id);
        reject(e);
      }
    });
  }

  try {
    const res = await send({ type: "init", config, workerBase });
    matrix = res.cameraMatrix;
  } catch (e) {
    close(e instanceof Error ? e : new Error(String(e)));
    throw e;
  }

  const check = (): void => {
    if (closed) throw closed;
  };

  return {
    get cameraMatrix(): Float64Array {
      check();
      return matrix;
    },

    async configure(patch: NFTTrackerPatch): Promise<void> {
      check();
      checkFilter(patch?.filter);
      const res = await send({ type: "configure", patch });
      matrix = res.cameraMatrix;
    },

    async addNFTTargets(
      sources: string[],
      opts?: AddTargetsOptions,
    ): Promise<TargetLoad[]> {
      check();
      const res = await send({ type: "addNFTTargets", sources, opts });
      return res.value as TargetLoad[];
    },

    process(
      frame: TrackerFrame,
      timestampMs: number,
    ): Promise<FrameResult | SkippedFrame> {
      if (closed) return Promise.reject(closed);
      // D13: drop the frame, do not queue it. A camera produces frames faster than the
      // worker may answer, and a queue would only add latency; the next call after the
      // in-flight one resolves is processed.
      if (inFlight) return Promise.resolve({ skipped: true });
      // D6: the frame is transferred, not copied. A shared buffer cannot be transferred,
      // so it is copied instead.
      let message: Extract<Request, { type: "process" }>["frame"];
      let transfer: Transferable[];
      if (typeof ImageBitmap !== "undefined" && frame instanceof ImageBitmap) {
        message = frame;
        transfer = [frame];
      } else {
        const { data, width, height } = frame as Exclude<
          TrackerFrame,
          ImageBitmap
        >;
        message = { data, width, height };
        transfer = data?.buffer instanceof ArrayBuffer ? [data.buffer] : [];
      }
      inFlight = true;
      return send({ type: "process", frame: message, timestampMs }, transfer)
        .then((res) => res.value as FrameResult)
        .finally(() => {
          inFlight = false;
        });
    },

    projectionFor(viewport: Viewport, geometry?: FrameGeometry): Float64Array {
      check();
      return projectionFor(
        matrix,
        config.width,
        config.height,
        viewport,
        geometry,
      );
    },

    async dispose(): Promise<void> {
      if (closed) return;
      const done = send({ type: "dispose" });
      // Calls made from now on reject locally; requests already posted are answered first.
      closed = new Error(DISPOSED);
      try {
        await done;
      } finally {
        // On the threaded build the tracker's dispose() skips the native teardown, which
        // would block (#695). Terminating the worker is what frees its WASM memory, on
        // every build.
        close(closed);
      }
    },
  };
}
