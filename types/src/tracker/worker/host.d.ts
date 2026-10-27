/**
 * The worker side of createNFTTrackerWorker (#720 D13): one same-thread NFTTracker in a
 * dedicated worker, driven by the messages of protocol.ts. Each build's entry
 * (host_default.ts, host_simd.ts, host_td.ts) calls runHost() with its own factory.
 */
import type { createTrackerFactory } from "../NFTTracker";
/**
 * Installs `self.onmessage` and answers each request with one response of the same id.
 *
 * @param createNFTTracker the build's factory, created with `where = "worker"` so that
 * `{ create }` filters, which cannot cross postMessage, are refused (D3).
 * @param pthreadFile the threaded build's pthread worker file name. The host resolves it
 * against the `workerBase` of the init message and hands it to the Emscripten module as
 * `mainScriptUrlOrBlob` (D16), so the pthreads do not depend on this file's
 * `import.meta.url`, which is a Blob URL in the tests (D15), or wherever an app copied or
 * rehosted the worker file.
 */
export declare function runHost(createNFTTracker: ReturnType<typeof createTrackerFactory>, pthreadFile?: string): void;
