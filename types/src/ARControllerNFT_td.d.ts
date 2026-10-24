import { IImageObj, ARInitOptions } from "./abstractions/CommonInterfaces";
import { ARControllerNFTBase } from "./ARControllerNFTBase";
/**
 * Threaded build: serve `ARToolkitNFT_td.worker.js` from the same folder as
 * `ARToolkitNFT_td.js` (the pthread worker is loaded next to the bundle), with the
 * COOP/COEP headers.
 */
export declare class ARControllerNFT extends ARControllerNFTBase {
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
    constructor(width: number, height: number, cameraParam: string, internalLuma: boolean);
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
    static initWithDimensions(width: number, height: number, cameraParam: string, internalLuma: boolean, options?: ARInitOptions): Promise<ARControllerNFT>;
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
    static initWithImage(image: IImageObj, cameraParam: string, internalLuma: boolean, options?: ARInitOptions): Promise<ARControllerNFT>;
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
    static customInit(width: number, height: number, cameraParam: string, internalLuma: boolean, callback: () => void, options?: ARInitOptions): Promise<ARControllerNFT>;
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
    setDetectionInterval(ms: number): void;
}
