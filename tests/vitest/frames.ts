/**
 * Frames with two NFT targets in view, for the multi-marker suite.
 *
 * `examples/node/pinball-demo.jpg` is a photograph of a printed sheet that carries both
 * targets: the pinball artwork on the left and the kuva image on the right, rotated 90°.
 * So the photo itself is the two-marker frame, and "kuva leaves the frame" is the same
 * photo with the kuva print painted over.
 *
 *   +---------------------------------------+
 *   |    +----------+   +------------+      |
 *   |    | pinball  |   |    kuva    |      |   2000 x 1500
 *   |    |  print   |   |  (painted  |      |
 *   |    +----------+   |  over in   |      |
 *   |                   | pinballOnly)      |
 *   |                   +------------+      |
 *   +---------------------------------------+
 *
 * The names say "composite" for historical reasons: the frames are built on a canvas.
 *
 * `loadCompositeFrames(scale)` can draw the photo smaller (the KPM cost benchmark sweeps
 * frame sizes). Callers must size the controller from the returned `width` / `height`.
 * `COMPOSITE_WIDTH` / `COMPOSITE_HEIGHT` stay the full-scale size of the photo.
 */

export const COMPOSITE_WIDTH = 2000;
export const COMPOSITE_HEIGHT = 1500;

const PHOTO = "/examples/node/pinball-demo.jpg";

/**
 * Corners of the kuva print in the full-scale photo, clockwise from top-left, in pixels, plus a small
 * margin. The pinball print's right edge is close to this quad's left edge (a gap of only
 * 10-25 px), so the left side carries almost no margin.
 */
const KUVA_PRINT: ReadonlyArray<readonly [number, number]> = [
  [1128, 380],
  [1705, 452],
  [1705, 1165],
  [1096, 1100],
];

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not fetch ${url}: ${response.status}`);
  return response;
}

export async function loadCompositeFrames(
  scale = 1,
): Promise<{ both: ImageData; pinballOnly: ImageData; width: number; height: number }> {
  const photo = await createImageBitmap(await (await fetchOk(PHOTO)).blob());
  if (photo.width !== COMPOSITE_WIDTH || photo.height !== COMPOSITE_HEIGHT) {
    throw new Error(`${PHOTO} is ${photo.width}x${photo.height}, expected ${COMPOSITE_WIDTH}x${COMPOSITE_HEIGHT}`);
  }

  const width = Math.round(COMPOSITE_WIDTH * scale);
  const height = Math.round(COMPOSITE_HEIGHT * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("could not get a 2d context");

  if (scale === 1) {
    ctx.drawImage(photo, 0, 0);
  } else {
    ctx.drawImage(photo, 0, 0, width, height);
  }
  const both = ctx.getImageData(0, 0, width, height);

  // Paint the kuva print out with a flat, featureless fill.
  ctx.fillStyle = "#d9d4ca";
  ctx.beginPath();
  ctx.moveTo(KUVA_PRINT[0][0] * scale, KUVA_PRINT[0][1] * scale);
  for (const [x, y] of KUVA_PRINT.slice(1)) ctx.lineTo(x * scale, y * scale);
  ctx.closePath();
  ctx.fill();
  const pinballOnly = ctx.getImageData(0, 0, width, height);

  return { both, pinballOnly, width, height };
}

export function isFound(ar: any, index: number): boolean {
  return Boolean(ar.getNFTMarker(index)?.found);
}

/**
 * Push `frame` until `done()` holds, yielding between frames so the threaded
 * build's detection worker can run. Throws if it never holds.
 */
export async function processUntil(
  ar: any,
  frame: ImageData,
  done: () => boolean,
  maxFrames = 120,
): Promise<void> {
  for (let i = 0; i < maxFrames; i++) {
    ar.process(frame);
    if (done()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`condition not met after ${maxFrames} frames`);
}
