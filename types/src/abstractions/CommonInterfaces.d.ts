export interface ImageObj extends HTMLCanvasElement {
    videoWidth: number;
    width: number;
    videoHeight: number;
    height: number;
    data: Uint8ClampedArray;
}
export interface INFTMarkers {
    inPrevious: boolean;
    inCurrent: boolean;
    matrix: Float64Array;
    matrixGL_RH: Float64Array;
    markerWidth: number;
}
export interface INFTMarkerInfo {
    error: number;
    found: number;
    id: number;
    pose: Float64Array;
}
