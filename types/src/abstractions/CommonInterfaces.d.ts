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
/**
 * The options `init()`, `initWithDimensions()`, `initWithImage()` and `customInit()` accept
 * (#677).
 */
export interface ARInitOptions {
    /**
     * The log level, applied to the fresh module before the core is constructed, so the native
     * start-up lines (the constructor, the camera dump) obey it too. Per controller in JS, as
     * every init builds its own module; `configure({ logLevel })` changes it later.
     *
     * The version line is logged at {@link ARLogLevel.RelInfo}, the quietest level, so it
     * still prints at `Error`. Only a level above `RelInfo` removes it.
     */
    logLevel?: ARLogLevel | number;
}
/**
 * The AR2 tracking parameters of {@link NFTRuntimeSettings}. Before runtime settings they
 * were constants of the native setupAR2(); the defaults are those constants.
 */
export interface NFTAR2Settings {
    /** Template-matching score cutoff, in (0, 100]. Default 5. */
    trackingThresh: number;
    /** Normalised similarity threshold, in (0, 1]. Default 0.5. Stored as float32. */
    simThresh: number;
    /** Features searched per frame, an integer in [3, 40], never clamped. Default 16. */
    searchFeatureNum: number;
    /** Template half-width in pixels, an integer in [1, 32]. Default 6. */
    templateSize1: number;
    /** Template half-height in pixels, an integer in [1, 32]. Default 6. */
    templateSize2: number;
    /**
     * Search window, an integer in [1, 64], or 0 for the build's choice (6, or 12 on a
     * multi-CPU threaded build). getRuntimeSettings() returns the resolved value.
     */
    searchSize: number;
}
/**
 * What may change while tracking (#720): read with `getRuntimeSettings()`, changed with
 * `configure()`. The names follow #720's TrackerConfig.
 */
export interface NFTRuntimeSettings {
    /** Near plane of the projection, > 0. Default 0.1. */
    near: number;
    /** Far plane of the projection, > near. Default 1000. */
    far: number;
    /** See `setContinuousDetection()`. Default true. */
    continuousDetection: boolean;
    /**
     * Milliseconds between detection passes while a marker is tracked (see
     * `setDetectionInterval()`), >= 0, or -1 for the build's default (300, or 0 on the
     * threaded build). getRuntimeSettings() returns the resolved value.
     */
    detectionInterval: number;
    /** Pose filtering. Every build constructs its controller with filtering on. */
    filtering: boolean;
    /**
     * The log level. It lives in the WASM module's globals, not in the core instance, and
     * each controller's init() creates its own module, so in JS it is per controller.
     */
    logLevel: ARLogLevel;
    ar2: NFTAR2Settings;
}
/**
 * What `configure()` accepts: any subset of {@link NFTRuntimeSettings}; nested `ar2` fields
 * merge one by one. An unknown key throws a TypeError.
 */
export type NFTRuntimeSettingsPatch = Partial<Omit<NFTRuntimeSettings, "ar2">> & {
    ar2?: Partial<NFTAR2Settings>;
};
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
    configure(settings: NFTRuntimeSettings): number;
    getRuntimeSettings(): NFTRuntimeSettings;
    _decompressZFT(prefix: string, prefixTemp: string): number;
    [key: string]: any;
}
export interface IARToolKitNFTInstanceConstructor {
    new (): IARToolKitNFTInstance;
    new (withFiltering: boolean): IARToolKitNFTInstance;
}
export interface ARToolkitNFTModule {
    ARToolKitNFT: IARToolKitNFTInstanceConstructor;
    /** Sets the module's log level, also before any instance exists; negative values are ignored. */
    setLogLevel(level: ARLogLevel | number): void;
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
