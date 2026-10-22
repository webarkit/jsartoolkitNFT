/*
 *  ARToolkitNFTBase.ts
 *  JSARToolKitNFT
 *
 *  This file is part of JSARToolKitNFT - WebARKit.
 *
 *  JSARToolKitNFT is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  JSARToolKitNFT is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with JSARToolKitNFT.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  As a special exception, the copyright holders of this library give you
 *  permission to link this library with independent modules to produce an
 *  executable, regardless of the license terms of these independent modules, and to
 *  copy and distribute the resulting executable under terms of your choice,
 *  provided that you also meet, for each linked independent module, the terms and
 *  conditions of the license of that module. An independent module is a module
 *  which is neither derived from nor based on this library. If you modify this
 *  library, you may extend this exception to your version of the library, but you
 *  are not obligated to do so. If you do not wish to do so, delete this exception
 *  statement from your version.
 *
 *  Copyright 2020 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *
 */
import { IARToolkitNFT } from "./abstractions/IARToolkitNFT";
import {
  INFTMarkerInfo,
  ARLogLevel,
  ARToolkitNFTModule,
  NFTLoadOptions,
} from "./abstractions/CommonInterfaces";
import Utils from "./Utils";
import { NFTLoadError, withCallbacks } from "./NFTLoadError";
import packageJson from "../package.json";
const { version } = packageJson;

const UNKNOWN_MARKER = -1;
const NFT_MARKER = 0;

/**
 * The WASM wrapper shared by the browser builds (default, SIMD, threaded). Each
 * build's `ARToolkitNFT` subclass only names its module factory and the argument
 * its native constructor takes; everything else lives here, once (#734).
 */
export abstract class ARToolkitNFTBase implements IARToolkitNFT {
  /**
   * static properties
   */
  static get UNKNOWN_MARKER() {
    return UNKNOWN_MARKER;
  }
  static get NFT_MARKER() {
    return NFT_MARKER;
  }

  /* errors */
  static ERROR_MARKER_INDEX_OUT_OF_BOUNDS: number;

  /* arDebug */
  static AR_DEBUG_DISABLE: number;
  static AR_DEBUG_ENABLE: number;
  static AR_DEFAULT_DEBUG_MODE: number;

  /* for arlabelingThresh */
  static AR_DEFAULT_LABELING_THRESH: number;

  /* for arImageProcMode */
  static AR_IMAGE_PROC_FRAME_IMAGE: number;
  static AR_IMAGE_PROC_FIELD_IMAGE: number;
  static AR_DEFAULT_IMAGE_PROC_MODE: number;

  /* for arGetTransMat */
  static AR_MAX_LOOP_COUNT: number;
  static AR_LOOP_BREAK_THRESH: number;

  /* Enums */
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

  private instance: any;
  private module: any;
  private variantClass: typeof ARToolkitNFTBase;
  private initModule: () => Promise<ARToolkitNFTModule>;
  private instanceArgs: [] | [withFiltering: boolean];
  private markerNFTCount: number;
  private cameraCount: number;
  private version: string;

  public NFTMarkerInfo: {
    error: number;
    found: number;
    id: number;
    pose: Float64Array;
  };

  public FS: any;
  public malloc: any;
  public free: any;
  public videoFramePtr: number;
  public videoLumaPtr: number;
  public StringList: any;
  public nftMarkers: any;

  /** The WASM heap view.
   * Read from the module on every access rather than cached: the build enables
   * ALLOW_MEMORY_GROWTH, and Emscripten replaces this typed array when the heap
   * grows, detaching any previously captured reference.
   */
  public get HEAPU8(): any {
    return this.module.HEAPU8;
  }

  // construction
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
   * A message is displayed in the browser console during the intitialization, for example:
   * "ARToolkitNFT 1.5.0"
   */
  protected constructor(
    variantClass: typeof ARToolkitNFTBase,
    initModule: () => Promise<ARToolkitNFTModule>,
    ...instanceArgs: [] | [withFiltering: boolean]
  ) {
    this.variantClass = variantClass;
    this.initModule = initModule;
    this.instanceArgs = instanceArgs;
    // reference to WASM module
    this.instance;
    this.markerNFTCount = 0;
    this.cameraCount = 0;
    this.version = version;
    console.info("ARToolkitNFT ", this.version);
  }

  // ---------------------------------------------------------------------------

  // initialization
  /**
   * Init the class injecting the Wasm Module, link the instanced methods and
   * create a global artoolkitNFT variable.
   * @return {object} the this object
   */
  public async init() {
    const instance = await this.initModule();
    // Called with exactly the arguments the build passes, none or one, as each
    // build's own copy of this file did (#734, D7).
    this.instance =
      this.instanceArgs.length === 0
        ? new instance.ARToolKitNFT()
        : new instance.ARToolKitNFT(this.instanceArgs[0]);

    this.module = instance;
    this.FS = instance.FS;
    this.malloc = instance._malloc;
    this.free = instance._free;
    this.StringList = instance.StringList;
    this.nftMarkers = instance.nftMarkers;

    // The constants go on the build's own class, as when each build had its own
    // copy of this file: not on the base, which would make the builds loaded in one
    // page share one set, and not on this.constructor, which would be a consumer's
    // subclass rather than ARToolkitNFT (#734, D6).
    const variant = this.variantClass;
    variant.ERROR_MARKER_INDEX_OUT_OF_BOUNDS =
      instance.ERROR_MARKER_INDEX_OUT_OF_BOUNDS;
    variant.AR_DEBUG_DISABLE = instance.AR_DEBUG_DISABLE;
    variant.AR_DEBUG_ENABLE = instance.AR_DEBUG_ENABLE;
    variant.AR_DEFAULT_DEBUG_MODE = instance.AR_DEFAULT_DEBUG_MODE;

    /* for arlabelingThresh */
    variant.AR_DEFAULT_LABELING_THRESH =
      instance.AR_DEFAULT_LABELING_THRESH;

    /* for arImageProcMode */
    variant.AR_IMAGE_PROC_FRAME_IMAGE = instance.AR_IMAGE_PROC_FRAME_IMAGE;
    variant.AR_IMAGE_PROC_FIELD_IMAGE = instance.AR_IMAGE_PROC_FIELD_IMAGE;
    variant.AR_DEFAULT_IMAGE_PROC_MODE =
      instance.AR_DEFAULT_IMAGE_PROC_MODE;

    /* for arGetTransMat */
    variant.AR_MAX_LOOP_COUNT = instance.AR_MAX_LOOP_COUNT;
    variant.AR_LOOP_BREAK_THRESH = instance.AR_LOOP_BREAK_THRESH;

    /* Enums */
    variant.AR_LOG_LEVEL_DEBUG = instance.AR_LOG_LEVEL_DEBUG;
    variant.AR_LOG_LEVEL_INFO = instance.AR_LOG_LEVEL_INFO;
    variant.AR_LOG_LEVEL_WARN = instance.AR_LOG_LEVEL_WARN;
    variant.AR_LOG_LEVEL_ERROR = instance.AR_LOG_LEVEL_ERROR;
    variant.AR_LOG_LEVEL_REL_INFO = instance.AR_LOG_LEVEL_REL_INFO;

    variant.AR_LABELING_THRESH_MODE_MANUAL =
      instance.AR_LABELING_THRESH_MODE_MANUAL;
    variant.AR_LABELING_THRESH_MODE_AUTO_MEDIAN =
      instance.AR_LABELING_THRESH_MODE_AUTO_MEDIAN;
    variant.AR_LABELING_THRESH_MODE_AUTO_OTSU =
      instance.AR_LABELING_THRESH_MODE_AUTO_OTSU;
    variant.AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE =
      instance.AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE;

    variant.AR_MARKER_INFO_CUTOFF_PHASE_NONE =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_NONE;
    variant.AR_MARKER_INFO_CUTOFF_PHASE_PATTERN_EXTRACTION =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_PATTERN_EXTRACTION;
    variant.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_GENERIC =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_GENERIC;
    variant.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONTRAST =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONTRAST;
    variant.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_NOT_FOUND =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_NOT_FOUND;
    variant.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_EDC_FAIL =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_EDC_FAIL;
    variant.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONFIDENCE =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONFIDENCE;
    variant.AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR;
    variant.AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR_MULTI =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR_MULTI;
    variant.AR_MARKER_INFO_CUTOFF_PHASE_HEURISTIC_TROUBLESOME_MATRIX_CODES =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_HEURISTIC_TROUBLESOME_MATRIX_CODES;

    return this;
  }

  public setup(width: number, height: number, cameraId: number): number {
    this.videoFramePtr = this.malloc(width * height * 4);
    this.videoLumaPtr = this.malloc(width * height);
    return this.instance.setup(width, height, cameraId);
  }

  public teardown(): void {
    if (this.videoFramePtr) {
      this.free(this.videoFramePtr);
      this.videoFramePtr = 0;
    }
    if (this.videoLumaPtr) {
      this.free(this.videoLumaPtr);
      this.videoLumaPtr = 0;
    }
    this.instance.teardown();
  }

  public setupAR2(): void {
    this.instance.setupAR2();
  }

  /**
   * Enables or disables the square-marker detector's debug mode.
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @param {boolean} mode true to enable debug mode, false to disable it
   */
  public setDebugMode(mode: boolean): number {
    return this.instance.setDebugMode(mode);
  }

  /**
   * Returns whether the square-marker detector's debug mode is enabled.
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @return {boolean} true when debug mode is enabled
   */
  public getDebugMode(): boolean {
    return this.instance.getDebugMode();
  }

  public setFiltering(enableFiltering: boolean): void {
    this.instance.setFiltering(enableFiltering);
  }

  public setContinuousDetection(enabled: boolean): void {
    this.instance.setContinuousDetection(enabled);
  }

  public setDetectionInterval(ms: number): void {
    this.instance.setDetectionInterval(ms);
  }

  /**
   * Returns the Emscripten HEAP offset of the square-marker detector's
   * debug image.
   * @deprecated The image is never filled for NFT tracking: only the
   * square-marker labeling writes it, and NFT tracking never runs it. Will be
   * removed in the next major version (#659).
   * @return {number} HEAP offset of the debug image.
   */
  public getProcessingImage(): number {
    return this.instance.getProcessingImage();
  }

  public detectNFTMarker(): number {
    return this.instance.detectNFTMarker();
  }

  public getNFTMarker(markerIndex: number): INFTMarkerInfo {
    return this.instance.getNFTMarker(markerIndex);
  }

  public getNFTData(index: number): object {
    return this.instance.getNFTData(index);
  }

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
  public setLogLevel(level: ARLogLevel | number): void {
    this.instance.setLogLevel(level);
  }
  public getLogLevel(): number {
    return this.instance.getLogLevel();
  }

  public setProjectionNearPlane(value: number): void {
    this.instance.setProjectionNearPlane(value);
  }

  public getProjectionNearPlane(): number {
    return this.instance.getProjectionNearPlane();
  }

  public setProjectionFarPlane(value: number): void {
    this.instance.setProjectionFarPlane(value);
  }

  public getProjectionFarPlane(): number {
    return this.instance.getProjectionFarPlane();
  }

  /**
   * Sets the square-marker labeling threshold mode (auto/manual).
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @param {number} mode One of the AR_LABELING_THRESH_MODE_* values.
   */
  public setThresholdMode(mode: number): number {
    return this.instance.setThresholdMode(mode);
  }

  /**
   * Returns the square-marker labeling threshold mode.
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @return {number} The current threshold mode.
   */
  public getThresholdMode(): number {
    return this.instance.getThresholdMode();
  }

  /**
   * Sets the square-marker labeling threshold.
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @param {number} threshold An integer in the range [0,255] (inclusive).
   */
  public setThreshold(threshold: number): number {
    return this.instance.setThreshold(threshold);
  }

  /**
   * Returns the square-marker labeling threshold.
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @return {number} The current threshold value.
   */
  public getThreshold(): number {
    return this.instance.getThreshold();
  }

  /**
   * Sets the square-marker detector's image processing mode (frame or
   * field).
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @param {number} mode AR_IMAGE_PROC_FRAME_IMAGE or AR_IMAGE_PROC_FIELD_IMAGE.
   */
  public setImageProcMode(mode: number): number {
    return this.instance.setImageProcMode(mode);
  }

  /**
   * Returns the square-marker detector's image processing mode.
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @return {number} The current image processing mode.
   */
  public getImageProcMode(): number {
    return this.instance.getImageProcMode();
  }

  public getCameraLens(): any {
    return this.instance.getCameraLens();
  }

  /**
   * Rebuilds the camera frustum from the near and far planes. The projection setters
   * only store the planes; they take effect on the next call to this method.
   */
  public recalculateCameraLens(): void {
    this.instance.recalculateCameraLens();
  }

  public passVideoData(
    videoFrame: Uint8ClampedArray,
    videoLuma: Uint8Array,
    lumaInternal: boolean,
  ): void {
    if (this.videoFramePtr) {
      this.HEAPU8.set(videoFrame, this.videoFramePtr);
    }
    if (this.videoLumaPtr && !lumaInternal) {
      this.HEAPU8.set(videoLuma, this.videoLumaPtr);
    }
    this.instance.passVideoData(this.videoFramePtr, this.videoLumaPtr, lumaInternal);
  }

  // ---------------------------------------------------------------------------
  // public accessors
  //----------------------------------------------------------------------------
  /**
   * Load the camera, this is an important and required step, Internally fill
   * the ARParam struct.
   * @param {Uint8Array|string} urlOrData: the camera parameter, usually a path to a .dat file
   * @return {Promise<number>} a promise that resolves to a number, the internal id.
   * A download failure rejects with the `NFTLoadError` from the fetch (kind
   * `http` or `network`), which names the URL.
   */
  public async loadCamera(urlOrData: Uint8Array | string): Promise<number> {
    const target = "/camera_param_" + this.cameraCount++;

    // A Uint8Array is preloaded camera params. A URL is fetched; its
    // NFTLoadError is passed on as is, not wrapped: the old
    // `new Error(msg, error)` dropped the cause, since Error's second argument
    // is an options object, and with it the URL and the status.
    const data =
      urlOrData instanceof Uint8Array
        ? urlOrData
        : await Utils.fetchBinary(urlOrData);

    Utils._storeDataFile(data, target, this);

    // return the internal marker ID
    return this.instance._loadCamera(target);
  }

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
  public addNFTMarkers(
    urls: Array<string | string[]>,
    callback?: (ids: number[]) => void,
    onError?: (code: number) => void,
    opts?: NFTLoadOptions,
  ): Promise<number[]> {
    // The callback rule (D8) lives in withCallbacks, so the batch below is
    // written once, Promise style.
    return withCallbacks(this.runBatch(urls, opts), callback, onError, []);
  }

  // ---------------------------------------------------------------------------

  // implementation

  /**
   * The batch behind addNFTMarkers: load every marker concurrently, then
   * register them in one `_addNFTMarkers`, or clean up and report one error.
   */
  private async runBatch(
    urls: Array<string | string[]>,
    opts: NFTLoadOptions = {},
  ): Promise<number[]> {
    // An empty list or an empty URL is refused before any request (D15):
    // otherwise an empty URL would probe the page itself, and the other
    // markers of the call would start downloading for nothing.
    if (!Array.isArray(urls) || urls.length === 0) {
      throw new NFTLoadError("argument", "addNFTMarkers: no marker URLs given");
    }
    for (const source of urls) {
      if (isEmptySource(source)) {
        throw new NFTLoadError("argument", "addNFTMarkers: empty marker URL");
      }
    }
    const signal = opts.signal;
    if (signal?.aborted) throw signal.reason;
    const probe = opts.probeZFT ?? true;

    // The call's own controller: it stops this call's other downloads on the
    // first failure, and follows the caller's signal.
    const link = linkedController(signal);
    const written: string[] = [];
    let ok = false;
    try {
      const prefixes = await settleAll(
        urls.map((source) =>
          this.loadMarkerSource(source, link.signal, probe, written),
        ),
        () => link.abort(),
      ).catch((failure) => {
        // Report the caller's abort as such, not the failures it caused.
        throw signal?.aborted ? signal.reason : failure;
      });
      // Every load succeeded, but the caller aborted before registration:
      // cancelling still means nothing is registered.
      if (signal?.aborted) throw signal.reason;

      const ids = this.registerMarkers(prefixes);
      if (ids.length < prefixes.length) {
        throw new NFTLoadError(
          "rejected",
          `The native core registered ${ids.length} of ${prefixes.length} ` +
            "markers: a dataset may be unreadable, or the 20-marker limit " +
            "reached. The core's log says which.",
        );
      }
      ok = true;
      return ids;
    } finally {
      // Removed when the call ends (D12), so a late abort of the caller's
      // signal does nothing (Review Focus 5).
      link.release();
      // All or nothing: a failed call leaves no file behind. Safe here because
      // settleAll waited for every download (D11).
      if (!ok) this.unlinkAll(written);
    }
  }

  /**
   * Registers the prefixes in one native call and reads back the ids. `vec`
   * and `ret` are Embind objects, freed in `finally`: the old loader leaked
   * both on every call.
   */
  private registerMarkers(prefixes: string[]): number[] {
    const vec = new this.StringList();
    let ret: any;
    try {
      for (const prefix of prefixes) vec.push_back(prefix);
      try {
        ret = this.instance._addNFTMarkers(vec);
      } catch (cause) {
        // D16: a throw from the native side (an abort, an Emscripten
        // ExitStatus) is a refusal like any other, reported once as
        // "rejected" with the thrown value kept as the cause.
        throw new NFTLoadError(
          "rejected",
          "The native core threw while registering the markers",
          { cause },
        );
      }
      const ids: number[] = [];
      for (let i = 0; i < ret.size(); i++) ids.push(ret.get(i));
      return ids;
    } finally {
      vec.delete();
      ret?.delete?.();
    }
  }

  /**
   * Loads one marker into the FS and returns its prefix. It holds no batch
   * policy: it knows nothing of the other markers and aborts none of them.
   * @param source a URL without extension, a `.zft` URL, or a file list.
   * @param signal aborts this marker's downloads.
   * @param probeZFT probe for `<url>.zft` before the three files.
   * @param written receives every FS path written, for the batch's cleanup.
   */
  private async loadMarkerSource(
    source: string | string[],
    signal: AbortSignal,
    probeZFT: boolean,
    written: string[],
  ): Promise<string> {
    // Taken before any request, so prefixes stay unique across concurrent
    // calls and are never reused (Review Focus 2).
    const prefix = "/markerNFT_" + this.markerNFTCount++;

    if (isEmptySource(source)) {
      throw new NFTLoadError("argument", "Empty marker URL");
    }

    if (Array.isArray(source)) {
      // A list missing one of the three files fails at registration, as
      // "rejected", as it does natively.
      await this.loadFiles(
        source.map((url) => ({ url, path: prefix + "." + extensionOf(url) })),
        signal,
        written,
      );
      return prefix;
    }

    if (extensionOf(source) === "zft") {
      const bytes = await Utils.fetchBinary(source, signal);
      this.storeZFT(bytes, prefix, source, written);
      return prefix;
    }

    if (probeZFT) {
      const zftUrl = source + ".zft";
      let res: Response;
      try {
        res = await fetch(zftUrl, { signal });
      } catch (cause) {
        // An abort propagates unwrapped, as fetch's own; anything else is a
        // network failure the three-file requests would hit as well.
        if (signal.aborted) throw cause;
        throw new NFTLoadError("network", `Network error fetching ${zftUrl}`, {
          url: zftUrl,
          cause,
        });
      }
      if (res.ok) {
        // The probe's own bytes are used: one request, not a probe and then
        // a second download of the same archive.
        const bytes = new Uint8Array(await res.arrayBuffer());
        this.storeZFT(bytes, prefix, zftUrl, written);
        return prefix;
      }
      // D6: any HTTP error status means "no .zft" and falls back to the three
      // files, not only 404. S3 and GCS answer 403 for a missing object when
      // listing is not allowed, and those markers load through this fallback.
      res.body?.cancel().catch(() => {});
    }

    await this.loadFiles(
      ["fset", "iset", "fset3"].map((ext) => ({
        url: source + "." + ext,
        path: prefix + "." + ext,
      })),
      signal,
      written,
    );
    return prefix;
  }

  /**
   * Downloads files concurrently and stores each at its path. On the first
   * failure the others are aborted, and it still waits for all of them (D11)
   * before rethrowing, so no download writes after its marker has failed.
   */
  private async loadFiles(
    files: { url: string; path: string }[],
    signal: AbortSignal,
    written: string[],
  ): Promise<void> {
    const link = linkedController(signal);
    try {
      await settleAll(
        files.map(async ({ url, path }) => {
          const bytes = await Utils.fetchBinary(url, link.signal);
          this.storeFile(bytes, path, written);
        }),
        () => link.abort(),
      );
    } finally {
      link.release();
    }
  }

  /**
   * Decompresses a `.zft` archive and writes the marker's `.fset`, `.iset`
   * and `.fset3` under `prefix`. Any failure is an NFTLoadError "format".
   * @param url the archive's URL, for the error.
   */
  private storeZFT(
    bytes: Uint8Array,
    prefix: string,
    url: string,
    written: string[],
  ): void {
    const archive = prefix + ".zft";
    const temp = "/tempMarkerNFT_" + prefix.substring("/markerNFT_".length);
    const extensions = ["fset", "iset", "fset3"];
    this.storeFile(bytes, archive, written);
    // Recorded before decompressing: a failed decompression may leave some of
    // them behind, and the batch's cleanup removes them.
    for (const ext of extensions) written.push(temp + "." + ext);

    let result: number;
    try {
      // The core takes the archive's path without ".zft" and appends it.
      result = this.instance._decompressZFT(prefix, temp);
    } catch (cause) {
      throw new NFTLoadError("format", `Could not decompress ${url}`, {
        url,
        cause,
      });
    } finally {
      // The archive is no longer needed once decompressed: free it from MEMFS.
      this.unlinkAll([archive]);
    }
    if (result !== 1) {
      throw new NFTLoadError("format", `Could not decompress ${url}`, { url });
    }

    try {
      for (const ext of extensions) {
        const hex = this.FS.readFile(temp + "." + ext);
        this.unlinkAll([temp + "." + ext]);
        // The decompressed files are ASCII hex; odd length or a non-hex
        // character throws a RangeError.
        this.storeFile(Utils.hexToBytes(hex), prefix + "." + ext, written);
      }
    } catch (cause) {
      throw new NFTLoadError("format", `Could not decode ${url}`, {
        url,
        cause,
      });
    }
  }

  /** Writes one file to the FS, recording its path first for the cleanup. */
  private storeFile(bytes: Uint8Array, path: string, written: string[]): void {
    written.push(path);
    Utils._storeDataFile(bytes, path, this);
  }

  /** Unlinks FS files, ignoring the ones that are already gone. */
  private unlinkAll(paths: string[]): void {
    for (const path of paths) {
      try {
        this.FS.unlink(path);
      } catch (e) {}
    }
  }
}

const isEmptySource = (source: string | string[]): boolean =>
  Array.isArray(source)
    ? source.length === 0 || source.some((url) => !url)
    : !source;

/**
 * The extension of a URL's path, without the dot: a query or a hash is not
 * part of it (`/x/pinball.fset?v=2` gives `fset`, Review Focus 1).
 */
function extensionOf(url: string): string {
  const path = new URL(url, globalThis.location?.href).pathname;
  const name = path.substring(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.substring(dot + 1);
}

/**
 * An AbortController that also aborts when `parent` does. D12: the link is
 * an `abort` listener, removed by `release()`, rather than `AbortSignal.any()`,
 * which needs Safari 17.4; iOS users on older versions are a real part of the
 * WebAR audience.
 */
function linkedController(parent?: AbortSignal) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parent!.reason);
  if (parent?.aborted) onAbort();
  else parent?.addEventListener("abort", onAbort);
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    release: () => parent?.removeEventListener("abort", onAbort),
  };
}

/**
 * Settles every task, calling `onFirstFailure` as soon as one fails, and then
 * resolves to all the values or rejects with the first failure.
 *
 * D11: it waits for every task, aborted or not, before deciding. Rejecting on
 * the first failure, as Promise.all does, would let a download that finishes
 * late write its file after the caller has cleaned up.
 */
async function settleAll<T>(
  tasks: Promise<T>[],
  onFirstFailure: () => void,
): Promise<T[]> {
  let failed = false;
  let failure: unknown;
  const results = await Promise.allSettled(
    tasks.map((task) =>
      task.catch((e) => {
        if (!failed) {
          failed = true;
          failure = e;
          onFirstFailure();
        }
        throw e;
      }),
    ),
  );
  if (failed) throw failure;
  return results.map((r) => (r as PromiseFulfilledResult<T>).value);
}
