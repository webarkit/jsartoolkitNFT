/**
 * The messages between the page-side wrapper (createNFTTrackerWorker) and the worker host
 * (host.ts) (#720 D13, G7). Every value is structured-cloneable, so the host is a thin relay
 * over the same-thread NFTTracker.
 *
 * Each request carries an `id`; the host answers it with one response of the same `id`.
 * `v` is the protocol version: a wrapper and a worker file from different releases must
 * not talk past each other silently.
 */
import type { AddTargetsOptions, NFTTrackerConfig, NFTTrackerPatch } from "../types";
export declare const PROTOCOL_VERSION = 1;
export type Request = {
    v: 1;
    id: number;
    type: "init";
    config: NFTTrackerConfig;
    /** The resolved URL of the folder holding the worker files (D4, D16). */
    workerBase: string;
} | {
    v: 1;
    id: number;
    type: "configure";
    patch: NFTTrackerPatch;
} | {
    v: 1;
    id: number;
    type: "addNFTTargets";
    sources: string[];
    opts?: AddTargetsOptions;
} | {
    v: 1;
    id: number;
    type: "process";
    /** Transferred, not copied (D6): an ImageBitmap, or the data's ArrayBuffer. */
    frame: ImageBitmap | {
        data: Uint8ClampedArray | Uint8Array;
        width: number;
        height: number;
    };
    /** The caller's time (D7). */
    timestampMs: number;
} | {
    v: 1;
    id: number;
    type: "dispose";
};
export type Response = {
    v: 1;
    id: number;
    type: "ok";
    value?: unknown;
    /** Sent with the init, configure and dispose answers (D13). */
    cameraMatrix?: Float64Array;
} | {
    v: 1;
    id: number;
    type: "error";
    /** The error's class name, e.g. "TypeError" or "RangeError", kept across the boundary. */
    name: string;
    message: string;
};
