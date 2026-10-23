import { IARToolkitNFT_node } from "./abstractions/IARToolkitNFT_node";
import { INFTMarkerInfo, ARLogLevel, NFTRuntimeSettings, NFTRuntimeSettingsPatch, ARInitOptions } from "./abstractions/CommonInterfaces";
export declare class ARToolkitNFT implements IARToolkitNFT_node {
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
    private cameraCount;
    private nodefsMounted;
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
     * - cameraCount
     * - version
     * A message is displayed in the console during init(), for example:
     * "ARToolkitNFT 1.5.0" (it moved there from the constructor, #677).
     */
    constructor();
    /**
     * Init the class injecting the Wasm Module and link the instanced methods.
     * Every call builds its own module, so each ARToolkitNFT has its own heap
     * and filesystem.
     * @param options `logLevel` is applied to the fresh module before the core is
     * constructed (#677, D10), so the start-up lines follow it.
     * @return {object} the this object
     */
    init(options?: ARInitOptions): Promise<this>;
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
     * Changes several runtime settings at once (#720). The patch is deep-merged into
     * {@link getRuntimeSettings} (`ar2` field by field) and applied in one native call, which
     * validates everything first and changes nothing on failure.
     *
     * `logLevel` is per controller: the level lives in the WASM module's globals, and each
     * init() creates its own module.
     * @param patch any subset of the settings.
     * @throws {TypeError} on an unknown key (including the deprecated square-marker keys
     * `threshold`, `thresholdMode`, `imageProcMode`, `debugMode`), a value of the wrong
     * type, or a non-integer for an integer field (`logLevel`, `ar2.searchFeatureNum`,
     * `ar2.templateSize1/2`, `ar2.searchSize`); nothing is changed.
     * @throws {RangeError} when the values are out of range; nothing is changed.
     */
    configure(patch: NFTRuntimeSettingsPatch): void;
    /**
     * The current runtime settings (#720), with the effective values: `detectionInterval`
     * and `ar2.searchSize` are the build's resolved defaults when they were not set, and
     * `logLevel` is the module's current level.
     * @return a fresh object; changing it changes nothing until passed to configure().
     */
    getRuntimeSettings(): NFTRuntimeSettings;
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
    /**
     * Sets the near plane of the projection. Once a camera is loaded the camera lens is
     * rebuilt at once (WebARKitLib 0.12.0); before that the value is stored.
     * @param value the near plane, > 0.
     */
    setProjectionNearPlane(value: number): void;
    getProjectionNearPlane(): number;
    /**
     * Sets the far plane of the projection. Once a camera is loaded the camera lens is
     * rebuilt at once (WebARKitLib 0.12.0); before that the value is stored.
     * @param value the far plane, > the near plane.
     */
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
     * Rebuilds the camera frustum from the near and far planes. Kept for compatibility:
     * since WebARKitLib 0.12.0 the lens follows the planes, as the projection setters and
     * configure() rebuild it themselves, so calling this changes nothing.
     */
    recalculateCameraLens(): void;
    passVideoData(videoFrame: Uint8ClampedArray, videoLuma: Uint8Array, lumaInternal: boolean): void;
    /**
     * Load the camera, this is an important and required step, Internally fill
     * the ARParam struct.
     * @param {Uint8Array|string} pathOrData the camera parameter: a path to a
     * .dat file, relative to the working directory, or its contents.
     * @return {Promise<number>} a promise that resolves to a number, the internal id.
     */
    loadCamera(pathOrData: Uint8Array | string): Promise<number>;
    /**
     * Load the NFT Markers (.fset, .iset and .fset3) in the code. Each entry is
     * the path of the descriptor files without the extension, relative to the
     * working directory. The files are read in place through NODEFS.
     *
     * It can be called more than once: ids continue from the markers already
     * loaded (#612). A call that fails reports through `onError2` and leaves the
     * markers loaded by earlier calls in place, so it can be retried.
     * @param {Array<string>} urls array of paths of the descriptor files without ext
     * @param {function} callback the callback to retrieve the ids.
     * @param {function} onError2 the error callback.
     * @return {Array<number>} an array of ids.
     */
    addNFTMarkers(urls: Array<string>, callback?: (ids: number[]) => void, onError2?: (errorNumber: number) => void): Array<number>;
    /**
     * The throwing core of {@link addNFTMarkers}. Synchronous like it (#685, D9):
     * Node reads the files in place, so there is nothing to await.
     * @internal Used by ARControllerNFT_node, which needs the NFTLoadError.
     * @param {Array<string>} urls paths of the descriptor files without ext
     * @return {Array<number>} the real marker ids.
     * @throws {NFTLoadError} `argument` for an empty list or URL, `missing` for a
     * file that does not exist, `rejected` when the native loader refuses the
     * markers or throws.
     */
    tryAddNFTMarkers(urls: Array<string>): Array<number>;
    /**
     * Mount the working directory on NODEFS_MOUNT, once per module.
     * @return {void}
     */
    private mountWorkingDirectory;
}
