export type NFTLoadErrorKind =
  "http" | "network" | "missing" | "format" | "rejected" | "argument";

/**
 * The one error type NFT marker loading rejects with. `kind` lets a caller
 * branch without parsing the message; `cause` is kept (not flattened into the
 * message) so the original fetch/Emscripten error stays inspectable.
 */
export class NFTLoadError extends Error {
  readonly name = "NFTLoadError";
  readonly kind: NFTLoadErrorKind;
  readonly url?: string;
  readonly status?: number;

  constructor(
    kind: NFTLoadErrorKind,
    message: string,
    opts?: { url?: string; status?: number; cause?: unknown },
  ) {
    super(message, { cause: opts?.cause });
    this.kind = kind;
    this.url = opts?.url;
    this.status = opts?.status;
  }
}

/**
 * The legacy numeric error code: the HTTP status for an "http" failure, -1 for
 * anything else. Matches on `name` rather than `instanceof` so it still works
 * when two bundles each carry their own copy of the class.
 */
export function errorCode(err: unknown): number {
  const e = err as NFTLoadError | undefined;
  return e?.name === "NFTLoadError" &&
    e.kind === "http" &&
    e.status !== undefined
    ? e.status
    : -1;
}

/**
 * Adapts a Promise to the deprecated onSuccess/onError callbacks. With no
 * callbacks the Promise is returned untouched (rejects normally). With
 * callbacks, a failure is reported through onError (or console.error when
 * there is none, so it is never swallowed silently) and the Promise resolves
 * `empty`, as the old callback API never threw. The callbacks run outside the
 * try/catch on the failure path of `work`, so a throw from the caller's own
 * onSuccess/onError rejects the Promise instead of being re-routed to onError.
 */
export async function withCallbacks<T>(
  work: Promise<T>,
  onSuccess: ((v: T) => void) | undefined,
  onError: ((code: number) => void) | undefined,
  empty: T,
): Promise<T> {
  if (!onSuccess && !onError) return work;
  let value: T;
  try {
    value = await work;
  } catch (e) {
    if (onError) onError(errorCode(e));
    else console.error(e);
    return empty;
  }
  onSuccess?.(value);
  return value;
}
