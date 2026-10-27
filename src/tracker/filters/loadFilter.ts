import type { FilterConfig } from "../types";
import type { PoseFilter, PoseFilterModule } from "./PoseFilter";
import { createPoseFilter as createOneEuro } from "./oneEuro";

/** `null` means no JS filter (`'none'` and `'native'`). */
export type FilterFactory = (() => PoseFilter) | null;

/** True only for `'native'`: the core's own filter stays on. */
export function usesNativeFiltering(config: FilterConfig): boolean {
  return config === "native";
}

function wrap(url: string, reason: unknown): Error {
  const msg = reason instanceof Error ? reason.message : String(reason);
  return new Error(`pose filter module ${url}: ${msg}`);
}

/**
 * Resolve a FilterConfig to a factory of independent filters (one per marker, D3).
 * `where` says which side loads it: a function cannot cross postMessage (D3), so
 * `{ create }` is refused in a worker.
 */
export async function loadFilter(
  config: FilterConfig,
  where: "thread" | "worker",
): Promise<FilterFactory> {
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
