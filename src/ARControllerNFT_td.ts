/*
 *  ARControllerNFT_td.ts
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
import { IImageObj, ARInitOptions } from "./abstractions/CommonInterfaces";
import { ARToolkitNFT } from "./ARToolkitNFT_td";
import { ARControllerNFTBase } from "./ARControllerNFTBase";

// The controller of the threaded build. All of its behaviour is in
// ARControllerNFTBase; this class names the build's ARToolkitNFT and declares the
// public constructors and static factories, whose types name this class (#734,
// D4). A plain comment, not JSDoc, so the published documentation stays as it was (the
// JSDoc below is only the deployment note, D13).
// Declare no instance fields here: with ESNext class fields, a field declared in
// a subclass is reset to `undefined` after the base constructor has set it.
/**
 * Threaded build: serve `ARToolkitNFT_td.worker.js` next to the script that loads this
 * bundle (with a plain `<script>` tag, the folder of `ARToolkitNFT_td.js`; with
 * `importScripts()`, the calling worker's folder; in re-bundled apps, see the README
 * section "Threaded build: deploying"), with the COOP/COEP headers.
 */
export class ARControllerNFT extends ARControllerNFTBase {
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
   * @param {boolean} internalLuma
   */
  constructor(
    width: number,
    height: number,
    cameraParam: string,
    internalLuma: boolean,
  );
  constructor(
    width?: number,
    height?: number,
    cameraParam?: string,
    internalLuma?: boolean,
  ) {
    super(ARToolkitNFT, width, height, cameraParam, internalLuma);
  }

  /** The static method **initWithDimensions** is the start of your app.
   *  Define it with the width and height of the video stream
   *  and the camera parameter file path. It return a Promise with the ARControllerNFT object.
   *  Use a thenable to load the NFT marker and all the code stuff.
   *  Example:
   *  ```js
   *    import ARControllerNFT from '@webarkit/jsartoolkit-nft'
   *    ARControllerNFT.initWithDimensions(640, 480, "camera_para.dat", true).then(
   *    (nft) => {
   *      nft.loadNFTMarker();
   *      // other code...
   *    })
   *  ```
   * @param {number} width
   * @param {number} height
   * @param {string} cameraParam
   * @param {boolean} internalLuma
   * @param {ARInitOptions} [options] `logLevel` is applied before the core is constructed,
   * so the start-up output follows it (#677). Per controller in JS.
   * @return {Promise<ARControllerNFT>} this
   */
  static async initWithDimensions(
    width: number,
    height: number,
    cameraParam: string,
    internalLuma: boolean,
    options?: ARInitOptions,
  ): Promise<ARControllerNFT> {
    // directly init with given width / height
    // Names ARControllerNFT rather than `new this(...)`: a consumer's subclass gets a
    // plain ARControllerNFT from here, as before #734.
    const arControllerNFT = new ARControllerNFT(
      width,
      height,
      cameraParam,
      internalLuma,
    );
    return await arControllerNFT._initialize(options);
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
   *    ARControllerNFT.initWithImage(image, "camera_para.dat", true).then(
   *    (nft) => {
   *      nft.loadNFTMarker();
   *      // other code...
   *    })
   *  ```
   * @param {image} image
   * @param {string} cameraParam
   * @param {boolean} internalLuma
   * @param {ARInitOptions} [options] `logLevel` is applied before the core is constructed,
   * so the start-up output follows it (#677). Per controller in JS.
   * @return {Promise<ARControllerNFT>} this
   */
  static async initWithImage(
    image: IImageObj,
    cameraParam: string,
    internalLuma: boolean,
    options?: ARInitOptions,
  ): Promise<ARControllerNFT> {
    const width = image.videoWidth || image.width;
    const height = image.videoHeight || image.height;
    // Names ARControllerNFT rather than `new this(...)`: a consumer's subclass gets a
    // plain ARControllerNFT from here, as before #734.
    const arControllerNFT = new ARControllerNFT(
      width,
      height,
      cameraParam,
      internalLuma,
    );
    return await arControllerNFT._initialize(options);
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
   *    true,
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
   * @param {boolean} internalLuma
   * @param {function} callback
   * @param {ARInitOptions} [options] `logLevel` is applied before the core is constructed,
   * so the start-up output follows it (#677). Per controller in JS.
   * @return {Promise<ARControllerNFT>} this
   */
  static async customInit(
    width: number,
    height: number,
    cameraParam: string,
    internalLuma: boolean,
    callback: () => void,
    options?: ARInitOptions,
  ): Promise<ARControllerNFT> {
    // Names ARControllerNFT rather than `new this(...)`: a consumer's subclass gets a
    // plain ARControllerNFT from here, as before #734.
    const arControllerNFT = new ARControllerNFT(
      width,
      height,
      cameraParam,
      internalLuma,
    );
    callback();
    return await arControllerNFT._initialize(options);
  }

  // Overridden only to publish this build's documentation: detection runs on a
  // worker here, and the native default is 0, not 300 (#734, D5).
  /**
   * Set the minimum time from the end of one detection pass to the start of
   * the next, while at least one marker is tracked and at least one is not
   * (see {@link setContinuousDetection}).
   *
   * Detection is measured in time, not frames. A longer interval spends less
   * time detecting, at the cost of noticing a newly visible marker later.
   * This build detects on a worker thread, one search at a time, so a search
   * does not block `process()`; `0` starts a new one whenever the worker is
   * free, and an interval here only saves worker CPU.
   * @param {number} ms Milliseconds. `0` means no throttling; negative values
   * are treated as `0`. Default: `0`.
   * @return {void}
   */
  public setDetectionInterval(ms: number): void {
    super.setDetectionInterval(ms);
  }
}
