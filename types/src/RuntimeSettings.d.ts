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
 * The merged settings carry logLevel -1, the core's "leave unchanged" sentinel, unless the
 * patch names a level. The effective level must not be copied in: setLogLevel() and
 * init({ logLevel }) accept any level, a level above RelInfo (4) included, while the core
 * validates only -1 or 0..4, so copying it back made every later patch, an empty one too,
 * throw. An explicit `logLevel` in the patch is held to the core's range (0..4, or -1 for
 * "unchanged") and refused with a RangeError otherwise, instead of being routed to
 * setLogLevel(): configure() is atomic (a refused patch changes nothing) and setLogLevel()
 * would be a second, separate write. A level above RelInfo is set with setLogLevel() or
 * the init option, and configure() keeps working at that level.
 */
export declare function applyRuntimeSettingsPatch(instance: IARToolKitNFTInstance, patch: NFTRuntimeSettingsPatch): void;
