import { ARLogLevel } from "./abstractions/CommonInterfaces";
/**
 * Prints to the console when `level` is at or above the configured `current` level, the rule
 * the native loggers use: Debug is the most verbose setting, RelInfo the quietest, and a
 * message is emitted when its own level is >= the configured one.
 *
 * It exists for #677: the version line, the `[ARControllerNFT]` lines and `add nft marker
 * ids` were plain `console.*` calls, so `setLogLevel()` could not quieten them. Everything
 * but Error and RelInfo goes to `console.log`, RelInfo to `console.info` (the version line
 * always was an info), Warn to `console.warn` and Error to `console.error`.
 */
export declare function logAt(level: ARLogLevel, current: ARLogLevel | number, ...args: unknown[]): void;
