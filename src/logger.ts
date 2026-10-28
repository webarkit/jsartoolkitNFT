/*
 *  logger.ts
 *  JSARToolKitNFT
 *
 *  This file is part of JSARToolKitNFT - WebARKit.
 *
 *  JSARToolKitNFT is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 */
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
export function logAt(
  level: ARLogLevel,
  current: ARLogLevel | number,
  ...args: unknown[]
): void {
  if (level < current) return;
  switch (level) {
    case ARLogLevel.Error:
      console.error(...args);
      break;
    case ARLogLevel.Warn:
      console.warn(...args);
      break;
    case ARLogLevel.RelInfo:
      console.info(...args);
      break;
    default:
      console.log(...args);
  }
}
