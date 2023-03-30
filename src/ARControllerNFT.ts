/*
 *  ARControllerNFT.ts
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
import {
  INFTMarkerInfo,
  IImageObj,
  INFTMarker,
} from "./abstractions/CommonInterfaces";
import { IARToolkitNFT } from "./abstractions/IARToolkitNFT";
import { ARToolkitNFT } from "./ARToolkitNFT";
import { AbstractARControllerNFT } from "./abstractions/AbstractARControllerNFT";

export class ARControllerNFT implements AbstractARControllerNFT {
  // private declarations
  private id: number;
  private _width: number;
  private _height: number;
  private _cameraParam: string;
  private cameraId: number;

  private artoolkitNFT: IARToolkitNFT;
  private FS: any;
  private StringList: any;

  private listeners: object;
  private nftMarkers: INFTMarker[];

  private transform_mat: Float64Array;
  private transformGL_RH: Float64Array;
  private camera_mat: Float64Array;

  private videoWidth: number;
  private videoHeight: number;
  private videoSize: number;
  private framesize: number;
  private videoLuma: Uint8Array;
  private grayscaleEnabled: boolean;
  private grayscaleSource: Uint8Array;

  private nftMarkerFound: boolean; // = false
  private nftMarkerFoundTime: number;
  private nftMarkerCount: number; // = 0
  private defaultMarkerWidth: number;

  private _bwpointer: number;

  /**
   * The ARControllerNFT default constructor. It has no params (see above).
   * These properties are initialized:
   * id, width, height, cameraParam, cameraId,
   * cameraLoaded, artoolkitNFT, listeners, nftMarkers, transform_mat,
   * transformGL_RH, videoWidth, videoHeight, videoSize,
   * videoLuma, framesize, camera_mat.
   */
  constructor();
  /**
   * The ARControllerNFT default constructor. It has 2 params (see above).
   * These properties are initialized:
   * id, width, height, cameraParam, cameraId,
   * cameraLoaded, artoolkitNFT, listeners, nftMarkers, transform_mat,
   * transformGL_RH, videoWidth, videoHeight, videoSize,
   * videoLuma, framesize, camera_mat.
   * @param {number} width
   * @param {number} height
   */
  constructor(width: number, height: number);
  /**
   * The ARControllerNFT constructor. It has 4 params (see above).
   * These properties are initialized:
   * id, width, height, cameraParam, cameraId,
   * cameraLoaded, artoolkitNFT, listeners, nftMarkers, transform_mat,
   * transformGL_RH, videoWidth, videoHeight, videoSize,
   * framesize, camera_mat.
   * @param {number} width
   * @param {number} height
   * @param {string} cameraParam
   */
  constructor(width: number, height: number, cameraParam: string);
  constructor(width?: number, height?: number, cameraParam?: string) {
    // no point in initializing a member as "undefined"
    // replaced it with -1
    this.id = -1;

    this._width = width;
    this._height = height;

    // this is a replacement for ARCameraParam
    this._cameraParam = cameraParam;
    this.cameraId = -1;

    // toolkit instance
    this.artoolkitNFT;

    // to register observers as event listeners
    this.listeners = {};

    this.nftMarkers = [];

    this.transform_mat = new Float64Array(16);
    this.transformGL_RH = new Float64Array(16);

    this.videoWidth = width;
    this.videoHeight = height;
    this.videoSize = this.videoWidth * this.videoHeight;

    this.framesize = null;
    this.videoLuma = null;
    this.grayscaleEnabled = false;
    this.camera_mat = null;

    // this is to workaround the introduction of "self" variable
    this.nftMarkerFound = false;
    this.nftMarkerFoundTime = 0;
    this.nftMarkerCount = 0;

    this._bwpointer = null;
    this.defaultMarkerWidth = 1;
  }

  /** The static method **initWithDimensions** is the start of your app.
   *  Define it with the width and height of the video stream
   *  and the camera parameter file path. It return a Promise with the ARControllerNFT object.
   *  Use a thenable to load the NFT marker and all the code stuff.
   *  Example:
   *  ```js
   *    import ARControllerNFT from '@webarkit/jsartoolkit-nft'
   *    ARControllerNFT.initWithDimensions(640, 480, "camera_para.dat").then(
   *    (nft) => {
   *      nft.loadNFTMarker();
   *      // other code...
   *    })
   *  ```
   * @param {number} width
   * @param {number} height
   * @param {string} cameraParam
   * @return {Promise<ARControllerNFT>} this
   */
  static async initWithDimensions(
    width: number,
    height: number,
    cameraParam: string
  ): Promise<ARControllerNFT> {
    // directly init with given width / height
    const arControllerNFT = new ARControllerNFT(width, height, cameraParam);
    return await arControllerNFT._initialize();
  }

  /** The static method **initWithImage** is the start of your app.
   *  Define it with an HTML element like a video or a static Image
   *  and the camera parameter file path. As with **initWithDimensions** it return a Promise
   *  with the ARControllerNFT object.
   *  Use a thenable to load the NFT marker and all the code stuff.
   *  Example:
   *  ```js
   *    import ARControllerNFT from '@webarkit/jsartoolkit-nft'
   *    const image = document.getElementById('image')
   *    ARControllerNFT.initWithImage(image, "camera_para.dat").then(
   *    (nft) => {
   *      nft.loadNFTMarker();
   *      // other code...
   *    })
   *  ```
   * @param {image} image
   * @param {string} cameraParam
   * @return {Promise<ARControllerNFT>} this
   */
  static async initWithImage(
    image: IImageObj,
    cameraParam: string
  ): Promise<ARControllerNFT> {
    const width = image.videoWidth || image.width;
    const height = image.videoHeight || image.height;
    const arControllerNFT = new ARControllerNFT(width, height, cameraParam);
    return await arControllerNFT._initialize();
  }

  /** The static method **customInit** is the start of your app.
   *  This method is only for advanced users.
   *  Define it with the width and height of the video stream,
   *  the camera parameter file path and the callback function where you define custom behaviours.
   *  As with **initWithDimensions** it return a Promise
   *  with the ARControllerNFT object.
   *  Use a thenable to load the NFT marker and all the code stuff.
   *  Example:
   *  ```js
   *    import ARControllerNFT from '@webarkit/jsartoolkit-nft'
   *    ARControllerNFT.customInit(
   *    640,
   *    480,
   *    "camera_para.dat",
   *    function() { // your code here }
   *    ).then(
   *    (nft) => {
   *      nft.loadNFTMarker();
   *      // other code...
   *    })
   *  ```
   * @param {number} width
   * @param {number} height
   * @param {string} cameraParam
   * @param {function} callback
   * @return {Promise<ARControllerNFT>} this
   */
  static async customInit(
    width: number,
    height: number,
    cameraParam: string,
    callback: () => void
  ): Promise<ARControllerNFT> {
    const arControllerNFT = new ARControllerNFT(width, height, cameraParam);
    callback();
    return await arControllerNFT._initialize();
  }

  // getters and setters
  set width(width: number) {
    this._width = width;
  }

  get width() {
    return this._width;
  }

  set height(height: number) {
    this._height = height;
  }

  get height() {
    return this._height;
  }

  set cameraParam(cameraParam: string) {
    this._cameraParam = cameraParam;
  }

  get cameraParam() {
    return this._cameraParam;
  }

  /**
   * This is one of the most important method inside ARControllerNFT. It detect the marker
   * and dispatch internally with the getNFTMarker event listener the NFTMarkerInfo
   * struct object of the tracked NFT Markers.
   * @param {image} image data
   * @return {void}
   */
  process(image: IImageObj): void {
    let result = this.detectMarker(image);
    if (result != 0) {
      console.error("[ARControllerNFT]", "detectMarker error:", result);
    }

    let k, o: INFTMarker;

    // get NFT markers
    for (k in this.converter().nftMarkers) {
      o = this.converter().nftMarkers[k];
      o.inPrevious = o.inCurrent;
      o.inCurrent = false;
    }

    // detect NFT markers
    let nftMarkerCount = this.nftMarkerCount;
    this.detectNFTMarker();

    // in ms
    const MARKER_LOST_TIME = 200;

    for (let i = 0; i < nftMarkerCount; i++) {
      let nftMarkerInfo: IARToolkitNFT["NFTMarkerInfo"] = this.getNFTMarker(i);

      let markerType = ARToolkitNFT.NFT_MARKER;

      if (nftMarkerInfo.found) {
        this.nftMarkerFound = <boolean>(<unknown>i);
        this.nftMarkerFoundTime = Date.now();

        let visible: INFTMarker = this.trackNFTMarkerId(i);
        visible.matrix.set(nftMarkerInfo.pose);
        visible.inCurrent = true;
        this.transMatToGLMat(visible.matrix, this.transform_mat);
        this.transformGL_RH = this.arglCameraViewRHf(this.transform_mat);
        this.dispatchEvent({
          name: "getNFTMarker",
          target: this,
          data: {
            index: i,
            type: markerType,
            marker: nftMarkerInfo,
            matrix: this.transform_mat,
            matrixGL_RH: this.transformGL_RH,
          },
        });
      } else if (this.nftMarkerFound === <boolean>(<unknown>i)) {
        // for now this marker found/lost events handling is for one marker at a time
        if (Date.now() - this.nftMarkerFoundTime > MARKER_LOST_TIME) {
          this.nftMarkerFound = false;
          this.dispatchEvent({
            name: "lostNFTMarker",
            target: this,
            data: {
              index: i,
              type: markerType,
              marker: nftMarkerInfo,
              matrix: this.transform_mat,
              matrixGL_RH: this.transformGL_RH,
            },
          });
        }
      }
    }
  }

  /**
   * Detects the NFT markers in the process() function,
   * with the given tracked id.
   * @return {number}
   */
  detectNFTMarker(): number {
    return this.artoolkitNFT.detectNFTMarker();
  }

  /**
   * Adds the given NFT marker ID to the index of tracked IDs.
   * Sets the markerWidth for the pattern marker to markerWidth.
   * Used by process() to implement continuous tracking,
   * keeping track of the marker's transformation matrix
   * and customizable marker widths.
   * @param {number} id ID of the NFT marker to track.
   * @param {number} markerWidth The width of the marker to track.
   * @return {Object} The marker tracking object.
   */
  trackNFTMarkerId(id: number, markerWidth?: number): INFTMarker {
    let obj: INFTMarker = this.converter().nftMarkers[id];
    if (!obj) {
      this.converter().nftMarkers[id] = obj = {
        inPrevious: false,
        inCurrent: false,
        matrix: new Float64Array(12),
        matrixGL_RH: new Float64Array(12),
        markerWidth: markerWidth || this.defaultMarkerWidth,
      };
    }
    if (markerWidth) {
      obj.markerWidth = markerWidth;
    }
    return obj;
  }

  // marker detection routines
  // ----------------------------------------------------------------------------

  /**
   * This is the core ARToolKit marker detection function. It calls through to a set of
   * internal functions to perform the key marker detection steps of binarization and
   * labelling, contour extraction, and template matching and/or matrix code extraction.
   * Typically, the resulting set of detected markers is retrieved by calling arGetMarkerNum
   * to get the number of markers detected and arGetMarker to get an array of ARMarkerInfo
   * structures with information on each detected marker, followed by a step in which
   * detected markers are possibly examined for some measure of goodness of match (e.g. by
   * examining the match confidence value) and pose extraction.
   * @param {image} Image data to be processed to detect markers.
   * @return {number} 0 if the function proceeded without error, or a value less than 0 in case of error.
   * A result of 0 does not however, imply any markers were detected.
   */
  detectMarker(image: IImageObj): number {
    if (this._copyImageToHeap(image)) {
      return this.artoolkitNFT.detectMarker();
    }
    return -99;
  }

  /**
   * Get the NFT marker info struct for the given NFT marker index in detected markers.
   * The returned object is the global artoolkitNFT.NFTMarkerInfo object and will be overwritten
   * by subsequent calls.
   * Returns undefined if no marker was found.
   * A markerIndex of -1 is used to access the global custom marker.
   * @param {number} markerIndex The index of the NFT marker to query.
   * @return {Object} The NFTMarkerInfo struct.
   */
  getNFTMarker(markerIndex: number): INFTMarkerInfo {
    return this.artoolkitNFT.getNFTMarker(markerIndex);
  }

  /**
   * **GetNFTData** will return the width. height and dpi of the NFT marker.
   * @param id the internal id (this.id)
   * @param index the index of the NFT marker, in case you have multi NFT markers.
   * @returns {object}
   */
  getNFTData(index: number) {
    return this.artoolkitNFT.getNFTData(index);
  }

  // event handling
  //----------------------------------------------------------------------------

  /**
   * Add an event listener on this ARControllerNFT for the named event, calling the callback function
   * whenever that event is dispatched.
   * Possible events are:
   * - getNFTMarker - dispatched whenever process() finds a NFT marker
   * - lostNFTMarker - dispatched whenever process() lost a visible NFT marker
   * - load - dispatched when the ARControllerNFT is ready to use (useful if passing in a camera URL in the constructor)
   * @param {string} name Name of the event to listen to.
   * @param {function} callback Callback function to call when an event with the given name is dispatched.
   */
  addEventListener(name: string, callback: object): void {
    if (!this.converter().listeners[name]) {
      this.converter().listeners[name] = [];
    }
    this.converter().listeners[name].push(callback);
  }

  /**
   * Remove an event listener from the named event.
   * @param {string} name Name of the event to stop listening to.
   * @param {function} callback Callback function to remove from the listeners of the named event.
   */
  removeEventListener(name: string, callback: object): void {
    if (this.converter().listeners[name]) {
      let index = this.converter().listeners[name].indexOf(callback);
      if (index > -1) {
        this.converter().listeners[name].splice(index, 1);
      }
    }
  }

  /**
   * Dispatches the given event to all registered listeners on event.name.
   * @param {Object} event Event to dispatch.
   */
  dispatchEvent(event: { name: string; target: any; data?: object }): void {
    let listeners = this.converter().listeners[event.name];
    if (listeners) {
      for (let i = 0; i < listeners.length; i++) {
        listeners[i].call(this, event);
      }
    }
  }

  // debug stuff
  //----------------------------------------------------------------------------

  /**
   * Sets up for debugging AR detection.
   */
  debugSetup(): void {
    this.setDebugMode(true);
    this._bwpointer = this.getProcessingImage();
  }

  /**
   * Converts the given 3x4 marker transformation matrix in the 12-element transMat array
   * into a 4x4 WebGL matrix and writes the result into the 16-element glMat array.
   * If scale parameter is given, scales the transform of the glMat by the scale parameter.
   * @param {Float64Array} transMat The 3x4 marker transformation matrix.
   * @param {Float64Array} glMat The 4x4 GL transformation matrix.
   * @param {number} scale The scale for the transform.
   * @return {Float64Array} the modified matrix
   */
  transMatToGLMat(
    transMat: Float64Array,
    glMat: Float64Array,
    scale?: number
  ): Float64Array {
    if (glMat == undefined) {
      glMat = new Float64Array(16);
    }

    glMat[0 + 0 * 4] = transMat[0]; // R1C1
    glMat[0 + 1 * 4] = transMat[1]; // R1C2
    glMat[0 + 2 * 4] = transMat[2];
    glMat[0 + 3 * 4] = transMat[3];
    glMat[1 + 0 * 4] = transMat[4]; // R2
    glMat[1 + 1 * 4] = transMat[5];
    glMat[1 + 2 * 4] = transMat[6];
    glMat[1 + 3 * 4] = transMat[7];
    glMat[2 + 0 * 4] = transMat[8]; // R3
    glMat[2 + 1 * 4] = transMat[9];
    glMat[2 + 2 * 4] = transMat[10];
    glMat[2 + 3 * 4] = transMat[11];
    glMat[3 + 0 * 4] = 0.0;
    glMat[3 + 1 * 4] = 0.0;
    glMat[3 + 2 * 4] = 0.0;
    glMat[3 + 3 * 4] = 1.0;

    if (scale != undefined && scale !== 0.0) {
      glMat[12] *= scale;
      glMat[13] *= scale;
      glMat[14] *= scale;
    }
    return glMat;
  }

  /**
   * Converts the given 4x4 openGL matrix in the 16-element transMat array
   * into a 4x4 OpenGL Right-Hand-View matrix and writes the result into the 16-element glMat array.
   * If scale parameter is given, scales the transform of the glMat by the scale parameter.
   * @param {Float64Array} glMatrix The 4x4 marker transformation matrix.
   * @param {Float64Array} [glRhMatrix] The 4x4 GL right hand transformation matrix.
   * @param {number} [scale] The scale for the transform.
   * @return {Float64Array} the modified gl matrix
   */
  arglCameraViewRHf(
    glMatrix: Float64Array,
    glRhMatrix?: Float64Array,
    scale?: number
  ): Float64Array {
    let m_modelview;
    if (glRhMatrix == undefined) {
      m_modelview = new Float64Array(16);
    } else {
      m_modelview = glRhMatrix;
    }

    // x
    m_modelview[0] = glMatrix[0];
    m_modelview[4] = glMatrix[4];
    m_modelview[8] = glMatrix[8];
    m_modelview[12] = glMatrix[12];
    // y
    m_modelview[1] = -glMatrix[1];
    m_modelview[5] = -glMatrix[5];
    m_modelview[9] = -glMatrix[9];
    m_modelview[13] = -glMatrix[13];
    // z
    m_modelview[2] = -glMatrix[2];
    m_modelview[6] = -glMatrix[6];
    m_modelview[10] = -glMatrix[10];
    m_modelview[14] = -glMatrix[14];

    // 0 0 0 1
    m_modelview[3] = 0;
    m_modelview[7] = 0;
    m_modelview[11] = 0;
    m_modelview[15] = 1;

    if (scale != undefined && scale !== 0.0) {
      m_modelview[12] *= scale;
      m_modelview[13] *= scale;
      m_modelview[14] *= scale;
    }

    glRhMatrix = m_modelview;

    return glRhMatrix;
  }

  /**
   * Returns the 16-element WebGL transformation matrix used by ARControllerNFT.process to
   * pass marker WebGL matrices to event listeners.
   * Unique to each ARControllerNFT.
   * @return {Float64Array} The 16-element WebGL transformation matrix used by the ARControllerNFT.
   */
  getTransformationMatrix(): Float64Array {
    return this.transform_mat;
  }

  /**
   * Returns the projection matrix computed from camera parameters for the ARControllerNFT.
   * @return {Float64Array} The 16-element WebGL camera matrix for the ARControllerNFT camera parameters.
   */
  getCameraMatrix(): Float64Array {
    return this.camera_mat;
  }

  // Setter / Getter Proxies
  //----------------------------------------------------------------------------

  /**
   * Enables or disables debug mode in the tracker. When enabled, a black and white debug
   * image is generated during marker detection. The debug image is useful for visualising
   * the binarization process and choosing a threshold value.
   * @param {boolean} mode true to enable debug mode, false to disable debug mode
   * @see getDebugMode()
   */
  setDebugMode(mode: boolean): number {
    return this.artoolkitNFT.setDebugMode(mode);
  }

  /**
   * Returns whether debug mode is currently enabled.
   * @return {boolean} true when debug mode is enabled, false when debug mode is disabled
   * @see  setDebugMode()
   */
  getDebugMode(): boolean {
    return this.artoolkitNFT.getDebugMode();
  }

  /**
   * Returns the Emscripten HEAP offset to the debug processing image used by ARToolKit.
   * @return {number} HEAP offset to the debug processing image.
   */
  getProcessingImage(): number {
    return this.artoolkitNFT.getProcessingImage();
  }

  /**
   * Sets the logging level to use by ARToolKit.
   * @param {number} mode type for the log level.
   */
  setLogLevel(mode: boolean): number {
    return this.artoolkitNFT.setLogLevel(mode);
  }

  /**
   * Gets the logging level used by ARToolKit.
   * @return {number} return the log level in use.
   */
  getLogLevel(): number {
    return this.artoolkitNFT.getLogLevel();
  }

  /**
   * Sets the value of the near plane of the camera.
   * @param {number} value the value of the near plane
   * @return {number} 0 (void)
   */
  setProjectionNearPlane(value: number): void {
    return this.artoolkitNFT.setProjectionNearPlane(value);
  }

  /**
   * Gets the value of the near plane of the camera with the give id.
   * @return {number} the value of the near plane.
   */
  getProjectionNearPlane(): number {
    return this.artoolkitNFT.getProjectionNearPlane();
  }

  /**
   * Sets the value of the far plane of the camera.
   * @param {number} value the value of the far plane
   * @return {number} 0 (void)
   */
  setProjectionFarPlane(value: number): void {
    return this.artoolkitNFT.setProjectionFarPlane(value);
  }

  /**
   * Gets the value of the far plane of the camera with the give id.
   * @return {number} the value of the far plane.
   */
  getProjectionFarPlane(): number {
    return this.artoolkitNFT.getProjectionFarPlane();
  }

  /**
   * Set the labeling threshold mode (auto/manual).
   * @param {number} mode An integer specifying the mode. One of:
   * AR_LABELING_THRESH_MODE_MANUAL,
   * AR_LABELING_THRESH_MODE_AUTO_MEDIAN,
   * AR_LABELING_THRESH_MODE_AUTO_OTSU,
   * AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE,
   * AR_LABELING_THRESH_MODE_AUTO_BRACKETING
   */
  setThresholdMode(mode: number): number {
    return this.artoolkitNFT.setThresholdMode(mode);
  }

  /**
   * Gets the current threshold mode used for image binarization.
   * @return {number} The current threshold mode
   * @see getVideoThresholdMode()
   */
  getThresholdMode(): number {
    return this.artoolkitNFT.getThresholdMode();
  }

  /**
   * Set the labeling threshold.
   * This function forces sets the threshold value.
   * The default value is AR_DEFAULT_LABELING_THRESH which is 100.
   * The current threshold mode is not affected by this call.
   * Typically, this function is used when labeling threshold mode
   * is AR_LABELING_THRESH_MODE_MANUAL.
   * The threshold value is not relevant if threshold mode is
   * AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE.
   * Background: The labeling threshold is the value which
   * the AR library uses to differentiate between black and white
   * portions of an ARToolKit marker. Since the actual brightness,
   * contrast, and gamma of incoming images can vary signficantly
   * between different cameras and lighting conditions, this
   * value typically needs to be adjusted dynamically to a
   * suitable midpoint between the observed values for black
   * and white portions of the markers in the image.
   * @param {number} threshold An integer in the range [0,255] (inclusive).
   */
  setThreshold(threshold: number): number {
    return this.artoolkitNFT.setThreshold(threshold);
  }

  /**
   * Get the current labeling threshold.
   * This function queries the current labeling threshold. For,
   * AR_LABELING_THRESH_MODE_AUTO_MEDIAN, AR_LABELING_THRESH_MODE_AUTO_OTSU,
   * and AR_LABELING_THRESH_MODE_AUTO_BRACKETING
   * the threshold value is only valid until the next auto-update.
   * The current threshold mode is not affected by this call.
   * The threshold value is not relevant if threshold mode is
   * AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE.
   * @return {number} The current threshold value.
   */
  getThreshold(): number {
    return this.artoolkitNFT.getThreshold();
  }

  /**
   * Loads an NFT marker from the given URL or data string
   * @param {string} urlOrData - The URL prefix or data of the NFT markers to load.
   */
  async loadNFTMarker(
    urlOrData: string,
    onSuccess: (ids: number) => void,
    onError: (err: number) => void
  ): Promise<number[]> {
    let nft = await this.artoolkitNFT.addNFTMarkers(
      [urlOrData],
      (ids: number[]) => {
        this.nftMarkerCount += ids.length;
        onSuccess(ids[0]);
      },
      onError
    );
    return nft;
  }

  /**
   * Loads an array of NFT markers from the given URLs or data string
   * @param {string} urlOrData - The array of URLs prefix or data of the NFT markers to load.
   */
  async loadNFTMarkers(
    urlOrData: Array<string>,
    onSuccess: (ids: number[]) => void,
    onError: (err: number) => void
  ): Promise<number[]> {
    let nft = await this.artoolkitNFT.addNFTMarkers(
      urlOrData,
      (ids: number[]) => {
        this.nftMarkerCount += ids.length;
        onSuccess(ids);
      },
      onError
    );
    return nft;
  }

  /**
   * Set the image processing mode.
   * When the image processing mode is AR_IMAGE_PROC_FRAME_IMAGE,
   * ARToolKit processes all pixels in each incoming image
   * to locate markers. When the mode is AR_IMAGE_PROC_FIELD_IMAGE,
   * ARToolKit processes pixels in only every second pixel row and
   * column. This is useful both for handling images from interlaced
   * video sources (where alternate lines are assembled from alternate
   * fields and thus have one field time-difference, resulting in a
   * "comb" effect) such as Digital Video cameras.
   * The effective reduction by 75% in the pixels processed also
   * has utility in accelerating tracking by effectively reducing
   * the image size to one quarter size, at the cost of pose accuraccy.
   * @param {number} mode
   * Options for this field are:
   * AR_IMAGE_PROC_FRAME_IMAGE
   * AR_IMAGE_PROC_FIELD_IMAGE
   * The default mode is AR_IMAGE_PROC_FRAME_IMAGE.
   */
  setImageProcMode(mode: number): number {
    return this.artoolkitNFT.setImageProcMode(mode);
  }

  /**
   * Get the image processing mode.
   * See arSetImageProcMode() for a complete description.
   * @return {number} The current image processing mode.
   */
  getImageProcMode(): number {
    return this.artoolkitNFT.getImageProcMode();
  }

  /**
   * Set the custom gray data (videoLuma) in case you want to add additional
   * trasnformation to gray data: for example gaussianblur or boxblur
   * with external libs.
   * @param data Uint8Array
   */
  setGrayData(data: Uint8Array) {
    this.grayscaleEnabled = true;
    this.grayscaleSource = data;
  }

  // private accessors
  // ----------------------------------------------------------------------------
  /**
   * Used internally by ARControllerNFT, it permit to add methods to this.
   * @return {any} ARControllerNFT
   */
  private converter(): any {
    return this;
  }

  /**
   * This function init the ARControllerNFT with the necessary parmeters and variables.
   * Don't call directly this but instead instantiate a new ARControllerNFT.
   * @return {ARControllerNFT} The initialized ARControllerNFT instance
   */
  private async _initialize() {
    // initialize the toolkit
    this.artoolkitNFT = await new ARToolkitNFT().init();

    this.FS = this.artoolkitNFT.FS;
    this.StringList = this.artoolkitNFT.StringList;

    console.log("[ARControllerNFT]", "ARToolkitNFT initialized");

    // load the camera
    this.cameraId = await this.artoolkitNFT.loadCamera(this.cameraParam);
    console.log(
      "[ARControllerNFT]",
      "Camera params loaded with ID",
      this.cameraId
    );

    // setup
    this.id = this.artoolkitNFT.setup(this.width, this.height, this.cameraId);
    console.log("[ARControllerNFT]", "Got ID from setup", this.id);

    this._initNFT();

    this.framesize = this._width * this._height;

    this.videoLuma = new Uint8Array(this.framesize / 4);

    this.camera_mat = this.artoolkitNFT.getCameraLens();

    this.setProjectionNearPlane(0.1);
    this.setProjectionFarPlane(1000);

    setTimeout(() => {
      this.dispatchEvent({
        name: "load",
        target: this,
      });
    }, 1);

    return this;
  }

  /**
   * Init the necessary kpm handle for NFT and the settings for the CPU.
   * @return {number} 0 (void)
   */
  private _initNFT() {
    this.artoolkitNFT.setupAR2();
  }

  /**
   * Copy the Image data to the HEAP for the debugSetup function.
   * @return {number} 0 (void)
   */
  private _copyImageToHeap(sourceImage: IImageObj) {
    if (!sourceImage) {
      // default to preloaded image
      console.error("Error: no provided imageData to ARControllerNFT");
      return;
    }

    // this is of type Uint8ClampedArray:
    // The Uint8ClampedArray typed array represents an array of 8-bit unsigned
    // integers clamped to 0-255
    // @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8ClampedArray
    let data: Uint8ClampedArray;

    if (sourceImage.data) {
      // directly use source image
      data = sourceImage.data;
    }

    // Here we have access to the unmodified video image. We now need to add the videoLuma chanel to be able to serve the underlying ARTK API
    if (this.videoLuma) {
      if (this.grayscaleEnabled == false) {
        let q = 0;

        // Create luma from video data assuming Pixelformat AR_PIXEL_FORMAT_RGBA
        // see (ARToolKitJS.cpp L: 43)
        for (let p = 0; p < this.videoSize; p++) {
          let r = data[q + 0],
            g = data[q + 1],
            b = data[q + 2];
          // @see https://stackoverflow.com/a/596241/5843642
          this.videoLuma[p] = (r + r + r + b + g + g + g + g) >> 3;
          q += 4;
        }
      } else if (this.grayscaleEnabled == true) {
        this.videoLuma = this.grayscaleSource;
      }
    }

    if (this.videoLuma) {
      this.artoolkitNFT.passVideoData(data, this.videoLuma);
      return true;
    }

    return false;
  }
}
