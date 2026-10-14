import { IARToolkitNFT } from "./abstractions/IARToolkitNFT";
import { INFTMarkerInfo, ARLogLevel } from "./abstractions/CommonInterfaces";
export declare class ARToolkitNFT implements IARToolkitNFT {
    /**
     * static properties
     */
    static get UNKNOWN_MARKER(): number;
    static get NFT_MARKER(): number;
    static ERROR_MARKER_INDEX_OUT_OF_BOUNDS: number;
    static AR_DEBUG_DISABLE: number;
    static AR_DEBUG_ENABLE: number;
    static AR_DEFAULT_DEBUG_MODE: number;
    static AR_DEFAULT_LABELING_THRESH: number;
    static AR_IMAGE_PROC_FRAME_IMAGE: number;
    static AR_IMAGE_PROC_FIELD_IMAGE: number;
    static AR_DEFAULT_IMAGE_PROC_MODE: number;
    static AR_MAX_LOOP_COUNT: number;
    static AR_LOOP_BREAK_THRESH: number;
    static AR_LOG_LEVEL_DEBUG: number;
    static AR_LOG_LEVEL_INFO: number;
    static AR_LOG_LEVEL_WARN: number;
    static AR_LOG_LEVEL_ERROR: number;
    static AR_LOG_LEVEL_REL_INFO: number;
    static AR_LABELING_THRESH_MODE_MANUAL: number;
    static AR_LABELING_THRESH_MODE_AUTO_MEDIAN: number;
    static AR_LABELING_THRESH_MODE_AUTO_OTSU: number;
    static AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE: number;
    static AR_MARKER_INFO_CUTOFF_PHASE_NONE: number;
    static AR_MARKER_INFO_CUTOFF_PHASE_PATTERN_EXTRACTION: number;
    static AR_MARKER_INFO_CUTOFF_PHASE_MATCH_GENERIC: number;
    static AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONTRAST: number;
    static AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_NOT_FOUND: number;
    static AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_EDC_FAIL: number;
    static AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONFIDENCE: number;
    static AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR: number;
    static AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR_MULTI: number;
    static AR_MARKER_INFO_CUTOFF_PHASE_HEURISTIC_TROUBLESOME_MATRIX_CODES: number;
    private instance;
    private module;
    private markerNFTCount;
    private cameraCount;
    private version;
    NFTMarkerInfo: {
        error: number;
        found: number;
        id: number;
        pose: Float64Array;
    };
    FS: any;
    malloc: any;
    free: any;
    videoFramePtr: number;
    videoLumaPtr: number;
    StringList: any;
    nftMarkers: any;
    /** The WASM heap view.
     * Read from the module on every access rather than cached: the build enables
     * ALLOW_MEMORY_GROWTH, and Emscripten replaces this typed array when the heap
     * grows, detaching any previously captured reference.
     */
    get HEAPU8(): any;
    /**
     * The ARToolkitNFT constructor. It has no arguments.
     * These properties are initialized:
     * - instance
     * - markerNFTCount
     * - cameraCount
     * - version
     * A message is displayed in the browser console during the intitialization, for example:
     * "ARToolkitNFT 1.5.0"
     */
    constructor();
    /**
     * Init the class injecting the Wasm Module, link the instanced methods and
     * create a global artoolkitNFT variable.
     * @return {object} the this object
     */
    init(): Promise<this>;
    setup(width: number, height: number, cameraId: number): number;
    teardown(): void;
    setupAR2(): void;
    /**
     * Enables or disables the square-marker detector's debug mode.
     * @deprecated Has no effect on NFT tracking: only the square-marker labeling
     * reads it, and NFT tracking never runs it. Will be removed in the next major
     * version (#659).
     * @param {boolean} mode true to enable debug mode, false to disable it
     */
    setDebugMode(mode: boolean): number;
    /**
     * Returns whether the square-marker detector's debug mode is enabled.
     * @deprecated Has no effect on NFT tracking: only the square-marker labeling
     * reads it, and NFT tracking never runs it. Will be removed in the next major
     * version (#659).
     * @return {boolean} true when debug mode is enabled
     */
    getDebugMode(): boolean;
    setFiltering(enableFiltering: boolean): void;
    setContinuousDetection(enabled: boolean): void;
    setDetectionInterval(ms: number): void;
    /**
     * Returns the Emscripten HEAP offset of the square-marker detector's
     * debug image.
     * @deprecated The image is never filled for NFT tracking: only the
     * square-marker labeling writes it, and NFT tracking never runs it. Will be
     * removed in the next major version (#659).
     * @return {number} HEAP offset of the debug image.
     */
    getProcessingImage(): number;
    detectNFTMarker(): number;
    getNFTMarker(markerIndex: number): INFTMarkerInfo;
    getNFTData(index: number): object;
    /**
     * Set the logging verbosity.
     *
     * Lower is more verbose: `ARLogLevel.Debug` (0) shows everything,
     * `ARLogLevel.RelInfo` (4) the least. The library starts at
     * `ARLogLevel.Info`.
     *
     * @param {ARLogLevel|number} level one of the ARLogLevel values.
     * Returns nothing: the native setter is `void`. Use `getLogLevel()` to read
     * back the effective level, which also reveals when a negative value was
     * rejected by the guard.
     */
    setLogLevel(level: ARLogLevel | number): void;
    getLogLevel(): number;
    setProjectionNearPlane(value: number): void;
    getProjectionNearPlane(): number;
    setProjectionFarPlane(value: number): void;
    getProjectionFarPlane(): number;
    /**
     * Sets the square-marker labeling threshold mode (auto/manual).
     * @deprecated Has no effect on NFT tracking: only the square-marker labeling
     * reads it, and NFT tracking never runs it. Will be removed in the next major
     * version (#659).
     * @param {number} mode One of the AR_LABELING_THRESH_MODE_* values.
     */
    setThresholdMode(mode: number): number;
    /**
     * Returns the square-marker labeling threshold mode.
     * @deprecated Has no effect on NFT tracking: only the square-marker labeling
     * reads it, and NFT tracking never runs it. Will be removed in the next major
     * version (#659).
     * @return {number} The current threshold mode.
     */
    getThresholdMode(): number;
    /**
     * Sets the square-marker labeling threshold.
     * @deprecated Has no effect on NFT tracking: only the square-marker labeling
     * reads it, and NFT tracking never runs it. Will be removed in the next major
     * version (#659).
     * @param {number} threshold An integer in the range [0,255] (inclusive).
     */
    setThreshold(threshold: number): number;
    /**
     * Returns the square-marker labeling threshold.
     * @deprecated Has no effect on NFT tracking: only the square-marker labeling
     * reads it, and NFT tracking never runs it. Will be removed in the next major
     * version (#659).
     * @return {number} The current threshold value.
     */
    getThreshold(): number;
    /**
     * Sets the square-marker detector's image processing mode (frame or
     * field).
     * @deprecated Has no effect on NFT tracking: only the square-marker labeling
     * reads it, and NFT tracking never runs it. Will be removed in the next major
     * version (#659).
     * @param {number} mode AR_IMAGE_PROC_FRAME_IMAGE or AR_IMAGE_PROC_FIELD_IMAGE.
     */
    setImageProcMode(mode: number): number;
    /**
     * Returns the square-marker detector's image processing mode.
     * @deprecated Has no effect on NFT tracking: only the square-marker labeling
     * reads it, and NFT tracking never runs it. Will be removed in the next major
     * version (#659).
     * @return {number} The current image processing mode.
     */
    getImageProcMode(): number;
    getCameraLens(): any;
    /**
     * Rebuilds the camera frustum from the near and far planes. The projection setters
     * only store the planes; they take effect on the next call to this method.
     */
    recalculateCameraLens(): void;
    passVideoData(videoFrame: Uint8ClampedArray, videoLuma: Uint8Array, lumaInternal: boolean): void;
    /**
     * Load the camera, this is an important and required step, Internally fill
     * the ARParam struct.
     * @param {Uint8Array|string} urlOrData: the camera parameter, usually a path to a .dat file
     * @return {Promise<number>} a promise that resolves to a number, the internal id.
     */
    loadCamera(urlOrData: Uint8Array | string): Promise<number>;
    /**
     * Load the NFT Markers (.fset, .iset and .fset3) in the code, Must be provided
     * the url of the file without the extension. If fails to load it raise an error.
     * @param {Array<string>} urls  array of urls of the descriptors files without ext
     * @param {function} callback the callback to retrieve the ids.
     * @param {function} onError2 the error callback.
     * @return {Array<number>} an array of ids.
     */
    addNFTMarkers(urls: Array<string | Array<string>>, callback: (filename: number[]) => void, onError2: (errorNumber: number) => void): Array<number>;
    /**
     * Used internally by the addNFTMarkers method
     * @param {string} url url of the marker.
     * @param {string} target the target of the marker.
     * @param {function} callback callback to get the binary data.
     * @param {function} errorCallback the error callback.
     * @param {string} prefix the prefix for the marker.
     */
    private ajax;
}
