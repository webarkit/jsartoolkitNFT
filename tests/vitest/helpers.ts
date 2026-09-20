/**
 * Shared helpers for the Vitest browser specs.
 *
 * Fixture paths are served straight from the repository by Vite, so they are
 * the same files the examples use — no copies to keep in sync.
 */

export const CAMERA_PARAM = "/examples/Data/camera_para.dat";

/** Distinct NFT datasets. Two are needed to test incremental loading (#612). */
export const MARKER_PINBALL = "/examples/DataNFT/pinball";
export const MARKER_KUVA = "/examples/DataNFT/kuva";

export const VIDEO_WIDTH = 640;
export const VIDEO_HEIGHT = 480;

/**
 * A flat grey ImageData frame.
 *
 * `process()` expects RGBA pixel data rather than a canvas — passing a canvas
 * fails inside `_copyImageToHeap` when it reads `.data`. Nothing is detected in
 * a blank frame, which is fine: these specs assert that the frame pipeline runs
 * without throwing, not that tracking locks on.
 */
export function blankFrame(
  width: number = VIDEO_WIDTH,
  height: number = VIDEO_HEIGHT,
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("could not get a 2d context");
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Promise wrapper around the callback-style `loadNFTMarker`.
 *
 * The explicit timeout matters: when marker loading fails in the native layer
 * the exception surfaces inside an XHR callback and the success callback simply
 * never fires, so without this a failure would hang rather than report. That is
 * exactly the shape of #612.
 */
export function loadMarker(
  controller: any,
  url: string,
  timeoutMs = 45_000,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`loadNFTMarker('${url}') timed out — the callback never fired`)),
      timeoutMs,
    );
    controller.loadNFTMarker(
      url,
      (id: number) => {
        clearTimeout(timer);
        resolve(id);
      },
      (err: number) => {
        clearTimeout(timer);
        reject(new Error(`loadNFTMarker('${url}') failed: ${err}`));
      },
    );
  });
}
