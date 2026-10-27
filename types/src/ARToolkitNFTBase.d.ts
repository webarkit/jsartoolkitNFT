import { IARToolkitNFT } from "./abstractions/IARToolkitNFT";
import { INFTMarkerInfo, ARLogLevel, NFTRuntimeSettings, NFTRuntimeSettingsPatch, ARToolkitNFTModule, NFTLoadOptions, ARInitOptions } from "./abstractions/CommonInterfaces";
/**
 * The WASM wrapper shared by the browser builds (default, SIMD, threaded). Each
 * build's `ARToolkitNFT` subclass only names its module factory and the argument
 * its native constructor takes; everything else lives here, once (#734).
 */
export declare abstract class ARToolkitNFTBase implements IARToolkitNFT {
    /**
     * static properties
     */
    static get UNKNOWN_MARKER(): number;
    static get NFT_MARKER(): number;
    /**
     * @internal True when teardown() cannot run on the browser main thread: the tracker
     * facade's dispose() then skips it (#720, #695). Only the threaded build says true.
     */
    static get teardownBlocksMainThread(): boolean;
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
    private variantClass;
    private initModule;
    private instanceArgs;
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
     * Called by each build's ARToolkitNFT constructor, which has no arguments.
     * @param variantClass the build's ARToolkitNFT class, which init() fills with
     * the module constants.
     * @param initModule the build's module factory.
     * @param instanceArgs the arguments of the native ARToolKitNFT constructor.
     * These properties are initialized:
     * - instance
     * - markerNFTCount
     * - cameraCount
     * - version
     * A message is displayed in the browser console during init(), for example:
     * "ARToolkitNFT 1.5.0" (it moved there from the constructor, #677).
     */
    protected constructor(variantClass: typeof ARToolkitNFTBase, initModule: (moduleOptions?: Record<string, unknown>) => Promise<ARToolkitNFTModule>, ...instanceArgs: [] | [withFiltering: boolean]);
    /**
     * Init the class injecting the Wasm Module, link the instanced methods and
     * create a global artoolkitNFT variable.
     * @param options `logLevel` is applied to the fresh module before the core is
     * constructed (#677, D10), so the start-up lines follow it. `moduleOptions` is handed
     * to the Emscripten module factory as its Module object: the tracker facade's threaded
     * worker host sets `mainScriptUrlOrBlob` through it (#720 D16).
     * @return {object} the this object
     */
    init(options?: ARInitOptions & {
        moduleOptions?: Record<string, unknown>;
    }): Promise<this>;
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
     * @param {Uint8Array|string} urlOrData: the camera parameter, usually a path to a .dat file
     * @return {Promise<number>} a promise that resolves to a number, the internal id.
     * A download failure rejects with the `NFTLoadError` from the fetch (kind
     * `http` or `network`), which names the URL.
     */
    loadCamera(urlOrData: Uint8Array | string): Promise<number>;
    /**
     * Loads NFT markers and registers them as one batch.
     *
     * Each entry is either a URL without extension (`.zft` is probed first,
     * then `.fset`, `.iset` and `.fset3`), a URL ending in `.zft`, or an explicit
     * list of file URLs for one marker.
     *
     * All or nothing: if any marker fails, none of this call's markers is
     * registered and its files are removed. Markers loaded by earlier calls stay.
     *
     * - **Promise style** (no callbacks): resolves to the marker ids, or rejects
     *   with an `NFTLoadError`, or with `signal.reason` (`AbortError`,
     *   `TimeoutError`) when `opts.signal` aborts.
     * - **Callback style** (`callback` and/or `onError`): never rejects for a load
     *   failure. `onError(code)` is called once, with the HTTP status or -1
     *   (or `console.error` when there is no `onError`), and the Promise resolves
     *   to `[]`.
     *
     * Errors from different bundles are different classes, so test
     * `err.name === "NFTLoadError"` and `err.kind` rather than `instanceof`.
     * @param urls the markers to load, one entry per marker.
     * @param callback deprecated: receives the ids on success.
     * @param onError deprecated: receives the error code on failure.
     * @param opts `signal` cancels the downloads; `probeZFT` (default true)
     * probes for a `.zft` before the three files.
     * @return the ids the native core assigned, in the order of `urls`.
     */
    addNFTMarkers(urls: Array<string | string[]>, callback?: (ids: number[]) => void, onError?: (code: number) => void, opts?: NFTLoadOptions): Promise<number[]>;
    /**
     * The batch behind addNFTMarkers: load every marker concurrently, then
     * register them in one `_addNFTMarkers`, or clean up and report one error.
     */
    private runBatch;
    /**
     * Registers the prefixes in one native call and reads back the ids. `vec`
     * and `ret` are Embind objects, freed in `finally`: the old loader leaked
     * both on every call.
     */
    private registerMarkers;
    /**
     * Loads one marker into the FS and returns its prefix. It holds no batch
     * policy: it knows nothing of the other markers and aborts none of them.
     * @param source a URL without extension, a `.zft` URL, or a file list.
     * @param signal aborts this marker's downloads.
     * @param probeZFT probe for `<url>.zft` before the three files.
     * @param written receives every FS path written, for the batch's cleanup.
     */
    private loadMarkerSource;
    /**
     * Downloads files concurrently and stores each at its path. On the first
     * failure the others are aborted, and it still waits for all of them (D11)
     * before rethrowing, so no download writes after its marker has failed.
     */
    private loadFiles;
    /**
     * Decompresses a `.zft` archive and writes the marker's `.fset`, `.iset`
     * and `.fset3` under `prefix`. Any failure is an NFTLoadError "format".
     * @param url the archive's URL, for the error.
     */
    private storeZFT;
    /** Writes one file to the FS, recording its path first for the cleanup. */
    private storeFile;
    /** Unlinks FS files, ignoring the ones that are already gone. */
    private unlinkAll;
}
