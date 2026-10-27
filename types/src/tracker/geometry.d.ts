import type { FrameGeometry, TargetInfo, TargetOrigin, Viewport } from "./types";
/**
 * D11: millimetres = px / dpi * 25.4. `dpi` is used as the core gives it (an int),
 * so the sizes inherit its truncation, exactly as consumers' own code does today.
 */
export declare function targetInfo(id: number, url: string, data: {
    width: number;
    height: number;
    dpi: number;
}, origin: TargetOrigin): TargetInfo;
/**
 * D11: post-multiplies the (column-major) pose by a translation of half the target's
 * size, so the pose origin moves from the corner to the centre. Returns a new matrix.
 * With pose = [R | t], the new translation is t + R * (w/2, h/2, 0).
 */
export declare function centerOrigin(pose: Float64Array, info: TargetInfo): Float64Array;
/**
 * D12, D17: starts from `cameraMatrix` (built for the processing frame) and maps it onto
 * the viewport. With a geometry it first undoes the camera side's letterbox and portrait
 * rotation, i.e. the inverse of `getProcessGeometry`; without one the processing frame
 * is the source. The geometry's `x` and `y` are ignored: the letterbox is taken to be
 * centred, as `getProcessGeometry` makes it, so scaling about the centre undoes it. Returns a new matrix. x terms are indices 0, 4, 8, 12 and y terms
 * 1, 5, 9, 13 (column-major).
 */
export declare function projectionFor(cameraMatrix: Float64Array, frameWidth: number, frameHeight: number, viewport: Viewport, geometry?: FrameGeometry): Float64Array;
