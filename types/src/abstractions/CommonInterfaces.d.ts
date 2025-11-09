export interface IImageObj extends HTMLCanvasElement {
    videoWidth: number;
    width: number;
    videoHeight: number;
    height: number;
    data: Uint8ClampedArray;
}
export interface INFTMarker {
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
export interface NftMarker {
    id: number;
    name: string;
    data?: any;
}
export type NftMarkers = NftMarker[];
export interface EmscriptenFS {
    readFile(path: string, opts?: {
        encoding?: "binary" | "utf8";
        flags?: string;
    }): Uint8Array | string;
    writeFile(path: string, data: string | ArrayBufferView, opts?: {
        flags?: string;
        encoding?: string;
    }): void;
    unlink(path: string): void;
    [key: string]: any;
}
export interface EmscriptenStringList {
    size(): number;
    get(index: number): string;
    push_back(value: string): void;
    delete(): void;
    [key: string]: any;
}
export interface EmscriptenStringListConstructor {
    new (): EmscriptenStringList;
}
export interface IARToolKitNFTInstance {
    setup(width: number, height: number, cameraId: number): number;
    teardown(): void;
    setupAR2(): void;
    passVideoData(videoFrame: Uint8ClampedArray, videoLuma: Uint8Array, lumaInternal: boolean): void;
    detectNFTMarker(): number;
    getNFTMarker(markerIndex: number): any;
    getNFTData(index: number): object;
    _addNFTMarkers(markers: EmscriptenStringList): number;
    _loadCamera(cameraParam: string): number;
    getCameraLens(): any;
    recalculateCameraLens(): void;
    setProjectionNearPlane(value: number): void;
    getProjectionNearPlane(): number;
    setProjectionFarPlane(value: number): void;
    getProjectionFarPlane(): number;
    setThresholdMode(mode: number): number;
    getThresholdMode(): number;
    setThreshold(threshold: number): number;
    getThreshold(): number;
    setImageProcMode(mode: number): number;
    getImageProcMode(): number;
    getProcessingImage(): number;
    setDebugMode(mode: boolean): number;
    getDebugMode(): boolean;
    setLogLevel(mode: boolean): number;
    getLogLevel(): number;
    setFiltering(enableFiltering: boolean): void;
    _decompressZFT(prefix: string, prefixTemp: string): number;
    [key: string]: any;
}
export interface IARToolKitNFTInstanceConstructor {
    new (): IARToolKitNFTInstance;
    new (withFiltering: boolean): IARToolKitNFTInstance;
}
export interface ARToolkitNFTModule {
    ARToolKitNFT: IARToolKitNFTInstanceConstructor;
    FS: EmscriptenFS;
    StringList: EmscriptenStringListConstructor;
    nftMarkers: NftMarkers;
    ERROR_MARKER_INDEX_OUT_OF_BOUNDS: number;
    AR_DEBUG_DISABLE: number;
    AR_DEBUG_ENABLE: number;
    AR_DEFAULT_DEBUG_MODE: number;
    AR_DEFAULT_LABELING_THRESH: number;
    AR_IMAGE_PROC_FRAME_IMAGE: number;
    AR_IMAGE_PROC_FIELD_IMAGE: number;
    AR_DEFAULT_IMAGE_PROC_MODE: number;
    AR_MAX_LOOP_COUNT: number;
    AR_LOOP_BREAK_THRESH: number;
    AR_LOG_LEVEL_DEBUG: number;
    AR_LOG_LEVEL_INFO: number;
    AR_LOG_LEVEL_WARN: number;
    AR_LOG_LEVEL_ERROR: number;
    AR_LOG_LEVEL_REL_INFO: number;
    AR_LABELING_THRESH_MODE_MANUAL: number;
    AR_LABELING_THRESH_MODE_AUTO_MEDIAN: number;
    AR_LABELING_THRESH_MODE_AUTO_OTSU: number;
    AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE: number;
    AR_MARKER_INFO_CUTOFF_PHASE_NONE: number;
    AR_MARKER_INFO_CUTOFF_PHASE_PATTERN_EXTRACTION: number;
    AR_MARKER_INFO_CUTOFF_PHASE_MATCH_GENERIC: number;
    AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONTRAST: number;
    AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_NOT_FOUND: number;
    AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_EDC_FAIL: number;
    AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONFIDENCE: number;
    AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR: number;
    AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR_MULTI: number;
    AR_MARKER_INFO_CUTOFF_PHASE_HEURISTIC_TROUBLESOME_MATRIX_CODES: number;
}
