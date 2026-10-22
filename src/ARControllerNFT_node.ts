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
  ARLogLevel,
  NFTEventListener,
  NFTEvent,
} from "./abstractions/CommonInterfaces";
import { IARToolkitNFT_node } from "./abstractions/IARToolkitNFT_node";
import { ARToolkitNFT } from "./ARToolkitNFT_node";
import { AbstractARControllerNFT } from "./abstractions/AbstractARControllerNFT";
import { MarkerLostTracker } from "./MarkerLostTracker";
import { errorCode } from "./NFTLoadError";
const emitter = require('events').EventEmitter;

export class ARControllerNFT implements AbstractARControllerNFT {
  // private declarations
  private id: number;
  private _width: number;
  private _height: number;
  private _cameraParam: string;
  private cameraId: number;

  private artoolkitNFT: IARToolkitNFT_node;
  private FS: any;
  private StringList: any;

  // No prototype: an event name such as "toString" must not find an inherited
  // Object.prototype member instead of a listener array (#731).
  private listeners: Record<string, NFTEventListener[]> = Object.create(null);
  private em: any;
  private nftMarkers = new Map<number, INFTMarker>();

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

  // When each marker was last found, and where; drives lostNFTMarker per marker.
  private markerLostTracker: MarkerLostTracker<{
    matrix: Float64Array;
    matrixGL_RH: Float64Array;
  }>;
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

    this.em = new emitter();

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
    this.markerLostTracker = new MarkerLostTracker(200);
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
    cameraParam: string,
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
    cameraParam: string,
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
    callback: () => void,
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
   * Runs one tracking step on the given frame: copies the image to the WASM heap,
   * detects the loaded NFT markers and updates the state of every marker registered
   * with trackNFTMarkerId(). For each marker found it dispatches a "getNFTMarker"
   * event carrying the NFTMarkerInfo and the pose; for a tracked marker that has
   * not been seen for longer than the lost threshold it dispatches "lostNFTMarker"
   * once, with the last known pose (see MarkerLostTracker).
   * @param {IImageObj} image The frame to process (video, canvas, image or raw pixel data).
   * @return {void}
   */
  process(image: IImageObj): void {
    this._copyImageToHeap(image);

    // get NFT markers
    for (const o of this.nftMarkers.values()) {
      o.inPrevious = o.inCurrent;
      o.inCurrent = false;
    }

    // detect NFT markers
    let nftMarkerCount = this.nftMarkerCount;
    this.detectNFTMarker();

    const now = Date.now();

    for (let i = 0; i < nftMarkerCount; i++) {
      let nftMarkerInfo: IARToolkitNFT_node["NFTMarkerInfo"] = this.getNFTMarker(i);

      let markerType = ARToolkitNFT.NFT_MARKER;

      if (nftMarkerInfo.found) {
        let visible: INFTMarker = this.trackNFTMarkerId(i);
        visible.matrix.set(nftMarkerInfo.pose);
        visible.inCurrent = true;
        // A fresh matrix per event: with several markers found in one frame a
        // shared buffer would be overwritten by the next marker while a
        // listener still holds it.
        const matrix = this.transMatToGLMat(visible.matrix, new Float64Array(16));
        const matrixGL_RH = this.arglCameraViewRHf(matrix);
        this.transform_mat = matrix;
        this.transformGL_RH = matrixGL_RH;
        this.markerLostTracker.markFound(i, now, { matrix, matrixGL_RH });
        this.dispatchEvent({
          name: "getNFTMarker",
          target: this,
          data: {
            index: i,
            type: markerType,
            marker: nftMarkerInfo,
            matrix: matrix,
            matrixGL_RH: matrixGL_RH,
          },
        });
      } else {
        const lastSeen = this.markerLostTracker.checkLost(i, now);
        if (lastSeen) {
          this.dispatchEvent({
            name: "lostNFTMarker",
            target: this,
            data: {
              index: i,
              type: markerType,
              marker: nftMarkerInfo,
              matrix: lastSeen.matrix,
              matrixGL_RH: lastSeen.matrixGL_RH,
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
   * Adds the given NFT marker ID to the set of tracked IDs, or returns the existing
   * entry if the ID is already tracked. Used by process() to implement continuous
   * tracking: the entry keeps the marker's transformation matrices and its
   * visibility in the current and previous frame.
   * @param {number} id ID of the NFT marker to track.
   * @param {number} [markerWidth] Width of the marker; overrides the width of an
   *   already tracked entry, and falls back to defaultMarkerWidth for a new one.
   * @return {INFTMarker} The marker tracking object (the same object on every call for a given ID).
   */
  trackNFTMarkerId(id: number, markerWidth?: number): INFTMarker {
    let obj = this.nftMarkers.get(id);
    if (!obj) {
      obj = {
        inPrevious: false,
        inCurrent: false,
        matrix: new Float64Array(12),
        matrixGL_RH: new Float64Array(12),
        markerWidth: markerWidth || this.defaultMarkerWidth,
      };
      this.nftMarkers.set(id, obj);
    }
    if (markerWidth) {
      obj.markerWidth = markerWidth;
    }
    return obj;
  }

  // marker detection routines
  // ----------------------------------------------------------------------------

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
   * @param index the index of the NFT marker, in case you have multi NFT markers.
   * @returns {object}
   */
  getNFTData(index: number) {
    return this.artoolkitNFT.getNFTData(index);
  }

  // event handling
  //----------------------------------------------------------------------------
  on(name: string, callback: object) {
    this.em.on(name, callback);
  }
  /**
   * Add an event listener on this ARControllerNFT for the named event, calling the callback function
   * whenever that event is dispatched.
   * Possible events are:
   * - getNFTMarker - dispatched by process() for every NFT marker found in the frame
   * - lostNFTMarker - dispatched by process() once a tracked NFT marker has been out of
   *   view for longer than the lost threshold (a single missed frame is not a loss)
   * - load - dispatched when the ARControllerNFT is ready to use (useful if passing in a camera URL in the constructor)
   *
   * Listeners are kept in an array, not a set: registering the same callback twice
   * makes it fire twice per event, and each removeEventListener() call drops one
   * registration.
   * Listeners added through on() (EventEmitter) are notified too, after these.
   * @param {string} name Name of the event to listen to.
   * @param {NFTEventListener} callback Callback function to call when an event with the given name is dispatched.
   */
  addEventListener(name: string, callback: NFTEventListener): void {
    (this.listeners[name] ??= []).push(callback);
  }

  /**
   * Remove an event listener from the named event. Only the first registration of
   * the callback is removed; a callback registered twice needs two calls. Safe to
   * call from inside a listener while the event is being dispatched: the current
   * dispatch still reaches every listener that was registered when it started.
   * @param {string} name Name of the event to stop listening to.
   * @param {NFTEventListener} callback Callback function to remove from the listeners of the named event.
   */
  removeEventListener(name: string, callback: NFTEventListener): void {
    const list = this.listeners[name];
    if (!list) return;
    const i = list.indexOf(callback);
    if (i > -1) list.splice(i, 1);
  }

  /**
   * Dispatches the given event to all listeners registered on event.name, in
   * registration order, with `this` bound to the controller. The listener list is
   * snapshotted before the loop, so a listener that removes itself (or adds or
   * removes other listeners) during dispatch does not change which listeners the
   * current dispatch reaches; such changes apply from the next dispatch.
   * The event is then re-emitted on the internal EventEmitter for listeners
   * registered through on().
   * @param {NFTEvent} event Event to dispatch.
   */
  dispatchEvent(event: NFTEvent): void {
    const list = this.listeners[event.name];
    if (list) {
      // Iterate over a snapshot: a listener may remove itself during dispatch.
      for (const cb of list.slice()) cb.call(this, event);
    }
    // Always notify the EventEmitter listeners registered via on(), also when no
    // addEventListener() listener exists for this name: examples/node uses on() (#731).
    this.em.emit(event.name, event);
  }

  // debug stuff
  //----------------------------------------------------------------------------

  /**
   * Sets up the square-marker detector's debug image: enables debug mode
   * and keeps the image's address.
   * @deprecated The image is never filled for NFT tracking: only the
   * square-marker labeling writes it, and NFT tracking never runs it. Will be
   * removed in the next major version (#659).
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
    scale?: number,
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
    scale?: number,
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
   * Returns the projection matrix computed from camera parameters for the ARControllerNFT,
   * as of initialisation or the last call to recalculateCameraLens().
   * @return {Float64Array} The 16-element WebGL camera matrix for the ARControllerNFT camera parameters.
   */
  getCameraMatrix(): Float64Array {
    return this.camera_mat;
  }

  // Setter / Getter Proxies
  //----------------------------------------------------------------------------

  /**
   * Enables or disables the square-marker detector's debug mode.
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @param {boolean} mode true to enable debug mode, false to disable it
   */
  setDebugMode(mode: boolean): number {
    return this.artoolkitNFT.setDebugMode(mode);
  }

  /**
   * Returns whether the square-marker detector's debug mode is enabled.
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @return {boolean} true when debug mode is enabled
   */
  getDebugMode(): boolean {
    return this.artoolkitNFT.getDebugMode();
  }

  /**
   * Returns the Emscripten HEAP offset of the square-marker detector's
   * debug image.
   * @deprecated The image is never filled for NFT tracking: only the
   * square-marker labeling writes it, and NFT tracking never runs it. Will be
   * removed in the next major version (#659).
   * @return {number} HEAP offset of the debug image.
   */
  getProcessingImage(): number {
    return this.artoolkitNFT.getProcessingImage();
  }

  /**
   * Sets the logging level to use by ARToolKit.
   * @param {number} mode type for the log level.
   */
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
  setLogLevel(level: ARLogLevel | number): void {
    this.artoolkitNFT.setLogLevel(level);
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
   * Rebuilds the camera frustum from the near and far planes set with
   * setProjectionNearPlane() and setProjectionFarPlane(), which only store them.
   * getCameraMatrix() returns the rebuilt matrix afterwards.
   */
  recalculateCameraLens(): void {
    this.artoolkitNFT.recalculateCameraLens();
    this.camera_mat = this.artoolkitNFT.getCameraLens();
  }

  /**
   * Sets the square-marker labeling threshold mode (auto/manual).
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @param {number} mode One of the AR_LABELING_THRESH_MODE_* values.
   */
  setThresholdMode(mode: number): number {
    return this.artoolkitNFT.setThresholdMode(mode);
  }

  /**
   * Returns the square-marker labeling threshold mode.
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @return {number} The current threshold mode.
   */
  getThresholdMode(): number {
    return this.artoolkitNFT.getThresholdMode();
  }

  /**
   * Sets the square-marker labeling threshold.
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @param {number} threshold An integer in the range [0,255] (inclusive).
   */
  setThreshold(threshold: number): number {
    return this.artoolkitNFT.setThreshold(threshold);
  }

  /**
   * Returns the square-marker labeling threshold.
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @return {number} The current threshold value.
   */
  getThreshold(): number {
    return this.artoolkitNFT.getThreshold();
  }

  /**
   * Loads one NFT marker. See {@link loadNFTMarkers} for the callback rule.
   * @param {string} markerURL - Path of the descriptor files without extension,
   * relative to the working directory.
   * @param {function} onSuccess - Called with the marker id.
   * @param {function} onError - Called with -1 on failure.
   * @return {Promise<number[]>} The ids, in a settled Promise.
   */
  loadNFTMarker(
    markerURL: string,
    onSuccess?: (id: number) => void,
    onError?: (code: number) => void,
  ): Promise<number[]> {
    return this.loadNFTMarkers(
      [markerURL],
      onSuccess ? (ids: number[]) => onSuccess(ids[0]) : undefined,
      onError,
    );
  }

  /**
   * Loads an array of NFT markers.
   *
   * The callback rule (#685, D8): a call that passes a callback never rejects
   * because of a load failure. `onError` gets the code (-1), or `console.error`
   * is used when there is none, and the Promise resolves `[]`. A call with no
   * callbacks rejects with an NFTLoadError. A throw from the caller's own
   * callback rejects the Promise and does not reach `onError`.
   *
   * D9: this is deliberately not `async`. Node reads the files in place, so
   * the work is synchronous, and the callbacks fire before the method returns,
   * as before. A script that calls `process()` right after `loadNFTMarker()`
   * keeps working. The returned Promise is already settled. `withCallbacks` is
   * not used, because it would defer the callbacks to a microtask.
   * @param {Array<string>} markerURLs - Paths without extension, relative to the
   * working directory.
   * @param {function} onSuccess - Called with the ids.
   * @param {function} onError - Called with -1 on failure.
   * @return {Promise<number[]>} The ids, in a settled Promise.
   */
  loadNFTMarkers(
    markerURLs: Array<string>,
    onSuccess?: (ids: number[]) => void,
    onError?: (code: number) => void,
  ): Promise<number[]> {
    let ids: number[];
    try {
      ids = this.artoolkitNFT.tryAddNFTMarkers(markerURLs);
    } catch (e) {
      if (!onSuccess && !onError) return Promise.reject(e);
      try {
        // Log even when onError is given (spec, Node variant): the old toolkit
        // logged which file was missing, and the numeric code alone (-1)
        // cannot tell a Node script what failed.
        console.error(e);
        if (onError) onError(errorCode(e));
      } catch (cbErr) {
        return Promise.reject(cbErr);
      }
      return Promise.resolve([]);
    }
    this.nftMarkerCount += ids.length;
    try {
      onSuccess?.(ids);
    } catch (cbErr) {
      return Promise.reject(cbErr);
    }
    return Promise.resolve(ids);
  }

  /**
   * Sets the square-marker detector's image processing mode (frame or
   * field).
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @param {number} mode AR_IMAGE_PROC_FRAME_IMAGE or AR_IMAGE_PROC_FIELD_IMAGE.
   */
  setImageProcMode(mode: number): number {
    return this.artoolkitNFT.setImageProcMode(mode);
  }

  /**
   * Returns the square-marker detector's image processing mode.
   * @deprecated Has no effect on NFT tracking: only the square-marker labeling
   * reads it, and NFT tracking never runs it. Will be removed in the next major
   * version (#659).
   * @return {number} The current image processing mode.
   */
  getImageProcMode(): number {
    return this.artoolkitNFT.getImageProcMode();
  }

  /**
   * Set the filtering mode.
   * @param {boolean} enableFiltering
   * @return {void}
   */
  setFiltering(enableFiltering: boolean): void {
    this.artoolkitNFT.setFiltering(enableFiltering);
  }

  /**
   * Turn continuous detection on or off.
   *
   * Detection (KPM) is the expensive step that finds a marker which is not yet
   * tracked; a pass costs the full detection time on the frame where it runs,
   * far more than tracking an already-found marker. The policy is:
   * - while no marker is tracked, detection runs on every frame;
   * - while at least one marker is tracked and at least one loaded marker is
   *   not, detection runs at most once per detection interval (see
   *   {@link setDetectionInterval}), so a marker that enters the view is still
   *   picked up;
   * - while every loaded marker is tracked, detection does not run.
   *
   * With continuous detection off, no detection runs once any marker is
   * tracked, until tracking is lost: the single-marker behaviour of 1.12.0.
   * That is cheapest, but a second marker entering the view is not found
   * while the first one is held.
   * @param {boolean} enabled Default `true`.
   * @return {void}
   */
  setContinuousDetection(enabled: boolean): void {
    this.artoolkitNFT.setContinuousDetection(enabled);
  }

  /**
   * Set the minimum time from the end of one detection pass to the start of
   * the next, while at least one marker is tracked and at least one is not
   * (see {@link setContinuousDetection}).
   *
   * Detection is measured in time, not frames. A longer interval spends less
   * time detecting, at the cost of noticing a newly visible marker later;
   * `0` detects on every frame, which costs the full detection time on every
   * frame while any loaded marker is out of view.
   * @param {number} ms Milliseconds. `0` means every frame; negative values
   * are treated as `0`. Default: `300`.
   * @return {void}
   */
  setDetectionInterval(ms: number): void {
    this.artoolkitNFT.setDetectionInterval(ms);
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
      this.cameraId,
    );

    // setup
    this.id = this.artoolkitNFT.setup(this.width, this.height, this.cameraId);
    console.log("[ARControllerNFT]", "Got ID from setup", this.id);

    this._initNFT();

    this.framesize = this._width * this._height;

    this.videoLuma = new Uint8Array(this.framesize);
    
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
    //let data: Uint8ClampedArray;

    /*if (sourceImage.data) {
      // directly use source image
      data = sourceImage.data;
    }*/

    const data = new Uint8Array(this.videoSize * 4);
    //@ts-ignore
    data.set(sourceImage);

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
          if (r > 255) {
            console.error("not in range");
          }
          // @see https://stackoverflow.com/a/596241/5843642
          this.videoLuma[p] = (r + r + r + b + g + g + g + g) >> 3;
          q += 4;
        }
      } else if (this.grayscaleEnabled == true) {
        this.videoLuma = this.grayscaleSource;
      }
    }

    if (this.videoLuma) {
      //@ts-ignore
      this.artoolkitNFT.passVideoData(sourceImage, this.videoLuma, false);
      return true;
    }

    return false;
  }
}
