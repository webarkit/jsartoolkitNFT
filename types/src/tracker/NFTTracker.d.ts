import type { ARToolkitNFTBase } from "../ARToolkitNFTBase";
import type { ARToolkitNFT as NodeToolkit } from "../ARToolkitNFT_node";
import type { NFTLoadErrorKind } from "../NFTLoadError";
import type { NFTTracker, NFTTrackerConfig } from "./types";
/** The variant class the facade sits on (D2): a browser build's ARToolkitNFT, or Node's. */
export type ToolkitClass = (new () => ARToolkitNFTBase | NodeToolkit) & {
    /** True on the threaded build: dispose() must not call teardown() (#695). */
    readonly teardownBlocksMainThread?: boolean;
};
/** One source's load, as the entry point's loader reports it (D10). */
export type TargetLoadOutcome = {
    id: number;
} | {
    errorKind: NFTLoadErrorKind | "unknown";
    message: string;
};
/**
 * Loads one source into the toolkit (D10). The browser and Node toolkits load differently
 * (Promise rejecting with NFTLoadError, versus a synchronous `tryAddNFTMarkers`), so each
 * entry point injects its own.
 */
export interface TargetLoader {
    load(toolkit: any, url: string, opts: {
        signal: AbortSignal;
        probeZFT?: boolean;
    }): Promise<TargetLoadOutcome>;
}
/**
 * Browser loader: `ARToolkitNFT.addNFTMarkers([url])`, Promise style, one source per call
 * (D10). It rejects with an NFTLoadError, matched on `name` rather than `instanceof`, as
 * errors from different bundles are different classes. `signal` is the tracker's: dispose()
 * aborts it, and addNFTMarkers checks it right before the native registration, so no
 * marker is registered on a torn-down core.
 */
export declare const browserTargetLoader: TargetLoader;
/**
 * Node loader: `ARToolkitNFT.tryAddNFTMarkers([prefix])`, synchronous, one source per call
 * (D10). It is wrapped in an async function so `addNFTTargets` stays asynchronous over the
 * synchronous Node loader. The sources are extension-less paths relative to the working
 * directory, as the Node toolkit accepts them. A thrown NFTLoadError is matched on `name`
 * rather than `instanceof`, as in the browser loader; anything else becomes "unknown".
 * It needs no signal: the load runs to its end before dispose() can run. Node has no .zft.
 */
export declare const nodeTargetLoader: TargetLoader;
/**
 * Binds the facade to one entry point's toolkit class and loader (D2). `where` says on
 * which side the filter is loaded: `{ create }` filters cannot cross postMessage (D3).
 * `init.moduleOptions` reaches the Emscripten factory; the threaded worker host uses it
 * for `mainScriptUrlOrBlob` (D16).
 */
export declare function createTrackerFactory(toolkitClass: ToolkitClass, loader: TargetLoader, where: "thread" | "worker"): (config: NFTTrackerConfig, init?: {
    moduleOptions?: Record<string, unknown>;
}) => Promise<NFTTracker>;
