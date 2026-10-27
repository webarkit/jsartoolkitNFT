import type { TrackerFrame } from "./types";

function sizeError(w: number, h: number, width: number, height: number): RangeError {
  return new RangeError(
    `NFTTracker.process: the frame is ${w}x${h}, the tracker was created for ${width}x${height}`,
  );
}

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
export function copyFrame(
  frame: TrackerFrame,
  width: number,
  height: number,
): Uint8ClampedArray | Uint8Array {
  if (frame.width !== width || frame.height !== height) {
    throw sizeError(frame.width, frame.height, width, height);
  }
  if ("data" in frame) {
    const expected = width * height * 4;
    if (frame.data.length !== expected) {
      throw new RangeError(
        `NFTTracker.process: the frame data has ${frame.data.length} bytes, ${width}x${height} RGBA needs ${expected}`,
      );
    }
    return frame.data;
  }
  if (typeof ImageBitmap !== "undefined" && frame instanceof ImageBitmap) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("NFTTracker.process: could not get a 2d context");
    ctx.drawImage(frame, 0, 0);
    return ctx.getImageData(0, 0, width, height).data;
  }
  throw new TypeError(
    "NFTTracker.process: the frame must be an ImageData, an ImageBitmap or { data, width, height }",
  );
}
