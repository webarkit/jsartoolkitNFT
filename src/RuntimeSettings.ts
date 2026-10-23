/*
 *  RuntimeSettings.ts
 *  JSARToolKitNFT
 *
 *  This file is part of JSARToolKitNFT - WebARKit.
 *
 *  JSARToolKitNFT is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 */
import {
  IARToolKitNFTInstance,
  NFTRuntimeSettings,
  NFTRuntimeSettingsPatch,
} from "./abstractions/CommonInterfaces";

// The keys configure() accepts, with the JS type of each value. Anything else is a
// TypeError (D8): a typo such as `nearPlane`, or one of the square-marker keys #707
// deprecated (`threshold`, `thresholdMode`, `imageProcMode`, `debugMode`), would otherwise
// be dropped without a word, and #720's rule is that a request that cannot be honoured
// fails rather than being silently ignored.
// "integer" marks the fields that are int in the core (NFTRuntimeSettings.h).
type ValueKind = "number" | "integer" | "boolean";
const TOP_LEVEL_KEYS: Record<string, ValueKind> = {
  near: "number",
  far: "number",
  continuousDetection: "boolean",
  detectionInterval: "number",
  filtering: "boolean",
  logLevel: "integer",
};
const AR2_KEYS: Record<string, ValueKind> = {
  trackingThresh: "number",
  simThresh: "number",
  searchFeatureNum: "integer",
  templateSize1: "integer",
  templateSize2: "integer",
  searchSize: "integer",
};

function checkValue(key: string, value: unknown, kind: ValueKind): void {
  // Embind would coerce a wrong type (a string to NaN, 1 to true) instead of failing,
  // so the type is checked here, where the key can still be named.
  const type = kind === "integer" ? "number" : kind;
  if (typeof value !== type) {
    throw new TypeError(
      `configure(): "${key}" must be a ${kind}, got ${typeof value}`,
    );
  }
  // For an int field Embind truncates (3.5 becomes 3) instead of failing: the same silent
  // substitution as above, so a non-integer, NaN included, is refused here too.
  if (kind === "integer" && !Number.isInteger(value)) {
    throw new TypeError(
      `configure(): "${key}" must be an integer, got ${String(value)}`,
    );
  }
}

/**
 * Applies a runtime-settings patch to a native ARToolKitNFT instance (D8), for the
 * browser and Node wrappers alike:
 * 1. rejects unknown top-level and `ar2` keys, values of the wrong type, and
 *    non-integers for the fields that are int in the core, with a TypeError naming the
 *    key;
 * 2. deep-merges the patch into `getRuntimeSettings()`, `ar2` field by field (undefined
 *    values count as absent);
 * 3. calls the native `configure()` once, which validates everything and changes nothing
 *    on failure (D7);
 * 4. throws a RangeError when it refuses the values.
 *
 * The merged settings carry an explicit logLevel, the current one, which the core writes
 * only when it differs from the effective level, so a patch without `logLevel` leaves it
 * alone.
 */
export function applyRuntimeSettingsPatch(
  instance: IARToolKitNFTInstance,
  patch: NFTRuntimeSettingsPatch,
): void {
  if (patch === null || typeof patch !== "object") {
    throw new TypeError("configure(): the patch must be an object");
  }
  const merged: NFTRuntimeSettings = instance.getRuntimeSettings();

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === "ar2") {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError('configure(): "ar2" must be an object');
      }
      for (const [ar2Key, ar2Value] of Object.entries(value)) {
        if (ar2Value === undefined) continue;
        if (!Object.prototype.hasOwnProperty.call(AR2_KEYS, ar2Key)) {
          throw new TypeError(`configure(): unknown key "ar2.${ar2Key}"`);
        }
        checkValue(`ar2.${ar2Key}`, ar2Value, AR2_KEYS[ar2Key]);
        (merged.ar2 as any)[ar2Key] = ar2Value;
      }
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(TOP_LEVEL_KEYS, key)) {
      throw new TypeError(`configure(): unknown key "${key}"`);
    }
    checkValue(key, value, TOP_LEVEL_KEYS[key]);
    (merged as any)[key] = value;
  }

  if (instance.configure(merged) !== 0) {
    throw new RangeError(
      "configure(): the settings were refused, nothing was changed: " +
        JSON.stringify(merged),
    );
  }
}
