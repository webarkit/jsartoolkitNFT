import type { TrackerFrame } from "./types";
/**
 * The RGBA pixels of a process() input (D6), for `passVideoData`.
 *
 * - `ImageData` and `{ data, width, height }`: the data is returned as is, with no copy;
 *   `passVideoData` copies it into the WASM heap.
 * - `ImageBitmap`: drawn to an `OffscreenCanvas` of the tracker's size and read back.
 *
 * The frame must have the tracker's size (D6, D17: the camera side fits the frame, not the
 * facade), otherwise this throws a `RangeError` naming both sizes. The data length is
 * checked too: the heap copy writes `data.length` bytes into a buffer sized for the
 * tracker's frame, so a longer array would overrun it and a shorter one leave stale pixels.
 */
export declare function copyFrame(frame: TrackerFrame, width: number, height: number): Uint8ClampedArray | Uint8Array;
