import { IARToolKitNFTInstance, NFTRuntimeSettingsPatch } from "./abstractions/CommonInterfaces";
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
export declare function applyRuntimeSettingsPatch(instance: IARToolKitNFTInstance, patch: NFTRuntimeSettingsPatch): void;
