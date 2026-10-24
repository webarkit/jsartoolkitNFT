/*
 *  ARToolkitNFT_node.ts
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
import { initARToolkitNFT } from "./factoryFunctions/initARToolkitNFT_node";
import { IARToolkitNFT_node } from "./abstractions/IARToolkitNFT_node";
import {
  INFTMarkerInfo,
  ARLogLevel,
  NFTRuntimeSettings,
  NFTRuntimeSettingsPatch,
  ARToolkitNFTNodeModule,
  IARToolKitNFTInstance,
  ARInitOptions,
} from "./abstractions/CommonInterfaces";
import { logAt } from "./logger";
import { applyRuntimeSettingsPatch } from "./RuntimeSettings";
import { version } from "../package.json";
import { NFTLoadError, errorCode } from "./NFTLoadError";

const UNKNOWN_MARKER = -1;
const NFT_MARKER = 0;

// Where the working directory is mounted in the Emscripten filesystem. Camera
// and marker paths are resolved against it, so they are relative to
// process.cwd() at the time the camera is loaded.
const NODEFS_MOUNT = "/temp";

export class ARToolkitNFT implements IARToolkitNFT_node {
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

  private instance: IARToolKitNFTInstance;
  private module: ARToolkitNFTNodeModule;
  private cameraCount: number;
  private nodefsMounted: boolean;
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
   * The ARToolkitNFT constructor. It has no arguments.
   * These properties are initialized:
   * - instance
   * - cameraCount
   * - version
   * A message is displayed in the console during init(), for example:
   * "ARToolkitNFT 1.5.0" (it moved there from the constructor, #677).
   */
  constructor() {
    // reference to WASM module
    this.instance;
    this.cameraCount = 0;
    this.nodefsMounted = false;
    this.version = version;
    // The version line is logged by init(), after the log level is applied (#677).
  }

  // ---------------------------------------------------------------------------

  // initialization
  /**
   * Init the class injecting the Wasm Module and link the instanced methods.
   * Every call builds its own module, so each ARToolkitNFT has its own heap
   * and filesystem.
   * @param options `logLevel` is applied to the fresh module before the core is
   * constructed (#677, D10), so the start-up lines follow it.
   * @return {object} the this object
   */
  public async init(options?: ARInitOptions) {
    const instance = await initARToolkitNFT();
    // Between the factory and the core's constructor, through the module-level binding:
    // the constructor and the camera dump print as soon as they run (#677, D10).
    const level = options?.logLevel;
    if (level !== undefined) instance.setLogLevel(level);
    // The version line moved here from the constructor so that it can follow the level. It
    // is a RelInfo line, so it can still be kept at any level up to RelInfo (#677).
    logAt(ARLogLevel.RelInfo, level ?? ARLogLevel.Info, "ARToolkitNFT ", this.version);
    this.instance = new instance.ARToolKitNFT(true);

    this.module = instance;
    this.FS = instance.FS;
    this.malloc = instance._malloc;
    this.free = instance._free;
    this.StringList = instance.StringList;
    this.nftMarkers = instance.nftMarkers;

    ARToolkitNFT.ERROR_MARKER_INDEX_OUT_OF_BOUNDS =
      instance.ERROR_MARKER_INDEX_OUT_OF_BOUNDS;
    ARToolkitNFT.AR_DEBUG_DISABLE = instance.AR_DEBUG_DISABLE;
    ARToolkitNFT.AR_DEBUG_ENABLE = instance.AR_DEBUG_ENABLE;
    ARToolkitNFT.AR_DEFAULT_DEBUG_MODE = instance.AR_DEFAULT_DEBUG_MODE;

    /* for arlabelingThresh */
    ARToolkitNFT.AR_DEFAULT_LABELING_THRESH =
      instance.AR_DEFAULT_LABELING_THRESH;

    /* for arImageProcMode */
    ARToolkitNFT.AR_IMAGE_PROC_FRAME_IMAGE = instance.AR_IMAGE_PROC_FRAME_IMAGE;
    ARToolkitNFT.AR_IMAGE_PROC_FIELD_IMAGE = instance.AR_IMAGE_PROC_FIELD_IMAGE;
    ARToolkitNFT.AR_DEFAULT_IMAGE_PROC_MODE =
      instance.AR_DEFAULT_IMAGE_PROC_MODE;

    /* for arGetTransMat */
    ARToolkitNFT.AR_MAX_LOOP_COUNT = instance.AR_MAX_LOOP_COUNT;
    ARToolkitNFT.AR_LOOP_BREAK_THRESH = instance.AR_LOOP_BREAK_THRESH;

    /* Enums */
    ARToolkitNFT.AR_LOG_LEVEL_DEBUG = instance.AR_LOG_LEVEL_DEBUG;
    ARToolkitNFT.AR_LOG_LEVEL_INFO = instance.AR_LOG_LEVEL_INFO;
    ARToolkitNFT.AR_LOG_LEVEL_WARN = instance.AR_LOG_LEVEL_WARN;
    ARToolkitNFT.AR_LOG_LEVEL_ERROR = instance.AR_LOG_LEVEL_ERROR;
    ARToolkitNFT.AR_LOG_LEVEL_REL_INFO = instance.AR_LOG_LEVEL_REL_INFO;

    ARToolkitNFT.AR_LABELING_THRESH_MODE_MANUAL =
      instance.AR_LABELING_THRESH_MODE_MANUAL;
    ARToolkitNFT.AR_LABELING_THRESH_MODE_AUTO_MEDIAN =
      instance.AR_LABELING_THRESH_MODE_AUTO_MEDIAN;
    ARToolkitNFT.AR_LABELING_THRESH_MODE_AUTO_OTSU =
      instance.AR_LABELING_THRESH_MODE_AUTO_OTSU;
    ARToolkitNFT.AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE =
      instance.AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE;

    ARToolkitNFT.AR_MARKER_INFO_CUTOFF_PHASE_NONE =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_NONE;
    ARToolkitNFT.AR_MARKER_INFO_CUTOFF_PHASE_PATTERN_EXTRACTION =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_PATTERN_EXTRACTION;
    ARToolkitNFT.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_GENERIC =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_GENERIC;
    ARToolkitNFT.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONTRAST =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONTRAST;
    ARToolkitNFT.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_NOT_FOUND =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_NOT_FOUND;
    ARToolkitNFT.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_EDC_FAIL =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_EDC_FAIL;
    ARToolkitNFT.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONFIDENCE =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONFIDENCE;
    ARToolkitNFT.AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR;
    ARToolkitNFT.AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR_MULTI =
      instance.AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR_MULTI;
    ARToolkitNFT.AR_MARKER_INFO_CUTOFF_PHASE_HEURISTIC_TROUBLESOME_MATRIX_CODES =
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
  public configure(patch: NFTRuntimeSettingsPatch): void {
    applyRuntimeSettingsPatch(this.instance, patch);
  }

  /**
   * The current runtime settings (#720), with the effective values: `detectionInterval`
   * and `ar2.searchSize` are the build's resolved defaults when they were not set, and
   * `logLevel` is the module's current level.
   * @return a fresh object; changing it changes nothing until passed to configure().
   */
  public getRuntimeSettings(): NFTRuntimeSettings {
    return this.instance.getRuntimeSettings();
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

  /**
   * Sets the near plane of the projection. Once a camera is loaded the camera lens is
   * rebuilt at once (WebARKitLib 0.12.0); before that the value is stored.
   * @param value the near plane, > 0.
   */
  public setProjectionNearPlane(value: number): void {
    this.instance.setProjectionNearPlane(value);
  }

  public getProjectionNearPlane(): number {
    return this.instance.getProjectionNearPlane();
  }

  /**
   * Sets the far plane of the projection. Once a camera is loaded the camera lens is
   * rebuilt at once (WebARKitLib 0.12.0); before that the value is stored.
   * @param value the far plane, > the near plane.
   */
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
   * Rebuilds the camera frustum from the near and far planes. Kept for compatibility:
   * since WebARKitLib 0.12.0 the lens follows the planes, as the projection setters and
   * configure() rebuild it themselves, so calling this changes nothing.
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
   * @param {Uint8Array|string} pathOrData the camera parameter: a path to a
   * .dat file, relative to the working directory, or its contents.
   * @return {Promise<number>} a promise that resolves to a number, the internal id.
   */
  public async loadCamera(pathOrData: Uint8Array | string): Promise<number> {
    if (pathOrData instanceof Uint8Array) {
      // assume preloaded camera params
      const target = "/camera_param_" + this.cameraCount++;
      this.FS.writeFile(target, pathOrData, { encoding: "binary" });
      return this.instance._loadCamera(target);
    }

    this.mountWorkingDirectory();
    return this.instance._loadCamera(NODEFS_MOUNT + "/" + pathOrData);
  }

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
  public addNFTMarkers(
    urls: Array<string>,
    callback?: (ids: number[]) => void,
    onError2?: (errorNumber: number) => void,
  ): Array<number> {
    // Never throws (D16): a direct caller with no callbacks gets [] and a log,
    // as before. The controller uses tryAddNFTMarkers to see the real error.
    let markerIds: number[];
    try {
      markerIds = this.tryAddNFTMarkers(urls);
    } catch (e) {
      console.error(e);
      if (onError2) onError2(errorCode(e));
      return [];
    }
    // Follows the log level like the other JS console lines (#677).
    logAt(ARLogLevel.Info, this.getLogLevel(), "add nft marker ids: ", markerIds);
    if (callback) callback(markerIds);
    return markerIds;
  }

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
  public tryAddNFTMarkers(urls: Array<string>): Array<number> {
    if (!urls || urls.length === 0 || urls.some((u) => !u)) {
      throw new NFTLoadError(
        "argument",
        "Marker URL needs to be defined and not equal empty string!",
      );
    }
    this.mountWorkingDirectory();

    const prefixes = urls.map((url) => NODEFS_MOUNT + "/" + url);

    for (const prefix of prefixes) {
      for (const ext of [".fset", ".iset", ".fset3"]) {
        if (!this.FS.analyzePath(prefix + ext).exists) {
          throw new NFTLoadError("missing", "failed to load: " + prefix + ext, {
            url: prefix + ext,
          });
        }
      }
    }

    const vec = new this.StringList();
    for (const prefix of prefixes) {
      vec.push_back(prefix);
    }
    let ret: any;
    try {
      // The binding returns a std::vector<int>; the instance interface types it
      // loosely, so read it through `any`.
      ret = this.instance._addNFTMarkers(vec);
    } catch (e) {
      throw new NFTLoadError("rejected", "the native loader threw: " + urls, {
        cause: e,
      });
    } finally {
      vec.delete();
    }

    const markerIds: number[] = [];
    for (let i = 0; i < ret.size(); i++) {
      markerIds.push(ret.get(i));
    }
    ret.delete();

    // The native loader returns no ids when any dataset fails to parse or the
    // marker limit would be exceeded.
    if (markerIds.length !== urls.length) {
      throw new NFTLoadError("rejected", "failed to add NFT markers: " + urls);
    }
    return markerIds;
  }

  // ---------------------------------------------------------------------------

  // implementation

  /**
   * Mount the working directory on NODEFS_MOUNT, once per module.
   * @return {void}
   */
  private mountWorkingDirectory(): void {
    if (this.nodefsMounted) return;
    this.FS.mkdir(NODEFS_MOUNT);
    this.FS.mount(this.module.NODEFS, { root: "." }, NODEFS_MOUNT);
    this.nodefsMounted = true;
  }
}
