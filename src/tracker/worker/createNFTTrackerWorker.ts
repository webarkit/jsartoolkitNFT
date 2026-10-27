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

/**
 * Options of createNFTTrackerWorker. Not named `WorkerOptions`, which would shadow the DOM
 * type of the same name in a consumer's code.
 */
export interface NFTTrackerWorkerOptions {
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
   * Transfers the frame to the worker (D6): afterwards the caller's buffer is empty. A
   * `data` view that does not span its whole buffer, or a shared buffer, is copied
   * instead, and the caller keeps its buffer. Never throws: an invalid frame rejects.
   * A call made while another is in flight resolves `{ skipped: true }` at once, and
   * that frame is neither sent nor transferred (D13).
   */
  process(
    frame: TrackerFrame,
    timestampMs: number,
  ): Promise<FrameResult | SkippedFrame>;
  /** Runs on this thread from the cached cameraMatrix: no round trip (D13). */
  projectionFor(viewport: Viewport, geometry?: FrameGeometry): Float64Array;
  /**
   * Disposes the worker's tracker, then terminates the worker. Never rejects, and every
   * call returns the same Promise, which settles once the worker is terminated.
   */
  dispose(): Promise<void>;
}

const DISPOSED = "NFTTracker: disposed";

/**
 * D13 (amended 2026-10-27): how long dispose() waits for the worker's answer before it
 * terminates the worker anyway. A threaded worker that stops answering (seen under heavy
 * load in the test suite) must not hang dispose(); terminating it frees its memory either
 * way, so the answer is only a courtesy to the tracker's own cleanup.
 */
const DISPOSE_TIMEOUT_MS = 2000;

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

/**
 * Resolves a URL the page passed against the page, before it is posted. The worker would
 * resolve a relative URL against its own file in dist/ (or fail, from a Blob URL), so
 * without this the same config would load different files on the worker and on the same
 * thread, against the anti-goal of identical behaviour. The empty string and anything
 * that does not parse are left for the tracker to refuse.
 */
function pageUrl(url: string): string {
  if (url === "") return url;
  const base =
    typeof document !== "undefined" ? document.baseURI : location.href;
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

/** `filter.module` resolved against the page; every other filter form is unchanged. */
function withPageModule(filter: FilterConfig): FilterConfig {
  return typeof filter === "object" &&
    filter !== null &&
    "module" in filter &&
    typeof filter.module === "string"
    ? { ...filter, module: pageUrl(filter.module) }
    : filter;
}

/** The config with its string URLs resolved against the page (a Uint8Array is kept). */
function withPageUrls<T extends NFTTrackerPatch & { cameraParam?: unknown }>(
  config: T,
): T {
  if (typeof config !== "object" || config === null) return config;
  const out = { ...config };
  if (typeof out.cameraParam === "string")
    out.cameraParam = pageUrl(out.cameraParam);
  if ("filter" in out) out.filter = withPageModule(out.filter);
  return out;
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

/**
 * The process() message and its transfer list (D6). The frame is transferred, not copied,
 * when that is safe: an ImageBitmap, or `data` spanning the whole of a plain ArrayBuffer.
 * Otherwise `data` is copied and the copy transferred: transferring the buffer behind a
 * view of part of it would detach memory the caller still uses (a frame in a bigger
 * buffer, or in WebAssembly memory, whose buffer refuses to detach: a DataCloneError on
 * every frame), and a SharedArrayBuffer cannot be transferred at all.
 * Throws a TypeError for a frame that is not an object.
 */
function framePayload(frame: TrackerFrame): {
  message: Extract<Request, { type: "process" }>["frame"];
  transfer: Transferable[];
} {
  if (typeof ImageBitmap !== "undefined" && frame instanceof ImageBitmap) {
    return { message: frame, transfer: [frame] };
  }
  if (typeof frame !== "object" || frame === null) {
    throw new TypeError(
      "NFTTracker.process: the frame must be an ImageData, an ImageBitmap or { data, width, height }",
    );
  }
  const { data, width, height } = frame as Exclude<TrackerFrame, ImageBitmap>;
  // A missing or non-typed-array `data` is posted as is, for the tracker's own check to
  // refuse with its usual error.
  if (!ArrayBuffer.isView(data)) {
    return { message: { data, width, height }, transfer: [] };
  }
  const whole =
    data.buffer instanceof ArrayBuffer &&
    data.byteOffset === 0 &&
    data.byteLength === data.buffer.byteLength;
  const sent = whole ? data : data.slice();
  return { message: { data: sent, width, height }, transfer: [sent.buffer] };
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
  opts: NFTTrackerWorkerOptions = {},
): Promise<NFTTrackerWorker> {
  checkFilter(config?.filter);
  // Captured now: projectionFor must not follow later changes to the caller's object, which
  // the worker's tracker, created with these values, does not see either (D12).
  const width = config?.width;
  const height = config?.height;
  const build = selectBuild(opts.build ?? "auto", {
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    simd: supportsWasmSimd(),
  });
  // D4, the bundle-URL rule: next to the script that loaded this library. In the UMD
  // bundles `import.meta.url` is defined as the bundle's own URL. A relative workerBase
  // resolves against the page, as any URL the page passes. @vite-ignore: this is a
  // run-time folder URL, not an asset for Vite to emit.
  const workerBase = new URL(
    String(
      opts.workerBase ?? new URL(/* @vite-ignore */ ".", import.meta.url).href,
    ),
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
  /** The one dispose() Promise; every call returns it. */
  let disposing: Promise<void> | null = null;
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

  // A reply the page cannot deserialise is lost, so its request would never settle. Close
  // as for a crash, so that nothing hangs.
  worker.onmessageerror = () => {
    close(new Error("NFTTracker worker: a reply could not be deserialised"));
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
    const res = await send({
      type: "init",
      config: withPageUrls(config),
      workerBase,
    });
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
      const res = await send({
        type: "configure",
        patch: withPageUrls(patch),
      });
      matrix = res.cameraMatrix;
    },

    async addNFTTargets(
      sources: string[],
      opts?: AddTargetsOptions,
    ): Promise<TargetLoad[]> {
      check();
      // Resolved against the page, as the config's URLs (see pageUrl).
      const resolved = Array.isArray(sources)
        ? sources.map((u) => (typeof u === "string" ? pageUrl(u) : u))
        : sources;
      const res = await send({
        type: "addNFTTargets",
        sources: resolved,
        opts,
      });
      // One result per source, in order (G4): report each `url` as the caller passed it,
      // as on the same thread, not as resolved.
      return (res.value as TargetLoad[]).map((load, i) => {
        const url = sources[i];
        if (typeof url !== "string") return load;
        return load.status === "loaded"
          ? { ...load, info: { ...load.info, url } }
          : { ...load, url };
      });
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
      let payload: ReturnType<typeof framePayload>;
      try {
        payload = framePayload(frame);
      } catch (e) {
        // A Promise-returning call never throws synchronously, so callers handle one path.
        return Promise.reject(e);
      }
      inFlight = true;
      return send(
        { type: "process", frame: payload.message, timestampMs },
        payload.transfer,
      )
        .then((res) => res.value as FrameResult)
        .finally(() => {
          inFlight = false;
        });
    },

    projectionFor(viewport: Viewport, geometry?: FrameGeometry): Float64Array {
      check();
      return projectionFor(matrix, width, height, viewport, geometry);
    },

    dispose(): Promise<void> {
      // D13 (amended): one Promise for every call, settled only after terminate(). A caller
      // that awaits dispose() and then creates a new tracker must never have two workers
      // alive at once: on td each holds a 1 GB shared memory.
      if (disposing) return disposing;
      // Crashed, or closed by a failed reply: the worker is already terminated.
      if (closed) return (disposing = Promise.resolve());
      const done = send({ type: "dispose" });
      // Calls made from now on reject locally; requests already posted are answered first.
      const disposed = new Error(DISPOSED);
      closed = disposed;
      disposing = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<void>((resolve) => {
          timer = setTimeout(resolve, DISPOSE_TIMEOUT_MS);
        });
        try {
          // A bounded wait (D13, amended): see DISPOSE_TIMEOUT_MS. A worker that crashes or
          // answers with an error meanwhile is terminated all the same, so dispose() never
          // rejects: the caller has nothing left to clean up.
          await Promise.race([done.catch(() => {}), timeout]);
        } finally {
          clearTimeout(timer);
          // On the threaded build the tracker's dispose() skips the native teardown, which
          // would block (#695). Terminating the worker is what frees its WASM memory, on
          // every build. Anything still pending (an unanswered process()) is rejected with
          // the disposed error.
          close(disposed);
        }
      })();
      return disposing;
    },
  };
}
