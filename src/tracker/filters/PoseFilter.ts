/**
 * Custom filter module contract (D14). A module exports `createPoseFilter`,
 * which returns one PoseFilter; the facade creates one filter per target.
 *
 * - A module MUST export `createPoseFilter`; loading rejects with an `Error` naming the
 *   module URL when it is missing, when the module fails to load, or when it throws.
 * - `filter(timeMs, pose)` gets the 16-value pose and returns the filtered 16 values.
 *   Returning any other count makes process() throw a TypeError. The tracker copies the
 *   result, so a filter may return its input or an array it reuses on the next call.
 *   The tracker calls `reset()` when the target is lost.
 * - Under COEP (cross-origin isolation, needed by the threaded builds), a module served
 *   from another origin needs CORS plus `Cross-Origin-Resource-Policy` headers; a
 *   same-origin module needs nothing.
 * - See `examples/filters/average-filter.js` for a template to copy.
 */
export interface PoseFilter {
  filter(timeMs: number, pose: Float64Array): Float64Array;
  reset(): void;
}
export interface PoseFilterModule {
  createPoseFilter(options: unknown): PoseFilter;
}
