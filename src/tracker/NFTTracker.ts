import type { ARToolkitNFTBase } from "../ARToolkitNFTBase";
// Type-only: the Node class must stay out of the browser bundles.
import type { ARToolkitNFT as NodeToolkit } from "../ARToolkitNFT_node";
import type { NFTLoadErrorKind } from "../NFTLoadError";
import type {
  INFTMarkerInfo,
  NFTRuntimeSettingsPatch,
} from "../abstractions/CommonInterfaces";
import { arglCameraViewRHf, transMatToGLMat } from "../poseMath";
import { copyFrame } from "./frame";
import { FoundLost } from "./foundLost";
import { centerOrigin, projectionFor, targetInfo } from "./geometry";
import {
  loadFilter,
  usesNativeFiltering,
  type FilterFactory,
} from "./filters/loadFilter";
import type { PoseFilter } from "./filters/PoseFilter";
import type {
  AddTargetsOptions,
  FilterConfig,
  FrameGeometry,
  FrameResult,
  NFTTracker,
  NFTTrackerConfig,
  NFTTrackerPatch,
  TargetInfo,
  TargetLoad,
  TargetLoadReason,
  TargetResult,
  TrackerFrame,
  Transition,
  Viewport,
} from "./types";

/** The variant class the facade sits on (D2): a browser build's ARToolkitNFT, or Node's. */
export type ToolkitClass = (new () => ARToolkitNFTBase | NodeToolkit) & {
  /** True on the threaded build: dispose() must not call teardown() (#695). */
  readonly teardownBlocksMainThread?: boolean;
};

/** One source's load, as the entry point's loader reports it (D10). */
export type TargetLoadOutcome =
  { id: number } | { errorKind: NFTLoadErrorKind | "unknown"; message: string };

/**
 * Loads one source into the toolkit (D10). The browser and Node toolkits load differently
 * (Promise rejecting with NFTLoadError, versus a synchronous `tryAddNFTMarkers`), so each
 * entry point injects its own.
 */
export interface TargetLoader {
  load(
    toolkit: any,
    url: string,
    opts: { signal: AbortSignal; probeZFT?: boolean },
  ): Promise<TargetLoadOutcome>;
}

/** The core's limit on markers per toolkit (PAGES_MAX). */
const MAX_TARGETS = 20;

const DISPOSED = "NFTTracker: disposed";

/** Keys the facade handles itself; the rest of NFTTrackerSettings goes to the core. */
const FACADE_KEYS = new Set(["lostTimeout", "filter", "logLevel"]);
const CORE_KEYS = new Set([
  "near",
  "far",
  "continuousDetection",
  "detectionInterval",
  "ar2",
]);
const CONFIG_KEYS = new Set(["width", "height", "cameraParam"]);

/** The core's configure() refuses a level above RelInfo (4); setLogLevel() takes any (D18). */
const MAX_CORE_LOG_LEVEL = 4;

const DEFAULT_LOST_TIMEOUT_MS = 200;

/**
 * The luma argument of passVideoData. With lumaInternal = true the core computes the luma
 * in WASM and never reads it (D9b), so a zero-length array is enough.
 */
const EMPTY_LUMA = new Uint8Array(0);

/**
 * A loader's caught error as a failed outcome (D10), shared by both loaders so the
 * mapping lives in one place. An NFTLoadError is matched on `name` rather than
 * `instanceof`, as errors from different bundles are different classes.
 */
function outcomeFromError(e: unknown): {
  errorKind: NFTLoadErrorKind | "unknown";
  message: string;
} {
  const err = e as {
    name?: string;
    kind?: NFTLoadErrorKind;
    message?: string;
  };
  if (err?.name === "NFTLoadError" && err.kind) {
    return { errorKind: err.kind, message: err.message ?? "" };
  }
  return { errorKind: "unknown", message: err?.message ?? String(e) };
}

/**
 * Browser loader: `ARToolkitNFT.addNFTMarkers([url])`, Promise style, one source per call
 * (D10). It rejects with an NFTLoadError, matched on `name` rather than `instanceof`, as
 * errors from different bundles are different classes. `signal` is the tracker's: dispose()
 * aborts it, and addNFTMarkers checks it right before the native registration, so no
 * marker is registered on a torn-down core.
 */
export const browserTargetLoader: TargetLoader = {
  async load(toolkit, url, { signal, probeZFT }) {
    try {
      // No callbacks: the Promise style, which rejects on a failure. The options come
      // fourth, after the deprecated callback and onError.
      const ids: number[] = await toolkit.addNFTMarkers([url], undefined, undefined, {
        signal,
        probeZFT,
      });
      return { id: ids[0] };
    } catch (e) {
      return outcomeFromError(e);
    }
  },
};

/**
 * Node loader: `ARToolkitNFT.tryAddNFTMarkers([prefix])`, synchronous, one source per call
 * (D10). It is wrapped in an async function so `addNFTTargets` stays asynchronous over the
 * synchronous Node loader. The sources are extension-less paths relative to the working
 * directory, as the Node toolkit accepts them. A thrown NFTLoadError is matched on `name`
 * rather than `instanceof`, as in the browser loader; anything else becomes "unknown".
 * It needs no signal: the load runs to its end before dispose() can run. Node has no .zft.
 */
export const nodeTargetLoader: TargetLoader = {
  async load(toolkit, url) {
    try {
      const ids: number[] = toolkit.tryAddNFTMarkers([url]);
      return { id: ids[0] };
    } catch (e) {
      return outcomeFromError(e);
    }
  },
};

/**
 * Throws a TypeError on a key outside NFTTrackerSettings (plus `extra`). `filtering` gets
 * its own message: the facade has one way to say it, `filter` (D18).
 */
function checkKeys(patch: object, extra: Set<string> | null): void {
  if (patch === null || typeof patch !== "object") {
    throw new TypeError("NFTTracker: the settings must be an object");
  }
  for (const key of Object.keys(patch)) {
    if (key === "filtering") {
      throw new TypeError(
        '"filtering" is not a tracker setting: use "filter" (D18)',
      );
    }
    if (!FACADE_KEYS.has(key) && !CORE_KEYS.has(key) && !extra?.has(key)) {
      throw new TypeError(`NFTTracker: unknown setting "${key}"`);
    }
  }
}

function checkLostTimeout(value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError('NFTTracker: "lostTimeout" must be a finite number');
  }
  if (value < 0) {
    throw new RangeError(
      `NFTTracker: "lostTimeout" must be >= 0, got ${value}`,
    );
  }
}

/** The facade accepts any level >= 0, as setLogLevel() does (D18). */
function checkLogLevel(value: unknown): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError('NFTTracker: "logLevel" must be an integer');
  }
  if (value < 0) {
    throw new RangeError(`NFTTracker: "logLevel" must be >= 0, got ${value}`);
  }
}

/** The core part of a patch: the keys the core's configure() knows. */
function corePart(patch: NFTTrackerPatch): NFTRuntimeSettingsPatch {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (CORE_KEYS.has(key)) out[key] = value;
  }
  return out as NFTRuntimeSettingsPatch;
}

/**
 * NFTLoadError.kind to TargetLoad.reason (D10). `rejected` is the native registration
 * refusing the marker: at the 20-marker limit that is capacity, otherwise the dataset
 * (.fset/.iset/.fset3) is most likely unreadable, which the core does not tell apart.
 */
function reasonFor(
  outcome: { errorKind: NFTLoadErrorKind | "unknown"; message: string },
  loadedCount: number,
): { reason: TargetLoadReason; message: string } {
  switch (outcome.errorKind) {
    case "http":
    case "network":
    case "missing":
      return { reason: "network", message: outcome.message };
    case "format":
      return { reason: "format", message: outcome.message };
    case "rejected":
      if (loadedCount >= MAX_TARGETS) {
        return { reason: "capacity", message: outcome.message };
      }
      return {
        reason: "unknown",
        message: `${outcome.message}: the dataset may be unreadable`,
      };
    default:
      // "argument" and anything the loader could not classify.
      return { reason: "unknown", message: outcome.message };
  }
}

/**
 * A JS filter's output as the pose the facade returns (G7: `Float64Array(16) | null`).
 * It must hold 16 values, or this throws a TypeError naming the count. It is always copied:
 * a filter may return an array it reuses on the next frame, or its input, and a caller
 * that keeps a frame's pose must not see it change.
 */
function filteredPose(out: ArrayLike<number>): Float64Array {
  const count = out?.length;
  if (count !== 16) {
    throw new TypeError(
      `NFTTracker.process: the pose filter returned ${count === undefined ? "no array" : `${count} values`}, a pose has 16`,
    );
  }
  return Float64Array.from(out);
}

class Tracker implements NFTTracker {
  private toolkit: any;
  private readonly width: number;
  private readonly height: number;
  private readonly loader: TargetLoader;
  private readonly where: "thread" | "worker";
  private matrix: Float64Array;
  private disposed = false;
  /** See dispose(): the threaded build's teardown() never returns (#695). */
  private readonly skipTeardown: boolean;

  /** Loaded targets by id, in load order. */
  private readonly targets = new Map<number, TargetInfo>();
  /** Per-target found/lost; process() feeds it. */
  private foundLost: FoundLost;
  /** Creates one JS filter per target; null for 'none' and 'native' (D3, D18). */
  private filterFactory: FilterFactory;
  /** The JS filter of each target, created lazily by process() and reset on lost (D3). */
  private filters = new Map<number, PoseFilter>();
  /**
   * Aborted by dispose(), before the native teardown: a load still downloading when the
   * tracker is disposed then never reaches the native registration, which would run on a
   * torn-down core.
   */
  private readonly loads = new AbortController();

  constructor(
    toolkit: any,
    width: number,
    height: number,
    loader: TargetLoader,
    where: "thread" | "worker",
    lostTimeoutMs: number,
    filterFactory: FilterFactory,
    skipTeardown: boolean,
  ) {
    this.toolkit = toolkit;
    this.skipTeardown = skipTeardown;
    this.width = width;
    this.height = height;
    this.loader = loader;
    this.where = where;
    this.foundLost = new FoundLost(lostTimeoutMs);
    this.filterFactory = filterFactory;
    this.matrix = Float64Array.from(toolkit.getCameraLens());
  }

  private check(): void {
    if (this.disposed) throw new Error(DISPOSED);
  }

  /** A copy: projectionFor() reads the cached matrix, which a caller must not change. */
  get cameraMatrix(): Float64Array {
    this.check();
    return Float64Array.from(this.matrix);
  }

  async configure(patch: NFTTrackerPatch): Promise<void> {
    this.check();
    checkKeys(patch, null);
    if ("lostTimeout" in patch) checkLostTimeout(patch.lostTimeout);
    const level = patch.logLevel;
    if (level !== undefined) checkLogLevel(level);

    // Load a new filter before anything is swapped, so a failure leaves the old one
    // in place and changes nothing.
    let factory: FilterFactory | undefined;
    if (patch.filter !== undefined) {
      factory = await loadFilter(patch.filter, this.where);
      // dispose() may have run while the module loaded.
      this.check();
    }

    const core: NFTRuntimeSettingsPatch = corePart(patch);
    // Native filtering only for 'native', so poses are never filtered twice (D18).
    if (patch.filter !== undefined)
      core.filtering = usesNativeFiltering(patch.filter);
    // Levels 0-4 go through the core's configure(), validated with the rest; above 4 the
    // core refuses, so they go through setLogLevel() once the core has accepted the rest (D18).
    if (level !== undefined && level <= MAX_CORE_LOG_LEVEL)
      core.logLevel = level;
    if (Object.keys(core).length > 0) {
      this.toolkit.configure(core);
      // near/far rebuild the projection in the core.
      this.matrix = Float64Array.from(this.toolkit.getCameraLens());
    }
    if (level !== undefined && level > MAX_CORE_LOG_LEVEL)
      this.toolkit.setLogLevel(level);

    if (factory !== undefined) {
      this.filterFactory = factory;
      // The old instances belong to the old filter; process() creates new ones lazily.
      this.filters = new Map();
    }
    if (patch.lostTimeout !== undefined)
      this.foundLost.lostTimeoutMs = patch.lostTimeout;
  }

  async addNFTTargets(
    sources: string[],
    opts?: AddTargetsOptions,
  ): Promise<TargetLoad[]> {
    this.check();
    if (!Array.isArray(sources)) {
      throw new TypeError("addNFTTargets: sources must be an array of URLs");
    }
    const origin = opts?.origin ?? "corner";
    const probeZFT = opts?.probeZFT;
    if (probeZFT !== undefined && typeof probeZFT !== "boolean") {
      throw new TypeError("addNFTTargets: probeZFT must be a boolean");
    }
    const results: TargetLoad[] = [];
    // One source at a time (D10): each gets its own result and a failure stays local
    // to it, which the core's all-or-nothing batch cannot give. KPM then rebuilds its
    // matcher once per source, acceptable for the few (at most 20) targets of a scene.
    for (const url of sources) {
      const outcome = await this.loader.load(this.toolkit, url, {
        signal: this.loads.signal,
        probeZFT,
      });
      // dispose() may have run during the load: it aborted it before any registration.
      this.check();
      if ("id" in outcome) {
        const data = this.toolkit.getNFTData(outcome.id) as {
          width: number;
          height: number;
          dpi: number;
        };
        const info = targetInfo(outcome.id, url, data, origin);
        this.targets.set(outcome.id, info);
        results.push({ status: "loaded", info });
      } else {
        const { reason, message } = reasonFor(outcome, this.targets.size);
        results.push({ status: "error", url, reason, message });
      }
    }
    return results;
  }

  process(frame: TrackerFrame, timestampMs: number): FrameResult {
    this.check();
    const started = performance.now();
    // D6: the frame must have the tracker's size; a wrong one throws RangeError here,
    // before anything reaches the core, so the next frame works as usual.
    const rgba = copyFrame(frame, this.width, this.height);
    // D9b: the WASM luma path (lumaInternal = true), so the luma argument is unused.
    this.toolkit.passVideoData(rgba, EMPTY_LUMA, true);
    this.toolkit.detectNFTMarker();

    // Two passes. The first reads every target and runs the filters, which may throw
    // (a filter's own error, or a wrong pose length); the second updates found/lost. A
    // filter that throws then leaves found/lost as it was, and no earlier target's edge
    // is consumed without being returned.
    const targets: TargetResult[] = [];
    for (const [id, info] of this.targets) {
      const marker = this.toolkit.getNFTMarker(id) as INFTMarkerInfo;
      const found = Boolean(marker.found);
      let pose: Float64Array | null = null;
      if (found) {
        // D9: the same conversion as the controller's matrixGL_RH (shared helpers).
        pose = arglCameraViewRHf(
          transMatToGLMat(marker.pose, new Float64Array(16)),
        );
        if (info.origin === "center") pose = centerOrigin(pose, info);
        // D3: one JS filter per target, created on its first tracked frame. The filters
        // are fed only tracked poses (D8). 'native' filtering happens in the core (D18).
        if (this.filterFactory !== null) {
          let filter = this.filters.get(id);
          if (filter === undefined) {
            filter = this.filterFactory();
            this.filters.set(id, filter);
          }
          pose = filteredPose(filter.filter(timestampMs, pose));
        }
      }
      // D8: `targets` is this frame's raw tracking (found is false and pose null within
      // the grace window); only the transitions are debounced by lostTimeout.
      targets.push({ id, found, pose, error: found ? marker.error : null });
    }
    const transitions: Transition[] = [];
    for (const { id, found } of targets) {
      const edge = this.foundLost.update(id, found, timestampMs);
      if (edge !== null) {
        transitions.push({ type: edge, id });
        // D3: a JS filter starts afresh after lost. The 'native' filter is reset by the
        // core itself, on its own first untracked frame (D18), which the facade cannot change.
        if (edge === "lost") this.filters.get(id)?.reset();
      }
    }
    return {
      time: timestampMs,
      processMs: performance.now() - started,
      targets,
      transitions,
    };
  }

  projectionFor(viewport: Viewport, geometry?: FrameGeometry): Float64Array {
    this.check();
    return projectionFor(
      this.matrix,
      this.width,
      this.height,
      viewport,
      geometry,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    // On the threaded build the native teardown() joins the detection thread from the
    // main thread and never returns (#695), so it is skipped: the WASM core then stays
    // allocated until the module goes away with the page (or, for the worker host, the
    // worker). The JS side is dropped either way.
    // try/finally: a teardown() that throws still leaves the tracker disposed, so a second
    // dispose() does not run it again on a half torn-down core, and later calls throw the
    // usual "disposed" error. The teardown error itself still reaches the caller.
    try {
      // First: a load still in flight sees the abort before its native registration, which
      // runs in the same synchronous step as its abort check (ARToolkitNFTBase.runBatch).
      this.loads.abort();
      if (!this.skipTeardown) this.toolkit.teardown();
    } finally {
      this.disposed = true;
      this.toolkit = null;
      this.targets.clear();
      this.filters.clear();
      this.filterFactory = null;
      this.foundLost = new FoundLost(0);
    }
  }
}

/**
 * Binds the facade to one entry point's toolkit class and loader (D2). `where` says on
 * which side the filter is loaded: `{ create }` filters cannot cross postMessage (D3).
 * `init.moduleOptions` reaches the Emscripten factory; the threaded worker host uses it
 * for `mainScriptUrlOrBlob` (D16).
 */
export function createTrackerFactory(
  toolkitClass: ToolkitClass,
  loader: TargetLoader,
  where: "thread" | "worker",
): (
  config: NFTTrackerConfig,
  init?: { moduleOptions?: Record<string, unknown> },
) => Promise<NFTTracker> {
  return async (config, init) => {
    checkKeys(config, CONFIG_KEYS);
    const { width, height, cameraParam } = config;
    if (!Number.isInteger(width) || width <= 0) {
      throw new RangeError(
        `createNFTTracker: width must be a positive integer, got ${width}`,
      );
    }
    if (!Number.isInteger(height) || height <= 0) {
      throw new RangeError(
        `createNFTTracker: height must be a positive integer, got ${height}`,
      );
    }
    if (
      cameraParam === undefined ||
      cameraParam === null ||
      cameraParam === ""
    ) {
      throw new TypeError("createNFTTracker: cameraParam is required");
    }
    const lostTimeout = config.lostTimeout ?? DEFAULT_LOST_TIMEOUT_MS;
    checkLostTimeout(lostTimeout);
    if (config.logLevel !== undefined) checkLogLevel(config.logLevel);
    // 'native' by default: every build constructs its core with filtering on, so the
    // facade's poses match the controller's out of the box (D18).
    const filter: FilterConfig = config.filter ?? "native";

    const skipTeardown = toolkitClass.teardownBlocksMainThread === true;
    const toolkit: any = new toolkitClass();
    // init() applies any level >= 0 before the core is constructed, so no setLogLevel
    // detour is needed here (D18).
    await toolkit.init({
      logLevel: config.logLevel,
      moduleOptions: init?.moduleOptions,
    });
    try {
      // In the try, so that a camera that fails to load or set up is cleaned up as well.
      // teardown() is safe before setup(): the native destructor runs it on any instance.
      const cameraId = await toolkit.loadCamera(cameraParam);
      toolkit.setup(width, height, cameraId);
      // As the controller's _initNFT(): without the AR2 tracker handle the core refuses
      // every marker, and configure({ ar2 }) has nothing to apply to.
      toolkit.setupAR2();
      toolkit.configure({
        ...corePart(config),
        filtering: usesNativeFiltering(filter),
      });
      const factory = await loadFilter(filter, where);
      return new Tracker(
        toolkit,
        width,
        height,
        loader,
        where,
        lostTimeout,
        factory,
        skipTeardown,
      );
    } catch (e) {
      // A camera that fails, a refused setting or a filter that fails to load: free what
      // init() and setup() allocated, except on the threaded build, whose teardown() never
      // returns (#695).
      if (!skipTeardown) toolkit.teardown();
      throw e;
    }
  };
}
