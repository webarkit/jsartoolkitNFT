import type { FilterConfig } from "../types";
import type { PoseFilter, PoseFilterModule } from "./PoseFilter";
import { createPoseFilter as createOneEuro } from "./oneEuro";

/** `null` means no JS filter (`'none'` and `'native'`). */
export type FilterFactory = (() => PoseFilter) | null;

/** True only for `'native'`: the core's own filter stays on. */
export function usesNativeFiltering(config: FilterConfig): boolean {
  return config === "native";
}

/** The module's own error is kept as `cause`, and its message repeated in ours. */
function wrap(url: string, reason: unknown): Error {
  const msg = reason instanceof Error ? reason.message : String(reason);
  return new Error(`pose filter module ${url}: ${msg}`, { cause: reason });
}

const FILTER_FORMS =
  "'none', 'native', { type: 'oneEuro' }, { module } or { create }";

/**
 * Refuses a malformed FilterConfig with a TypeError naming the problem, before anything
 * loads (G6: a bad setting throws a clear error). Without it a misspelt string failed on
 * the `in` operator, `{}` as an import of `undefined`, and an unknown `type` was taken for
 * OneEuro.
 */
function checkFilterConfig(config: unknown): void {
  if (typeof config === "string") {
    if (config === "none" || config === "native") return;
    throw new TypeError(
      `filter: "${config}" is not a filter; use ${FILTER_FORMS}`,
    );
  }
  if (typeof config !== "object" || config === null) {
    throw new TypeError(`filter: ${String(config)} is not a filter; use ${FILTER_FORMS}`);
  }
  if ("type" in config) {
    const type = (config as { type: unknown }).type;
    if (type !== "oneEuro") {
      throw new TypeError(`filter: unknown type "${String(type)}"; the only type is 'oneEuro'`);
    }
    return;
  }
  if ("create" in config) {
    if (typeof (config as { create: unknown }).create !== "function") {
      throw new TypeError("filter: create must be a function returning a PoseFilter");
    }
    return;
  }
  if ("module" in config) {
    const url = (config as { module: unknown }).module;
    if (typeof url !== "string" || url === "") {
      throw new TypeError("filter: module must be a non-empty string, the module's URL");
    }
    return;
  }
  throw new TypeError(
    `filter: an object filter needs module, create or type; use ${FILTER_FORMS}`,
  );
}

/**
 * Resolve a FilterConfig to a factory of independent filters (one per target, D3).
 * `where` says which side loads it: a function cannot cross postMessage (D3), so
 * `{ create }` is refused in a worker.
 */
export async function loadFilter(
  config: FilterConfig,
  where: "thread" | "worker",
): Promise<FilterFactory> {
  checkFilterConfig(config);
  if (config === "none" || config === "native") return null;
  if ("type" in config) {
    return () => createOneEuro(config);
  }
  if ("create" in config) {
    if (where === "worker") {
      throw new TypeError(
        "filter.create is a function and cannot cross postMessage to a worker (D3); use { module } or run on the same thread",
      );
    }
    const { create, options } = config;
    return () => create(options);
  }
  const url = config.module;
  let mod: Partial<PoseFilterModule>;
  try {
    // @vite-ignore: Vite must leave this dynamic import alone, the URL is only known at runtime (D14).
    mod = await import(/* @vite-ignore */ url);
  } catch (e) {
    throw wrap(url, e);
  }
  if (typeof mod?.createPoseFilter !== "function") {
    throw new Error(`pose filter module ${url}: it does not export createPoseFilter`);
  }
  const make = mod.createPoseFilter;
  const options = config.options;
  // Validate eagerly (D14): a throwing factory rejects here, not on the first process().
  try {
    make(options);
  } catch (e) {
    throw wrap(url, e);
  }
  return () => make(options);
}
