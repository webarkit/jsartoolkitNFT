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
import artoolkitNFT from "../build/artoolkitNFT_ES6_wasm";
import { IARToolkitNFT } from "./abstractions/IARToolkitNFT";
import { INFTMarkerInfo } from "./abstractions/CommonInterfaces";
import Utils from "./Utils";
import packageJson from "../package.json";
const { version } = packageJson;

const UNKNOWN_MARKER = -1;
const NFT_MARKER = 0;

declare global {
  var artoolkitNFT: IARToolkitNFT;
}

export default class ARToolkitNFT implements IARToolkitNFT {
  static get UNKNOWN_MARKER() {
    return UNKNOWN_MARKER;
  }
  static get NFT_MARKER() {
    return NFT_MARKER;
  }

  private instance: any;
  private markerNFTCount: number;
  private cameraCount: number;
  private version: string;
  public setup: (width: number, height: number, cameraId: number) => number;
  public teardown: () => void;
  public setupAR2: (id: number) => void;
  public setDebugMode: (id: number, mode: boolean) => number;
  public getDebugMode: (id: number) => boolean;
  public getProcessingImage: (id: number) => number;
  public detectMarker: (id: number, videoFrame: Uint8ClampedArray, videoLuma: Uint8Array) => number;
  public detectNFTMarker: (id: number, videoLuma: Uint8Array) => number;
  public getNFTMarker: (id: number, markerIndex: number, videoFrame: Uint8ClampedArray) => INFTMarkerInfo;
  public getNFTData: (id: number, index: number) => object;
  public setLogLevel: (mode: boolean) => number;
  public getLogLevel: () => number;
  public NFTMarkerInfo: {
    error: number;
    found: number;
    id: number;
    pose: Float64Array;
  };
  public setProjectionNearPlane: (id: number, value: number) => void;
  public getProjectionNearPlane: (id: number) => number;
  public setProjectionFarPlane: (id: number, value: number) => void;
  public getProjectionFarPlane: (id: number) => number;
  public setThresholdMode: (id: number, mode: number) => number;
  public getThresholdMode: (id: number) => number;
  public setThreshold: (id: number, threshold: number) => number;
  public getThreshold: (id: number) => number;
  public setImageProcMode: (id: number, mode: number) => number;
  public getImageProcMode: (id: number) => number;
  public getCameraLens: (cameraId: number) => any;

  // construction
  /**
   * The ARToolkitNFT constructor. It has no arguments.
   * These properties are initialized:
   * - instance
   * - markerNFTCount
   * - cameraCount
   * - version
   * A message is displayed in the browser console during the intitialization, for example:
   * "ARToolkitNFT 1.3.0"
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
    this.instance = await artoolkitNFT();

    this._decorate();

    let scope = typeof window !== "undefined" ? window : global;
    scope.artoolkitNFT = this;

    return this;
  }

  // private methods
  /**
   * Used internally to link the instance in the ModuleLoader to the
   * ARToolkitNFT internal methods.
   * @return {void}
   */
  private _decorate(): void {
    // add delegate methods
    [
      "setup",
      "teardown",

      "setupAR2",

      "setLogLevel",
      "getLogLevel",

      "setDebugMode",
      "getDebugMode",

      "getProcessingImage",

      "detectMarker",
      "detectNFTMarker",
      "getNFTMarker",
      "getNFTData",

      "NFTMarkerInfo",

      "setProjectionNearPlane",
      "getProjectionNearPlane",

      "setProjectionFarPlane",
      "getProjectionFarPlane",

      "setThresholdMode",
      "getThresholdMode",

      "setThreshold",
      "getThreshold",

      "setImageProcMode",
      "getImageProcMode",

      "getCameraLens",

      "StringList",
    ].forEach((method: string) => {
      this.converter()[method] = this.instance[method];
    });

    // expose constants
    for (const co in this.instance) {
      if (co.match(/^AR/)) {
        this.converter()[co] = this.instance[co];
      }
    }
  }

  /**
   * Used internally to convert and inject code.
   * @return {this} the this object
   */
  private converter(): any {
    return this;
  }

  // ---------------------------------------------------------------------------
  // public accessors
  //----------------------------------------------------------------------------
  /**
   * Load the camera, this is an important and required step, Internally fill
   * the ARParam struct.
   * @param {string} urlOrData: the camera parameter, usually a path to a .dat file
   * @return {number} a number, the internal id.
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

    this._storeDataFile(data, target);

    // return the internal marker ID
    return this.instance._loadCamera(target);
  }

  /**
   * Load the NFT Markers (.fset, .iset and .fset3) in the code, Must be provided
   * the url of the file without the extension. If fails to load it raise an error.
   * @param {number} arId internal id
   * @param {Array<string>} urls  array of urls of the descriptors files without ext
   * @param {function} callback the callback to retrieve the ids.
   * @param {function} onError2 the error callback.
   */
  public addNFTMarkers(
    arId: number,
    urls: Array<string | Array<string>>,
    callback: (filename: number[]) => void,
    onError2: (errorNumber: number) => void
  ): Array<number> {
    var prefixes: any = [];
    var pending = urls.length * 3;
    var onSuccess = (filename: Uint8Array) => {
      pending -= 1;
      if (pending === 0) {
        const vec = new this.instance.StringList();
        const markerIds = [];
        for (let i = 0; i < prefixes.length; i++) {
          vec.push_back(prefixes[i]);
        }
        var ret = this.instance._addNFTMarkers(arId, vec);
        for (let i = 0; i < ret.size(); i++) {
          markerIds.push(ret.get(i));
        }

        console.log("add nft marker ids: ", markerIds);
        if (callback) callback(markerIds);
      }
    };
    var onError = (filename: string, errorNumber?: number) => {
      console.log("failed to load: ", filename);
      onError2(errorNumber);
    };

    let Ids: Array<number> = [];

    urls.forEach((element, index) => {
      var prefix = "/markerNFT_" + this.markerNFTCount;
      prefixes.push(prefix);

      if (Array.isArray(element)) {
        element.forEach((url) => {
          const filename = prefix + "." + url.split(".").pop();

          this.ajax(
            url,
            filename,
            onSuccess.bind(filename),
            onError.bind(filename)
          );
        });

        this.markerNFTCount += 1;
      } else {
        var filename1 = prefix + ".fset";
        var filename2 = prefix + ".iset";
        var filename3 = prefix + ".fset3";

        this.ajax(
          element + ".fset",
          filename1,
          onSuccess.bind(filename1),
          onError.bind(filename1)
        );
        this.ajax(
          element + ".iset",
          filename2,
          onSuccess.bind(filename2),
          onError.bind(filename2)
        );
        this.ajax(
          element + ".fset3",
          filename3,
          onSuccess.bind(filename3),
          onError.bind(filename3)
        );

        this.markerNFTCount += 1;
      }

      Ids.push(index);
    });

    return Ids;
  }

  // ---------------------------------------------------------------------------

  // implementation
  /**
   * Used internally by LoadCamera method
   * @return {void}
   */
  private _storeDataFile(data: Uint8Array, target: string) {
    // FS is provided by emscripten
    // Note: valid data must be in binary format encoded as Uint8Array
    this.instance.FS.writeFile(target, data, {
      encoding: "binary",
    });
  }

  /**
   * Used internally by the addNFTMarkers method
   * @param url url of the marker.
   * @param target the target of the marker.
   * @param callback callback  to get the binary data.
   * @param errorCallback the error callback.
   */
  private ajax(
    url: string,
    target: string,
    callback: (byteArray: Uint8Array) => void,
    errorCallback: (url: string, message: number) => void
  ) {
    var oReq = new XMLHttpRequest();
    oReq.open("GET", url, true);
    oReq.responseType = "arraybuffer"; // blob arraybuffer
    const writeByteArrayToFS = (
      target: string,
      byteArray: Uint8Array,
      callback: (byteArray: Uint8Array) => void
    ) => {
      this.instance.FS.writeFile(target, byteArray, { encoding: "binary" });
      callback(byteArray);
    };

    oReq.onload = function () {
      if (this.status == 200) {
        var arrayBuffer = oReq.response;
        var byteArray = new Uint8Array(arrayBuffer);
        writeByteArrayToFS(target, byteArray, callback);
      } else {
        errorCallback(url, this.status);
      }
    };

    oReq.send();
  }
}
