import { INFTMarkerInfo, IImageObj, INFTMarker, ARLogLevel, NFTEventListener, NFTEvent } from "./abstractions/CommonInterfaces";
import { AbstractARControllerNFT } from "./abstractions/AbstractARControllerNFT";
export declare class ARControllerNFT implements AbstractARControllerNFT {
    private id;
    private _width;
    private _height;
    private _cameraParam;
    private cameraId;
    private artoolkitNFT;
    private FS;
    private StringList;
    private listeners;
    private nftMarkers;
    private transform_mat;
    private transformGL_RH;
    private camera_mat;
    private videoWidth;
    private videoHeight;
    private videoSize;
    private framesize;
    private videoLuma;
    private grayscaleEnabled;
    private grayscaleSource;
    private videoLumaInternal;
    private markerLostTracker;
    private nftMarkerCount;
    private defaultMarkerWidth;
    private _bwpointer;
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
     * @return {Promise<ARControllerNFT>} this
     */
    static initWithDimensions(width: number, height: number, cameraParam: string, internalLuma: boolean): Promise<ARControllerNFT>;
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
     * @return {Promise<ARControllerNFT>} this
     */
    static initWithImage(image: IImageObj, cameraParam: string, internalLuma: boolean): Promise<ARControllerNFT>;
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
     * @return {Promise<ARControllerNFT>} this
     */
    static customInit(width: number, height: number, cameraParam: string, internalLuma: boolean, callback: () => void): Promise<ARControllerNFT>;
    set width(width: number);
    get width(): number;
    set height(height: number);
    get height(): number;
    set cameraParam(cameraParam: string);
    get cameraParam(): string;
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
    process(image: IImageObj): void;
    /**
     * Detects the NFT markers in the process() function,
     * with the given tracked id.
     * @return {number}
     */
    detectNFTMarker(): number;
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
    trackNFTMarkerId(id: number, markerWidth?: number): INFTMarker;
    /**
     * Get the NFT marker info struct for the given NFT marker index in detected markers.
     * The returned object is the global artoolkitNFT.NFTMarkerInfo object and will be overwritten
     * by subsequent calls.
     * Returns undefined if no marker was found.
     * A markerIndex of -1 is used to access the global custom marker.
     * @param {number} markerIndex The index of the NFT marker to query.
     * @return {Object} The NFTMarkerInfo struct.
     */
    getNFTMarker(markerIndex: number): INFTMarkerInfo;
    /**
     * **GetNFTData** will return the width. height and dpi of the NFT marker.
     * @param id the internal id (this.id)
     * @param index the index of the NFT marker, in case you have multi NFT markers.
     * @returns {object}
     */
    getNFTData(index: number): object;
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
     * @param {string} name Name of the event to listen to.
     * @param {NFTEventListener} callback Callback function to call when an event with the given name is dispatched.
     */
    addEventListener(name: string, callback: NFTEventListener): void;
    /**
     * Remove an event listener from the named event. Only the first registration of
     * the callback is removed; a callback registered twice needs two calls. Safe to
     * call from inside a listener while the event is being dispatched: the current
     * dispatch still reaches every listener that was registered when it started.
     * @param {string} name Name of the event to stop listening to.
     * @param {NFTEventListener} callback Callback function to remove from the listeners of the named event.
     */
    removeEventListener(name: string, callback: NFTEventListener): void;
    /**
     * Dispatches the given event to all listeners registered on event.name, in
     * registration order, with `this` bound to the controller. The listener list is
     * snapshotted before the loop, so a listener that removes itself (or adds or
     * removes other listeners) during dispatch does not change which listeners the
     * current dispatch reaches; such changes apply from the next dispatch.
     * @param {NFTEvent} event Event to dispatch.
     */
    dispatchEvent(event: NFTEvent): void;
    /**
     * Sets up the square-marker detector's debug image: enables debug mode
     * and keeps the image's address.
     * @deprecated The image is never filled for NFT tracking: only the
     * square-marker labeling writes it, and NFT tracking never runs it. Will be
     * removed in the next major version (#659).
     */
    debugSetup(): void;
    /**
     * Converts the given 3x4 marker transformation matrix in the 12-element transMat array
     * into a 4x4 WebGL matrix and writes the result into the 16-element glMat array.
     * If scale parameter is given, scales the transform of the glMat by the scale parameter.
     * @param {Float64Array} transMat The 3x4 marker transformation matrix.
     * @param {Float64Array} glMat The 4x4 GL transformation matrix.
     * @param {number} scale The scale for the transform.
     * @return {Float64Array} the modified matrix
     */
    transMatToGLMat(transMat: Float64Array, glMat: Float64Array, scale?: number): Float64Array;
    /**
     * Converts the given 4x4 openGL matrix in the 16-element transMat array
     * into a 4x4 OpenGL Right-Hand-View matrix and writes the result into the 16-element glMat array.
     * If scale parameter is given, scales the transform of the glMat by the scale parameter.
     * @param {Float64Array} glMatrix The 4x4 marker transformation matrix.
     * @param {Float64Array} [glRhMatrix] The 4x4 GL right hand transformation matrix.
     * @param {number} [scale] The scale for the transform.
     * @return {Float64Array} the modified gl matrix
     */
    arglCameraViewRHf(glMatrix: Float64Array, glRhMatrix?: Float64Array, scale?: number): Float64Array;
    /**
     * Returns the 16-element WebGL transformation matrix used by ARControllerNFT.process to
     * pass marker WebGL matrices to event listeners.
     * Unique to each ARControllerNFT.
     * @return {Float64Array} The 16-element WebGL transformation matrix used by the ARControllerNFT.
     */
    getTransformationMatrix(): Float64Array;
    /**
     * Returns the projection matrix computed from camera parameters for the ARControllerNFT,
     * as of initialisation or the last call to recalculateCameraLens().
     * @return {Float64Array} The 16-element WebGL camera matrix for the ARControllerNFT camera parameters.
     */
    getCameraMatrix(): Float64Array;
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
    /**
     * Returns the Emscripten HEAP offset of the square-marker detector's
     * debug image.
     * @deprecated The image is never filled for NFT tracking: only the
     * square-marker labeling writes it, and NFT tracking never runs it. Will be
     * removed in the next major version (#659).
     * @return {number} HEAP offset of the debug image.
     */
    getProcessingImage(): number;
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
    setLogLevel(level: ARLogLevel | number): void;
    /**
     * Gets the logging level used by ARToolKit.
     * @return {number} return the log level in use.
     */
    getLogLevel(): number;
    /**
     * Sets the value of the near plane of the camera.
     * @param {number} value the value of the near plane
     * @return {number} 0 (void)
     */
    setProjectionNearPlane(value: number): void;
    /**
     * Gets the value of the near plane of the camera with the give id.
     * @return {number} the value of the near plane.
     */
    getProjectionNearPlane(): number;
    /**
     * Sets the value of the far plane of the camera.
     * @param {number} value the value of the far plane
     * @return {number} 0 (void)
     */
    setProjectionFarPlane(value: number): void;
    /**
     * Gets the value of the far plane of the camera with the give id.
     * @return {number} the value of the far plane.
     */
    getProjectionFarPlane(): number;
    /**
     * Rebuilds the camera frustum from the near and far planes set with
     * setProjectionNearPlane() and setProjectionFarPlane(), which only store them.
     * getCameraMatrix() returns the rebuilt matrix afterwards.
     */
    recalculateCameraLens(): void;
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
     * Loads an NFT marker from the given URL or data string.
     * This method is asynchronous and returns a Promise that resolves to an array of marker IDs.
     *
     * Example usage:
     * ```typescript
     * import ARControllerNFT from '@webarkit/jsartoolkit-nft';
     *
     * const arController = await ARControllerNFT.initWithDimensions(640, 480, "camera_para.dat");
     * arController.loadNFTMarker("path/to/marker.dat", (id) => {
     *   console.log("Marker loaded with ID:", id);
     * }, (err) => {
     *   console.error("Failed to load marker:", err);
     * });
     * ```
     * @param {string} urlOrData - The URL or data string of the NFT marker to load.
     * @param {function} onSuccess - Callback function to call when the marker is successfully loaded. Receives the marker ID as an argument.
     * @param {function} onError - Callback function to call when there is an error loading the marker. Receives the error code as an argument.
     * @return {Promise<number[]>} A Promise that resolves to an array of marker IDs.
     */
    loadNFTMarker(urlOrData: string, onSuccess: (ids: number) => void, onError: (err: number) => void): Promise<number[]>;
    /**
     * Loads an array of NFT markers from the given URLs or data strings.
     * This method is asynchronous and returns a Promise that resolves to an array of marker IDs.
     *
     * Example usage:
     * ```typescript
     * import ARControllerNFT from '@webarkit/jsartoolkit-nft';
     *
     * const arController = await ARControllerNFT.initWithDimensions(640, 480, "camera_para.dat");
     * arController.loadNFTMarkers(["path/to/marker1.dat", "path/to/marker2.dat"], (ids) => {
     *   console.log("Markers loaded with IDs:", ids);
     * }, (err) => {
     *   console.error("Failed to load markers:", err);
     * });
     * ```
     * @param {Array<string>} urlOrData - The array of URLs or data strings of the NFT markers to load.
     * @param {function} onSuccess - Callback function to call when the markers are successfully loaded. Receives an array of marker IDs as an argument.
     * @param {function} onError - Callback function to call when there is an error loading the markers. Receives the error code as an argument.
     * @return {Promise<number[]>} A Promise that resolves to an array of marker IDs.
     */
    loadNFTMarkers(urlOrData: Array<string>, onSuccess: (ids: number[]) => void, onError: (err: number) => void): Promise<number[]>;
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
    /**
     * Set the filtering mode.
     * @param {boolean} enableFiltering
     * @return {void}
     */
    setFiltering(enableFiltering: boolean): void;
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
    setContinuousDetection(enabled: boolean): void;
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
    /**
     * Set the custom gray data (videoLuma) in case you want to add additional
     * trasnformation to gray data: for example gaussianblur or boxblur
     * with external libs.
     * @param data Uint8Array
     */
    setGrayData(data: Uint8Array): void;
    /**
     * This function init the ARControllerNFT with the necessary parmeters and variables.
     * Don't call directly this but instead instantiate a new ARControllerNFT.
     * @return {ARControllerNFT} The initialized ARControllerNFT instance
     */
    private _initialize;
    /**
     * Init the necessary kpm handle for NFT and the settings for the CPU.
     * @return {number} 0 (void)
     */
    private _initNFT;
    /**
     * Copy the Image data to the HEAP for the debugSetup function.
     * @return {number} 0 (void)
     */
    private _copyImageToHeap;
}
