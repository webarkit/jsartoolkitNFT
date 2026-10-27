import type { AddTargetsOptions, FrameGeometry, FrameResult, NFTTrackerConfig, NFTTrackerPatch, SkippedFrame, TargetLoad, TrackerFrame, Viewport } from "../types";
import { type BuildName } from "./selectBuild";
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
    addNFTTargets(sources: string[], opts?: AddTargetsOptions): Promise<TargetLoad[]>;
    /**
     * Transfers the frame to the worker (D6): afterwards the caller's buffer is empty. A
     * `data` view that does not span its whole buffer, or a shared buffer, is copied
     * instead, and the caller keeps its buffer. Never throws: an invalid frame rejects.
     * A call made while another is in flight resolves `{ skipped: true }` at once, and
     * that frame is neither sent nor transferred (D13).
     */
    process(frame: TrackerFrame, timestampMs: number): Promise<FrameResult | SkippedFrame>;
    /** Runs on this thread from the cached cameraMatrix: no round trip (D13). */
    projectionFor(viewport: Viewport, geometry?: FrameGeometry): Float64Array;
    /**
     * Disposes the worker's tracker, then terminates the worker. Never rejects, and every
     * call returns the same Promise, which settles once the worker is terminated.
     */
    dispose(): Promise<void>;
}
type WorkerFactory = (url: string) => Worker;
/**
 * Replaces `new Worker(url, { type: "module" })`; `null` restores it. The tests start the
 * bundles from Blob URLs through it (D15).
 * @internal
 */
export declare function __setWorkerFactory(fn: WorkerFactory | null): void;
/**
 * Starts the chosen build's worker and creates its tracker. Rejects with the worker's own
 * error (a TypeError or RangeError keeps its class) if the config is refused.
 */
export declare function createNFTTrackerWorker(config: NFTTrackerConfig, opts?: NFTTrackerWorkerOptions): Promise<NFTTrackerWorker>;
export {};
