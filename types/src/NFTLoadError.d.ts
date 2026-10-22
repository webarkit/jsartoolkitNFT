export type NFTLoadErrorKind = "http" | "network" | "missing" | "format" | "rejected" | "argument";
/**
 * The one error type NFT marker loading rejects with. `kind` lets a caller
 * branch without parsing the message; `cause` is kept (not flattened into the
 * message) so the original fetch/Emscripten error stays inspectable.
 */
export declare class NFTLoadError extends Error {
    readonly name = "NFTLoadError";
    readonly kind: NFTLoadErrorKind;
    readonly url?: string;
    readonly status?: number;
    constructor(kind: NFTLoadErrorKind, message: string, opts?: {
        url?: string;
        status?: number;
        cause?: unknown;
    });
}
/**
 * The reason to reject with when a signal aborted. Older iOS (Safari 15.0 to
 * 15.3) has AbortController but no `AbortSignal.reason`, so `signal.reason`
 * is `undefined` there and `throw signal.reason` would throw `undefined`.
 * Fall back to the AbortError an abort carries everywhere else.
 */
export declare function abortReason(signal: AbortSignal): unknown;
/**
 * The legacy numeric error code: the HTTP status for an "http" failure, -1 for
 * anything else. Matches on `name` rather than `instanceof` so it still works
 * when two bundles each carry their own copy of the class.
 */
export declare function errorCode(err: unknown): number;
/**
 * Adapts a Promise to the deprecated onSuccess/onError callbacks. With no
 * callbacks the Promise is returned untouched (rejects normally). With
 * callbacks, a failure is reported through onError (or console.error when
 * there is none, so it is never swallowed silently) and the Promise resolves
 * `empty`, as the old callback API never threw. The callbacks run outside the
 * try/catch on the failure path of `work`, so a throw from the caller's own
 * onSuccess/onError rejects the Promise instead of being re-routed to onError.
 */
export declare function withCallbacks<T>(work: Promise<T>, onSuccess: ((v: T) => void) | undefined, onError: ((code: number) => void) | undefined, empty: T): Promise<T>;
