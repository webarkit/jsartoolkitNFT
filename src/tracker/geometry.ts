import type { FrameGeometry, TargetInfo, TargetOrigin, Viewport } from "./types";

const MM_PER_INCH = 25.4;

/**
 * D11: millimetres = px / dpi * 25.4. `dpi` is used as the core gives it (an int),
 * so the sizes inherit its truncation, exactly as consumers' own code does today.
 */
export function targetInfo(
  id: number,
  url: string,
  data: { width: number; height: number; dpi: number },
  origin: TargetOrigin,
): TargetInfo {
  return {
    id,
    url,
    widthPx: data.width,
    heightPx: data.height,
    dpi: data.dpi,
    widthMm: (data.width / data.dpi) * MM_PER_INCH,
    heightMm: (data.height / data.dpi) * MM_PER_INCH,
    origin,
  };
}

/**
 * D11: post-multiplies the (column-major) pose by a translation of half the target's
 * size, so the pose origin moves from the corner to the centre. Returns a new matrix.
 * With pose = [R | t], the new translation is t + R * (w/2, h/2, 0).
 */
export function centerOrigin(pose: Float64Array, info: TargetInfo): Float64Array {
  const out = new Float64Array(pose);
  const tx = info.widthMm / 2;
  const ty = info.heightMm / 2;
  out[12] = pose[12] + pose[0] * tx + pose[4] * ty;
  out[13] = pose[13] + pose[1] * tx + pose[5] * ty;
  out[14] = pose[14] + pose[2] * tx + pose[6] * ty;
  out[15] = pose[15] + pose[3] * tx + pose[7] * ty;
  return out;
}

/**
 * D12, D17: starts from `cameraMatrix` (built for the processing frame) and maps it onto
 * the viewport. With a geometry it first undoes the camera side's letterbox and portrait
 * rotation, i.e. the inverse of `getProcessGeometry`; without one the processing frame
 * is the source. The geometry's `x` and `y` are ignored: the letterbox is taken to be
 * centred, as `getProcessGeometry` makes it, so scaling about the centre undoes it. Returns a new matrix. x terms are indices 0, 4, 8, 12 and y terms
 * 1, 5, 9, 13 (column-major).
 */
export function projectionFor(
  cameraMatrix: Float64Array,
  frameWidth: number,
  frameHeight: number,
  viewport: Viewport,
  geometry?: FrameGeometry,
): Float64Array {
  const p = new Float64Array(cameraMatrix);
  const scaleX = (k: number) => {
    for (let c = 0; c < 4; c++) p[4 * c] *= k;
  };
  const scaleY = (k: number) => {
    for (let c = 0; c < 4; c++) p[4 * c + 1] *= k;
  };

  let sourceAspect: number;
  if (geometry) {
    // Undo the letterbox: the video fills only width x height of the frame.
    scaleX(frameWidth / geometry.width);
    scaleY(frameHeight / geometry.height);
    if (geometry.rotated) {
      // Undo the 90 degree portrait rotation: per column (x, y) -> (-y, x).
      // Same direction as ARnft's NFTWorker.dispatchProjectionMatrix (ARnft #344).
      for (let c = 0; c < 4; c++) {
        const x = p[4 * c];
        const y = p[4 * c + 1];
        p[4 * c] = -y;
        p[4 * c + 1] = x;
      }
    }
    sourceAspect = geometry.videoWidth / geometry.videoHeight;
  } else {
    sourceAspect = frameWidth / frameHeight;
  }

  const viewAspect = viewport.width / viewport.height;
  const cover = viewport.fit === "cover";
  if (viewAspect > sourceAspect) {
    // Viewport wider than the source: contain shrinks x, cover enlarges y.
    if (cover) scaleY(viewAspect / sourceAspect);
    else scaleX(sourceAspect / viewAspect);
  } else if (viewAspect < sourceAspect) {
    if (cover) scaleX(sourceAspect / viewAspect);
    else scaleY(viewAspect / sourceAspect);
  }
  return p;
}
