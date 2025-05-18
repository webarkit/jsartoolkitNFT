/*
 *  ARToolkitNFT.ts
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
import { initARToolkitNFT } from "./factoryFunctions/initARToolkitNFT";
import { IARToolkitNFT } from "./abstractions/IARToolkitNFT";
import { INFTMarkerInfo } from "./abstractions/CommonInterfaces";
import Utils from "./Utils";
import packageJson from "../package.json";
const { version } = packageJson;

const UNKNOWN_MARKER = -1;
const NFT_MARKER = 0;

export class ARToolkitNFT implements IARToolkitNFT {
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
  public StringList: any;
  public nftMarkers: any;

  // construction
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
  constructor() {
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
    const instance = await initARToolkitNFT();
    this.instance = new instance.ARToolKitNFT(true);

    this.FS = instance.FS;
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
    return this.instance.setup(width, height, cameraId);
  }

  public teardown(): void {
    this.instance.teardown();
  }

  public setupAR2(): void {
    this.instance.setupAR2();
  }

  public setDebugMode(mode: boolean): number {
    return this.instance.setDebugMode(mode);
  }

  public getDebugMode(): boolean {
    return this.instance.getDebugMode();
  }

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

  public setLogLevel(mode: boolean): number {
    return this.instance.setLogLevel(mode);
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

  public setThresholdMode(mode: number): number {
    return this.instance.setThresholdMode(mode);
  }

  public getThresholdMode(): number {
    return this.instance.getThresholdMode();
  }

  public setThreshold(threshold: number): number {
    return this.instance.setThreshold(threshold);
  }

  public getThreshold(): number {
    return this.instance.getThreshold();
  }

  public setImageProcMode(mode: number): number {
    return this.instance.setImageProcMode(mode);
  }

  public getImageProcMode(): number {
    return this.instance.getImageProcMode();
  }

  public getCameraLens(): any {
    return this.instance.getCameraLens();
  }

  public passVideoData(
    videoFrame: Uint8ClampedArray,
    videoLuma: Uint8Array,
    lumaInternal: boolean,
  ): void {
    this.instance.passVideoData(videoFrame, videoLuma, lumaInternal);
  }

  // ---------------------------------------------------------------------------
  // public accessors
  //----------------------------------------------------------------------------
  /**
   * Load the camera, this is an important and required step, Internally fill
   * the ARParam struct.
   * @param {Uint8Array|string} urlOrData: the camera parameter, usually a path to a .dat file
   * @return {Promise<number>} a promise that resolves to a number, the internal id.
   */
  public async loadCamera(urlOrData: Uint8Array | string): Promise<number> {
    const target = "/camera_param_" + this.cameraCount++;

    let data: Uint8Array;

    if (urlOrData instanceof Uint8Array) {
      // assume preloaded camera params
      data = urlOrData;
    } else {
      // fetch data via HTTP
      try {
        data = await Utils.fetchRemoteData(urlOrData);
      } catch (error) {
        throw new Error("Error in loadCamera function: ", error);
      }
    }

    Utils._storeDataFile(data, target, this);

    // return the internal marker ID
    return this.instance._loadCamera(target);
  }

  /**
   * Load the NFT Markers (.fset, .iset and .fset3) in the code, Must be provided
   * the url of the file without the extension. If fails to load it raise an error.
   * @param {Array<string>} urls  array of urls of the descriptors files without ext
   * @param {function} callback the callback to retrieve the ids.
   * @param {function} onError2 the error callback.
   * @return {Array<number>} an array of ids.
   */
  public addNFTMarkers(
    urls: Array<string | Array<string>>,
    callback: (filename: number[]) => void,
    onError2: (errorNumber: number) => void,
  ): Array<number> {
    const prefixes: any = [];
    let pending = urls.length * 3;
    const onSuccess = (filename: Uint8Array) => {
      pending -= 1;
      if (pending === 0) {
        const vec = new this.StringList();
        const markerIds = [];
        for (let i = 0; i < prefixes.length; i++) {
          vec.push_back(prefixes[i]);
        }
        const ret = this.instance._addNFTMarkers(vec);
        for (let i = 0; i < ret.size(); i++) {
          markerIds.push(ret.get(i));
        }

        console.log("add nft marker ids: ", markerIds);
        if (callback) callback(markerIds);
      }
    };

    const onError = (filename: string, errorNumber?: number) => {
      console.log("failed to load: ", filename);
      onError2(errorNumber);
    };

    const loadZFT = (prefix: any) => {
      const marker_num = prefix.substring(11);
      const prefixTemp = "/tempMarkerNFT_" + marker_num;

      const response = this.instance._decompressZFT(prefix, prefixTemp);

      let contentIsetUint8 = this.FS.readFile(prefixTemp + ".iset");
      let contentFsetUint8 = this.FS.readFile(prefixTemp + ".fset");
      let contentFset3Uint8 = this.FS.readFile(prefixTemp + ".fset3");

      this.FS.unlink(prefixTemp + ".iset");
      this.FS.unlink(prefixTemp + ".fset");
      this.FS.unlink(prefixTemp + ".fset3");

      let hexStrIset = Utils.Uint8ArrayToStr(contentIsetUint8);
      let hexStrFset = Utils.Uint8ArrayToStr(contentFsetUint8);
      let hexStrFset3 = Utils.Uint8ArrayToStr(contentFset3Uint8);

      let contentIset = new Uint8Array(
        hexStrIset.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)),
      );
      let contentFset = new Uint8Array(
        hexStrFset.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)),
      );
      let contentFset3 = new Uint8Array(
        hexStrFset3.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)),
      );

      Utils._storeDataFile(contentFset, prefix + ".fset", this);
      Utils._storeDataFile(contentIset, prefix + ".iset", this);
      Utils._storeDataFile(contentFset3, prefix + ".fset3", this);
      onSuccess(contentFset);
    };

    const onSuccessZFT = function () {
      loadZFT(arguments[1]);
      //onSuccess(contentFset);
    };

    let Ids: Array<number> = [];

    urls.forEach((element, index) => {
      const prefix = "/markerNFT_" + this.markerNFTCount;
      prefixes.push(prefix);

      if (Array.isArray(element)) {
        element.forEach((url) => {
          const filename = prefix + "." + url.split(".").pop();

          this.ajax(
            url,
            filename,
            onSuccess.bind(filename),
            onError.bind(filename),
            prefix,
          );
        });

        this.markerNFTCount += 1;
      } else {
        const filename1 = prefix + ".fset";
        const filename2 = prefix + ".iset";
        const filename3 = prefix + ".fset3";
        const filename4 = prefix + ".zft";

        let type = Utils.checkZFT(element + ".zft");
        if (type) {
          pending -= 2;
          this.ajax(
            element + ".zft",
            filename4,
            onSuccessZFT.bind(filename4),
            onError.bind(filename4),
            prefix,
          );
        } else {
          this.ajax(
            element + ".fset",
            filename1,
            onSuccess.bind(filename1),
            onError.bind(filename1),
            prefix,
          );
          this.ajax(
            element + ".iset",
            filename2,
            onSuccess.bind(filename2),
            onError.bind(filename2),
            prefix,
          );
          this.ajax(
            element + ".fset3",
            filename3,
            onSuccess.bind(filename3),
            onError.bind(filename3),
            prefix,
          );
        }

        this.markerNFTCount += 1;
      }

      Ids.push(index);
    });

    return Ids;
  }

  // ---------------------------------------------------------------------------

  // implementation

  /**
   * Used internally by the addNFTMarkers method
   * @param {string} url url of the marker.
   * @param {string} target the target of the marker.
   * @param {function} callback callback to get the binary data.
   * @param {function} errorCallback the error callback.
   * @param {string} prefix the prefix for the marker.
   * @return {void}
   */
  private ajax(
    url: string,
    target: string,
    callback: (byteArray: Uint8Array) => void,
    errorCallback: (url: string, message: number) => void,
    prefix: string,
  ) {
    const oReq = new XMLHttpRequest();
    oReq.open("GET", url, true);
    oReq.responseType = "arraybuffer"; // blob arraybuffer
    const writeByteArrayToFS = (
      target: string,
      byteArray: Uint8Array,
      callback: (byteArray: Uint8Array, prefix: string) => void,
      prefix: string,
    ) => {
      Utils._storeDataFile(byteArray, target, this);
      callback(byteArray, prefix);
    };

    oReq.onload = function () {
      if (this.status == 200) {
        const arrayBuffer = oReq.response;
        const byteArray = new Uint8Array(arrayBuffer);
        writeByteArrayToFS(target, byteArray, callback, prefix);
      } else {
        errorCallback(url, this.status);
      }
    };

    oReq.send();
  }
}
