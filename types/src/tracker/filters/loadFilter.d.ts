import type { FilterConfig } from "../types";
import type { PoseFilter } from "./PoseFilter";
/** `null` means no JS filter (`'none'` and `'native'`). */
export type FilterFactory = (() => PoseFilter) | null;
/** True only for `'native'`: the core's own filter stays on. */
export declare function usesNativeFiltering(config: FilterConfig): boolean;
/**
 * Resolve a FilterConfig to a factory of independent filters (one per target, D3).
 * `where` says which side loads it: a function cannot cross postMessage (D3), so
 * `{ create }` is refused in a worker.
 */
export declare function loadFilter(config: FilterConfig, where: "thread" | "worker"): Promise<FilterFactory>;
