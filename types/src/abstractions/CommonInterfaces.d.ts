/**
 * Verbosity levels accepted by `setLogLevel()`.
 *
 * These mirror the `AR_LOG_LEVEL_*` enum in WebARKitLib's `ARUtil/log.h`, and a
 * message is emitted when its own level is >= the configured one — so `Debug`
 * is the most verbose setting and `RelInfo` the quietest. The library starts at
 * `Info`.
 *
 * The same values are also published as statics on `ARToolkitNFT`
 * (`AR_LOG_LEVEL_DEBUG` and friends), read from the WASM module at init. This
 * enum exists so the level can be named without an initialised instance.
 */
export declare enum ARLogLevel {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3,
    RelInfo = 4
}
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
/**
 * Event passed to listeners registered with ARControllerNFT.addEventListener().
 *
 * `name` is one of "getNFTMarker", "lostNFTMarker" or "load"; `target` is the
 * ARControllerNFT that dispatched it (typed as unknown because the four controller
 * classes share no common base type yet). `data` is absent for "load"; for
 * "getNFTMarker" and "lostNFTMarker" it holds `index` (marker index), `type`
 * (ARToolkitNFT.NFT_MARKER), `marker` (the NFTMarkerInfo struct), `matrix` and
 * `matrixGL_RH` (the pose, for "lostNFTMarker" the last one seen). Typing `data`
 * per event name is tracked in #730.
 */
export interface NFTEvent {
    name: string;
    target: unknown;
    data?: object;
}
/** Callback accepted by ARControllerNFT.addEventListener() and removeEventListener(). */
export type NFTEventListener = (event: NFTEvent) => void;
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
    passVideoData(videoFramePtr: number, videoLumaPtr: number, lumaInternal: boolean): void;
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
    setLogLevel(level: ARLogLevel | number): void;
    getLogLevel(): number;
    setFiltering(enableFiltering: boolean): void;
    setContinuousDetection(enabled: boolean): void;
    setDetectionInterval(ms: number): void;
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
    _malloc: any;
    _free: any;
    HEAPU8: Uint8Array;
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
export interface ARToolkitNFTNodeModule extends ARToolkitNFTModule {
    NODEFS: any;
}
/** Options for the Promise-based NFT marker loaders. */
export interface NFTLoadOptions {
    /**
     * Cancels the in-flight fetches. In Promise style, the load rejects with
     * `signal.reason`, unwrapped (with callbacks, an abort resolves `[]` and
     * calls `onError(-1)`): an `AbortError` by default, or a `TimeoutError` for
     * `AbortSignal.timeout()`.
     */
    signal?: AbortSignal;
    /** Probe for the optional .zft file before loading it. */
    probeZFT?: boolean;
}
