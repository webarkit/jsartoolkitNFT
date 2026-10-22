; (function () {
    'use strict'

    let scope;
    if (typeof window !== 'undefined') {
        scope = window;
    } else if (typeof global !== 'undefined') {
        scope = global;
    } else {
        scope = self;
    }

    /**
     The ARControllerNFT is the main object for doing AR marker detection with JSARToolKit.

     To use an ARControllerNFT, you need to tell it the dimensions to use for the AR processing canvas and
     pass it an ARCameraParamNFT to define the camera parameters to use when processing images.
     The ARCameraParamNFT defines the lens distortion and aspect ratio of the camera used.
     See https://www.artoolworks.com/support/library/Calibrating_your_camera for more information about AR camera parameters and how to make and use them.

     If you pass an image as the first argument, the ARControllerNFT uses that as the image to process,
     using the dimensions of the image as AR processing canvas width and height. If the first argument
     to ARControllerNFT is an image, the second argument is used as the camera param.

     The camera parameters argument can be either an ARCameraParamNFT or an URL to a camera definition file.
     If the camera argument is an URL, it is loaded into a new ARCameraParamNFT, and the ARControllerNFT dispatches
     a 'load' event and calls the onload method if it is defined.

     @exports ARControllerNFT
     @constructor

     @param {number} width The width of the images to process.
     @param {number} height The height of the images to process.
     @param {ARCameraParamNFT | string} camera The ARCameraParamNFT to use for image processing. If this is a string, the ARControllerNFT treats it as an URL and tries to load it as a ARCameraParamNFT definition file, calling ARControllerNFT#onload on success.
     @param {boolean} internalLuma Whether to use internal luma processing.
     */
    const ARControllerNFT = function (width, height, cameraPara, internalLuma) {
        this.id = undefined;
        const w = width, h = height;

        this.listeners = {};

        this.width = w;
        this.height = h;

        this.nftMarkerCount = 0;

        this.nftMarkers = {};
        this.transform_mat = new Float32Array(16);
        this.transformGL_RH = new Float64Array(16);

        this.videoWidth = w;
        this.videoHeight = h;
        this.videoSize = this.videoWidth * this.videoHeight;

        this.framepointer = null;
        this.framesize = null;
        this.dataHeap = null;
        this.videoLuma = null;
        this.videoLumaInternal = internalLuma;
        this.camera_mat = null;
        this.videoLumaPointer = null;
        this._bwpointer = undefined;
        this._lumaCtx = undefined;

        this.version = '1.14.0';
        console.info('JsartoolkitNFT ', this.version);
        console.warn("This library is deprecated, use the ES6 version instead!! It will be removed in a future release.")

        if (typeof cameraPara === 'string') {
            this.cameraParam = new ARCameraParamNFT(cameraPara, function () {
                this._initialize();
            }.bind(this), function (err) {
                console.error("ARControllerNFT: Failed to load ARCameraParamNFT", err);
                this.onload(err);
            }.bind(this));
        } else {
            this.cameraParam = cameraPara;
            this._initialize();
        }
    };

    /**
        Destroys the ARControllerNFT instance and frees all associated resources.
        After calling dispose, the ARControllerNFT can't be used any longer. Make a new one if you need one.

        Calling this avoids leaking Emscripten memory, which may be important if you're using multiple ARControllerNFTs.
    */
    ARControllerNFT.prototype.dispose = function () {
        // It is possible to call dispose on an ARControllerNFT that was never initialized. But if it was never initialized the id is undefined.
        if (this.id > -1) {
            artoolkitNFT.teardown(this.id);
        }

        if (this.videoFramePtr) {
            Module._free(this.videoFramePtr);
            this.videoFramePtr = null;
        }

        if (this.videoLumaPtr) {
            Module._free(this.videoLumaPtr);
            this.videoLumaPtr = null;
        }

        for (const t in this) {
            this[t] = null;
        }
    };

    /**
        Detects NFT markers in the given image. The process method dispatches marker detection events during its run.

        The NFT marker detection process proceeds by first dispatching a getNFTMarker event for each found NFT marker.

        Instead, if a NFT marker is lost, a lostNFTMarker event is dispatched.

            ARControllerNFT.addEventListener('getNFTMarker', function(ev) {
                // do stuff
            });

            ARControllerNFT.addEventListener('lostNFTMarker', function(ev) {
               // do stuff
            });

            ARControllerNFT.process(image);


        If no image is given, defaults to this.image.

        If the debugSetup has been called, draws debug markers on the debug canvas.

        @param {ImageElement | VideoElement} image The image to process [optional].
    */
    ARControllerNFT.prototype.process = function (image) {
        this._copyImageToHeap(image);

        // get NFT markers
        let k, o;
        for (k in this.nftMarkers) {
            o = this.nftMarkers[k];
            o.inPrevious = o.inCurrent;
            o.inCurrent = false;
        }

        // detect NFT markers
        const nftMarkerCount = this.nftMarkerCount;
        this.detectNFTMarker();

        // in ms
        const MARKER_LOST_TIME = 200;

        for (let i = 0; i < nftMarkerCount; i++) {
            const nftMarkerInfo = this.getNFTMarker(i);
            const markerType = artoolkitNFT.NFT_MARKER;

            if (nftMarkerInfo.found) {
                self.markerFound = i;
                self.markerFoundTime = Date.now();

                const visible = this.trackNFTMarkerId(i);
                visible.matrix.set(nftMarkerInfo.pose);
                visible.inCurrent = true;
                this.transMatToGLMat(visible.matrix, this.transform_mat);
                this.transformGL_RH = this.arglCameraViewRHf(this.transform_mat);
                this.dispatchEvent({
                    name: 'getNFTMarker',
                    target: this,
                    data: {
                        index: i,
                        type: markerType,
                        marker: nftMarkerInfo,
                        matrix: this.transform_mat,
                        matrixGL_RH: this.transformGL_RH
                    }
                });
            } else if (self.markerFound === i) {
                // for now this marker found/lost events handling is for one marker at a time
                if ((Date.now() - self.markerFoundTime) <= MARKER_LOST_TIME) {
                    // not handling marker lost for less than specified time
                    return;
                }

                delete self.markerFound;

                this.dispatchEvent({
                    name: 'lostNFTMarker',
                    target: this,
                    data: {
                        index: i,
                        type: markerType,
                        marker: nftMarkerInfo,
                        matrix: this.transform_mat,
                        matrixGL_RH: this.transformGL_RH
                    }
                });
            }
        }
    };
    /**
      Detects the NFT markers in the process() function,
      with the given tracked id.
    */
    ARControllerNFT.prototype.detectNFTMarker = function () {
        artoolkitNFT.detectNFTMarker(this.id);
    };

    /**
        Adds the given NFT marker ID to the index of tracked IDs.
        Sets the markerWidth for the pattern marker to markerWidth.

        Used by process() to implement continuous tracking,
        keeping track of the marker's transformation matrix
        and customizable marker widths.

        @param {number} id ID of the NFT marker to track.
        @param {number} markerWidth The width of the marker to track.
        @return {Object} The marker tracking object.
    */
    ARControllerNFT.prototype.trackNFTMarkerId = function (id, markerWidth) {
        let obj = this.nftMarkers[id];
        if (!obj) {
            this.nftMarkers[id] = obj = {
                inPrevious: false,
                inCurrent: false,
                matrix: new Float64Array(12),
                matrixGL_RH: new Float64Array(12),
                markerWidth: markerWidth || this.defaultMarkerWidth
            };
        }
        if (markerWidth) {
            obj.markerWidth = markerWidth;
        }
        return obj;
    };

    /**
        Add an event listener on this ARControllerNFT for the named event, calling the callback function
        whenever that event is dispatched.

        Possible events are:
          * getNFTMarker - dispatched whenever process() finds a NFT marker
          * load - dispatched when the ARControllerNFT is ready to use (useful if passing in a camera URL in the constructor)

        @param {string} name Name of the event to listen to.
        @param {function} callback Callback function to call when an event with the given name is dispatched.
    */
    ARControllerNFT.prototype.addEventListener = function (name, callback) {
        if (!this.listeners[name]) {
            this.listeners[name] = [];
        }
        this.listeners[name].push(callback);
    };

    /**
        Remove an event listener from the named event.

        @param {string} name Name of the event to stop listening to.
        @param {function} callback Callback function to remove from the listeners of the named event.
    */
    ARControllerNFT.prototype.removeEventListener = function (name, callback) {
        if (this.listeners[name]) {
            var index = this.listeners[name].indexOf(callback);
            if (index > -1) {
                this.listeners[name].splice(index, 1);
            }
        }
    };

    /**
        Dispatches the given event to all registered listeners on event.name.

        @param {Object} event Event to dispatch.
    */
    ARControllerNFT.prototype.dispatchEvent = function (event) {
        const listeners = this.listeners[event.name];
        if (listeners) {
            for (let i = 0; i < listeners.length; i++) {
                listeners[i].call(this, event);
            }
        }
    };

    /**
        Sets up a debug canvas for the AR detection. Draws a red marker on top of each detected square in the image.

        The debug canvas is added to document.body.
    */
    ARControllerNFT.prototype.debugSetup = function () {
        this.setDebugMode(true);
        this._bwpointer = this.getProcessingImage();
    };

    /**
        Loads an NFT marker from the given URL prefix and calls the onSuccess callback with the UID of the marker.

        ARControllerNFT.loadNFTMarker(markerURL, onSuccess, onError);

        @param {string} markerURLs - List of the URL prefix of the NFT markers to load.
        @param {function} onSuccess - The success callback. Called with the id of the loaded marker on a successful load.
        @param {function} onError - The error callback. Called with the encountered error if the load fails.
    */
    ARControllerNFT.prototype.loadNFTMarkers = function (markerURLs, onSuccess, onError) {
        const self = this;
        artoolkitNFT.addNFTMarkers(this.id, markerURLs, function (ids) {
            self.nftMarkerCount += ids.length;
            if (onSuccess) onSuccess(ids);
        }, onError);
    };

    ARControllerNFT.prototype.loadNFTMarker = function (markerURL, onSuccess, onError) {
        if (markerURL) {
            this.loadNFTMarkers([markerURL], function (ids) {
                if (onSuccess) onSuccess(ids[0]);
            }, onError);
        } else {
            if (onError) {
                onError("Marker URL needs to be defined and not equal empty string!");
            }
            else {
                console.error("Marker URL needs to be defined and not equal empty string!");
            }
        }

    };

    /**
        Converts the given 3x4 marker transformation matrix in the 12-element transMat array
        into a 4x4 WebGL matrix and writes the result into the 16-element glMat array.

        If scale parameter is given, scales the transform of the glMat by the scale parameter.

        @param {Float64Array} transMat The 3x4 marker transformation matrix.
        @param {Float64Array} glMat The 4x4 GL transformation matrix.
        @param {number} scale The scale for the transform.
    */
    ARControllerNFT.prototype.transMatToGLMat = function (transMat, glMat, scale) {
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
    };

    /**
        Converts the given 4x4 openGL matrix in the 16-element transMat array
        into a 4x4 OpenGL Right-Hand-View matrix and writes the result into the 16-element glMat array.
        If scale parameter is given, scales the transform of the glMat by the scale parameter.

        @param {Float64Array} glMatrix The 4x4 marker transformation matrix.
        @param {Float64Array} [glRhMatrix] The 4x4 GL right hand transformation matrix.
        @param {number} [scale] The scale for the transform.
    */
    ARControllerNFT.prototype.arglCameraViewRHf = function (glMatrix, glRhMatrix, scale) {
        let m_modelview;
        if (glRhMatrix == undefined)
            m_modelview = new Float64Array(16);
        else
            m_modelview = glRhMatrix;

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
    };

    /**
        Get the NFT marker info struct for the given NFT marker index in detected markers.
        The returned object is the global artoolkit.NFTMarkerInfo object and will be overwritten
        by subsequent calls.

        Returns undefined if no marker was found.

        A markerIndex of -1 is used to access the global custom marker.

        @param {number} markerIndex The index of the NFT marker to query.
        @returns {Object} The NFTmarkerInfo struct.
    */
    ARControllerNFT.prototype.getNFTMarker = function (markerIndex) {
        return artoolkitNFT.getNFTMarker(this.id, markerIndex);
    };

    /**
     * Get the NFT data (id, dpi, width and height) of the NFT marker.
     * @returns {Object} nft object (id, dpi, width, height)
     */
    ARControllerNFT.prototype.getNFTData = function (index) {
        return artoolkitNFT.getNFTData(this.id, index);
    };


    /**
        Returns the 16-element WebGL transformation matrix used by ARControllerNFT.process to
        pass marker WebGL matrices to event listeners.

        Unique to each ARControllerNFT.

        @return {Float64Array} The 16-element WebGL transformation matrix used by the ARControllerNFT.
    */
    ARControllerNFT.prototype.getTransformationMatrix = function () {
        return this.transform_mat;
    };

    /**
     * Returns the projection matrix computed from camera parameters for the ARControllerNFT.
     *
     * @return {Float64Array} The 16-element WebGL camera matrix for the ARControllerNFT camera parameters.
     */
    ARControllerNFT.prototype.getCameraMatrix = function () {
        return this.camera_mat;
    };

    /* Setter / Getter Proxies */

    /**
     * Enables or disables debug mode in the tracker. When enabled, a black and white debug
     * image is generated during marker detection. The debug image is useful for visualising
     * the binarization process and choosing a threshold value.
     * @param {boolean} mode		true to enable debug mode, false to disable debug mode
     * @see				getDebugMode()
     */
    ARControllerNFT.prototype.setDebugMode = function (mode) {
        return artoolkitNFT.setDebugMode(this.id, mode);
    };

    /**
     * Returns whether debug mode is currently enabled.
     * @return {boolean}	true when debug mode is enabled, false when debug mode is disabled
     * @see					setDebugMode()
     */
    ARControllerNFT.prototype.getDebugMode = function () {
        return artoolkitNFT.getDebugMode(this.id);
    };

    /**
        Returns the Emscripten HEAP offset to the debug processing image used by ARToolKit.

        @return {number} HEAP offset to the debug processing image.
    */
    ARControllerNFT.prototype.getProcessingImage = function () {
        return artoolkitNFT.getProcessingImage(this.id);
    };

    /**
        Sets the logging verbosity used by ARToolKit.

        Lower is more verbose: 0 (AR_LOG_LEVEL_DEBUG) shows everything,
        4 (AR_LOG_LEVEL_REL_INFO) the least. The library starts at
        1 (AR_LOG_LEVEL_INFO).

        @param {number} level one of the AR_LOG_LEVEL_* values.
        @return {number} the level that was set.
    */
    ARControllerNFT.prototype.setLogLevel = function (level) {
        return artoolkitNFT.setLogLevel(level);
    };

    /**
          Gets the logging level used by ARToolKit.
      @return {number} return the log level in use.
    */
    ARControllerNFT.prototype.getLogLevel = function () {
        return artoolkitNFT.getLogLevel();
    };

    /**
      Sets the value of the near plane of the camera.
      @param {number} value the value of the near plane
      @return {number} 0 (void)
    */
    ARControllerNFT.prototype.setProjectionNearPlane = function (value) {
        return artoolkitNFT.setProjectionNearPlane(this.id, value);
    };

    /**
      Gets the value of the near plane of the camera with the give id.
      @return {number} the value of the near plane.
    */
    ARControllerNFT.prototype.getProjectionNearPlane = function () {
        return artoolkitNFT.getProjectionNearPlane(this.id);
    };

    /**
      Sets the value of the far plane of the camera.
      @param {number} value the value of the far plane
      @return {number} 0 (void)
    */
    ARControllerNFT.prototype.setProjectionFarPlane = function (value) {
        return artoolkitNFT.setProjectionFarPlane(this.id, value);
    };

    /**
      Gets the value of the far plane of the camera with the give id.
      @return {number} the value of the far plane.
    */
    ARControllerNFT.prototype.getProjectionFarPlane = function () {
        return artoolkitNFT.getProjectionFarPlane(this.id);
    };

    /**
     * Recalculates the camera lens based on the current camera parameters.
     * This is useful if the camera parameters have changed
     * and you need to update the camera lens accordingly.
     * 
     * @return {number} 0 (void)
     */
    ARControllerNFT.prototype.recalculateCameraLens = function () {
        var ret = artoolkitNFT.recalculateCameraLens(this.id);
        // getCameraMatrix() returns this copy; refresh it, or it keeps the
        // matrix from initialisation (#630).
        this.camera_mat = artoolkitNFT.getCameraLens(this.id);
        return ret;
    }

    /**
        Set the labeling threshold mode (auto/manual).

        @param {number}		mode An integer specifying the mode. One of:
            AR_LABELING_THRESH_MODE_MANUAL,
            AR_LABELING_THRESH_MODE_AUTO_MEDIAN,
            AR_LABELING_THRESH_MODE_AUTO_OTSU,
            AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE,
            AR_LABELING_THRESH_MODE_AUTO_BRACKETING
     */
    ARControllerNFT.prototype.setThresholdMode = function (mode) {
        return artoolkitNFT.setThresholdMode(this.id, mode);
    };

    /**
     * Gets the current threshold mode used for image binarization.
     * @return	{number}		The current threshold mode
     * @see				getVideoThresholdMode()
     */
    ARControllerNFT.prototype.getThresholdMode = function () {
        return artoolkitNFT.getThresholdMode(this.id);
    };

    /**
        Set the labeling threshhold.

        This function forces sets the threshold value.
        The default value is AR_DEFAULT_LABELING_THRESH which is 100.

        The current threshold mode is not affected by this call.
        Typically, this function is used when labeling threshold mode
        is AR_LABELING_THRESH_MODE_MANUAL.

        The threshold value is not relevant if threshold mode is
        AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE.

        Background: The labeling threshold is the value which
        the AR library uses to differentiate between black and white
        portions of an ARToolKit marker. Since the actual brightness,
        contrast, and gamma of incoming images can vary signficantly
        between different cameras and lighting conditions, this
        value typically needs to be adjusted dynamically to a
        suitable midpoint between the observed values for black
        and white portions of the markers in the image.

        @param {number}     threshold An integer in the range [0,255] (inclusive).
    */
    ARControllerNFT.prototype.setThreshold = function (threshold) {
        return artoolkitNFT.setThreshold(this.id, threshold);
    };

    /**
        Get the current labeling threshold.

        This function queries the current labeling threshold. For,
        AR_LABELING_THRESH_MODE_AUTO_MEDIAN, AR_LABELING_THRESH_MODE_AUTO_OTSU,
        and AR_LABELING_THRESH_MODE_AUTO_BRACKETING
        the threshold value is only valid until the next auto-update.

        The current threshold mode is not affected by this call.

        The threshold value is not relevant if threshold mode is
        AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE.

        @return {number} The current threshold value.
    */
    ARControllerNFT.prototype.getThreshold = function () {
        return artoolkitNFT.getThreshold(this.id);
    };

    /**
        Set the image processing mode.

        When the image processing mode is AR_IMAGE_PROC_FRAME_IMAGE,
        ARToolKit processes all pixels in each incoming image
        to locate markers. When the mode is AR_IMAGE_PROC_FIELD_IMAGE,
        ARToolKit processes pixels in only every second pixel row and
        column. This is useful both for handling images from interlaced
        video sources (where alternate lines are assembled from alternate
        fields and thus have one field time-difference, resulting in a
        "comb" effect) such as Digital Video cameras.
        The effective reduction by 75% in the pixels processed also
        has utility in accelerating tracking by effectively reducing
        the image size to one quarter size, at the cost of pose accuraccy.

        @param {number} mode
            Options for this field are:
            AR_IMAGE_PROC_FRAME_IMAGE
            AR_IMAGE_PROC_FIELD_IMAGE
            The default mode is AR_IMAGE_PROC_FRAME_IMAGE.
    */
    ARControllerNFT.prototype.setImageProcMode = function (mode) {
        return artoolkitNFT.setImageProcMode(this.id, mode);
    };

    /**
        Get the image processing mode.

        See arSetImageProcMode() for a complete description.

        @return {number} The current image processing mode.
    */
    ARControllerNFT.prototype.getImageProcMode = function () {
        return artoolkitNFT.getImageProcMode(this.id);
    };

    /**
     * 
     * @param {*} enableFiltering 
     * @returns {void} void
     * @description Enable or disable filtering for the detected markers.
     */
    ARControllerNFT.prototype.setFiltering = function (enableFiltering) {
        artoolkitNFT.setFiltering(this.id, enableFiltering);
    }

    // private methods

    /**
      This function init the ARControllerNFT with the necessary parmeters and variables.
      Don't call directly this but instead instantiate a new ARControllerNFT.
      @return {number} 0 (void)
    */
    ARControllerNFT.prototype._initialize = function () {
        this.id = artoolkitNFT.setup(this.width, this.height, this.cameraParam.id, false);

        this._initNFT();

        this.framesize = this.width * this.height;

        this.videoFramePtr = Module._malloc(this.framesize * 4);
        this.videoLumaPtr = Module._malloc(this.framesize);
        this.videoLuma = new Uint8Array(this.framesize);

        this.camera_mat = artoolkitNFT.getCameraLens(this.id);

        this.setProjectionNearPlane(0.1);
        this.setProjectionFarPlane(1000);

        setTimeout(function () {
            if (this.onload) {
                this.onload();
            }
            this.dispatchEvent({
                name: 'load',
                target: this
            });
        }.bind(this), 1);
    };

    /**
      Init the necessary kpm handle for NFT and the settings for the CPU.
      @return {number} 0 (void)
    */
    ARControllerNFT.prototype._initNFT = function () {
        artoolkitNFT.setupAR2(this.id);
    };

    /**
      Copy the Image data to the HEAP for the debugSetup function.
      @return {number} 0 (void)
    */
    ARControllerNFT.prototype._copyImageToHeap = function (image) {
        if (!image) {
            console.error("Error: no provided imageData to ARControllerNFT");
            return;
        }
        if (image.data) {

            var imageData = image;

        }
        const data = imageData.data;  // this is of type Uint8ClampedArray: The Uint8ClampedArray typed array represents an array of 8-bit unsigned integers clamped to 0-255 (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8ClampedArray)

        // Copy video frame to WASM heap
        if (this.videoFramePtr) {
            Module.HEAPU8.set(data, this.videoFramePtr);
        }

        //Here we have access to the unmodified video image. We now need to add the videoLuma chanel to be able to serve the underlying ARTK API
        if (this.videoLuma && !this.videoLumaInternal) {
            let q = 0;
            //Create luma from video data assuming Pixelformat AR_PIXEL_FORMAT_RGBA (ARToolKitJS.cpp L: 43)

            for (let p = 0; p < this.videoSize; p++) {
                const r = data[q], g = data[q + 1], b = data[q + 2];
                // videoLuma[p] = (r+r+b+g+g+g)/6;         // https://stackoverflow.com/a/596241/5843642
                this.videoLuma[p] = (r + r + r + b + g + g + g + g) >> 3;
                q += 4;
            }

            if (this.videoLumaPtr) {
                Module.HEAPU8.set(this.videoLuma, this.videoLumaPtr);
            }
        }

        if (this.videoLuma && this.videoFramePtr && this.videoLumaPtr) {
            artoolkitNFT.passVideoData(this.id, this.videoFramePtr, this.videoLumaPtr, this.videoLumaInternal);
            return true;
        }

        return false;
    };

    // static
    /**
        ARCameraParamNFT is used for loading AR camera parameters for use with ARControllerNFT.
        Use by passing in an URL and a callback function.

            var camera = new ARCameraParamNFT('Data/camera_para.dat', function() {
                console.log('loaded camera', this.id);
            },
            function(err) {
                console.log('failed to load camera', err);
            });

        @exports ARCameraParamNFT
        @constructor

        @param {string} src URL to load camera parameters from.
        @param {Function} onload Onload callback to be called on successful parameter loading.
        @param {Function} onerror Error callback to called when things don't work out.
    */
    const ARCameraParamNFT = function (src, onload, onerror) {
        this.id = -1;
        this._src = '';
        this.complete = false;
        if (!onload) {
            this.onload = function () { console.log('Successfully loaded'); };
            console.warn("onload callback should be defined");
        } else {
            this.onload = onload;
        }
        if (!onerror) {
            this.onerror = function (err) { console.error("Error: " + err) };
            console.warn("onerror callback should be defined");
        } else {
            this.onerror = onerror;
        }

        if (src) {
            this.load(src);
        }
        else {
            console.warn("No camera parameter file defined! It should be defined in constructor or in ARCameraParamNFT.load(url)");
        }
    };


    /**
        Loads the given URL as camera parameters definition file into this ARCameraParamNFT.

        Can only be called on an unloaded ARCameraParamNFT instance.

        @param {string} src URL to load.
    */
    ARCameraParamNFT.prototype.load = function (src) {
        if (this._src !== '') {
            throw ("ARCameraParamNFT: Trying to load camera parameters twice.");
        }
        this._src = src;
        if (src) {
            artoolkitNFT.loadCamera(src, function (id) {
                this.id = id;
                this.complete = true;
                this.onload();
            }.bind(this), function (err) {
                this.onerror(err);
            }.bind(this));
        }
    };

    Object.defineProperty(ARCameraParamNFT.prototype, 'src', {
        set: function (src) {
            this.load(src);
        },
        get: function () {
            return this._src;
        }
    });

    /**
        Resets this ARCameraParamNFT, so it can load another file.
        The camera parameters stay in the native camera registry: no binding
        removes them, and the call this made to one that does not exist threw
        for every loaded camera (#277).
    */
    ARCameraParamNFT.prototype.dispose = function () {
        this.id = -1;
        this._src = '';
        this.complete = false;
    };



    // ARToolKitNFT exported JS API
    //
    const artoolkitNFT = {

        UNKNOWN_MARKER: -1,
        NFT_MARKER: 0, // 0,

        loadCamera: loadCamera,
        addNFTMarker: addNFTMarker,
        addNFTMarkers: addNFTMarkers

    };

    const FUNCTIONS = [
        'setup',
        'setFiltering',
        'teardown',

        'setupAR2',

        'setLogLevel',
        'getLogLevel',

        'setDebugMode',
        'getDebugMode',

        'getProcessingImage',

        'detectNFTMarker',
        'getNFTMarker',
        'getNFTData',

        'setProjectionNearPlane',
        'getProjectionNearPlane',

        'setProjectionFarPlane',
        'getProjectionFarPlane',

        'recalculateCameraLens',

        'setThresholdMode',
        'getThresholdMode',

        'setThreshold',
        'getThreshold',

        'setImageProcMode',
        'getImageProcMode',

        "getCameraLens",
        "passVideoData",
    ];

    function runWhenLoaded() {
        FUNCTIONS.forEach(function (n) {
            artoolkitNFT[n] = Module[n];
        });

        for (const m in Module) {
            if (m.match(/^AR/))
                artoolkitNFT[m] = Module[m];
        }
    }

    let marker_count = 0;

    /**
        Loads one NFT marker and calls `callback` with its id: addNFTMarkers with a
        single URL, with the same outcome rules.

        @param {number} arId The id of the ARControllerNFT.
        @param {string} url A URL prefix without extension, or a URL ending in `.zft`.
        @param {function} callback Called with the marker id on success.
        @param {function} onError Called once with the HTTP status or -1 on failure.
    */
    function addNFTMarker(arId, url, callback, onError) {
        // It called Module._addNFTMarker, which no binding defines, so it threw
        // after its downloads and could never succeed. It now goes through the batch
        // loader (#685, D13).
        addNFTMarkers(arId, [url], function (ids) {
            if (callback) callback(ids[0]);
        }, onError);
    }

    /**
        Loads NFT markers and registers them in one native call.

        Each URL is either a prefix without extension, for which `<url>.zft` is
        probed first and `.fset`, `.iset` and `.fset3` are loaded when there is no
        archive, or a URL ending in `.zft`, which is loaded directly.

        Each call has exactly one outcome: `callback(ids)` on success, or
        `onerror(code)` once on failure, with the HTTP status of the failed
        download, or -1 for anything else (a network failure, a `.zft` that cannot be
        decompressed, a native refusal such as an unreadable dataset). Without
        `onerror` the failure goes to `console.error`. A failed call registers none
        of its markers and leaves none of its files in the Emscripten FS.

        Known limitation of the legacy native loader (#685, D17): each call replaces
        the markers loaded by earlier calls, and the ids restart at 0 on every call.
        All or nothing holds within one call only. A call with 20 or more URLs is
        refused with `onerror(-1)` before any request.

        @param {number} arId The id of the ARControllerNFT.
        @param {string[]} urls The markers to load, one URL per marker.
        @param {function} callback Called with the array of marker ids on success.
        @param {function} onerror Called once with the HTTP status or -1 on failure.
    */
    function addNFTMarkers(arId, urls, callback, onerror) {
        runMarkerBatch(arId, urls).then(function (ids) {
            if (callback) callback(ids);
        }, function (e) {
            // The old loader called `onerror` from an `(filename, errorNumber)`
            // handler that `ajax` invoked as `errorCallback(status)`: the status
            // landed in `filename`, so `onerror` always got undefined, once per
            // failed file, and it was called without a check. It is now called
            // once, with the HTTP status or -1.
            if (onerror) onerror(errorCode(e));
            else console.error(e);
        });
    }

    // The legacy native loader's PAGES_MAX (emscripten/ARToolKitJS.cpp).
    const LEGACY_MAX_MARKERS = 20;

    /**
        The batch behind addNFTMarkers, with the algorithm of the TypeScript loader
        (src/ARToolkitNFTBase.ts) minus its options: load every marker
        concurrently, then register them in one `_addNFTMarkers`, or clean up and
        throw one error.
    */
    async function runMarkerBatch(arId, urls) {
        if (!Array.isArray(urls) || urls.length === 0) {
            throw loadError(-1, 'addNFTMarkers: no marker URLs given');
        }
        // Compatibility: the old loader built every file name as `url + '.fset'`,
        // which coerced a one-element array such as ['…/pinball'] to its string,
        // so that form loaded. Callers that pass the marker that way are
        // unwrapped, not refused. The legacy APIs take URL prefixes only: longer
        // arrays never loaded.
        urls = urls.map(function (url) {
            return Array.isArray(url) && url.length === 1 ? url[0] : url;
        });
        for (let i = 0; i < urls.length; i++) {
            // An empty URL would probe the page itself (D15).
            if (typeof urls[i] !== 'string' || urls[i] === '') {
                throw loadError(-1, 'addNFTMarkers: empty marker URL');
            }
        }
        // D17: the legacy native loader runs exit(-1) at 20 markers per call,
        // which terminates the module. The call is refused before any request.
        if (urls.length >= LEGACY_MAX_MARKERS) {
            throw loadError(-1, 'addNFTMarkers: the legacy API loads at most ' +
                (LEGACY_MAX_MARKERS - 1) + ' markers per call, got ' + urls.length);
        }

        // The call's own controller: it stops the other downloads on the first
        // failure.
        const controller = new AbortController();
        const written = [];
        let ok = false;
        try {
            const prefixes = await settleAll(urls.map(function (url) {
                return loadMarkerSource(url, controller.signal, written);
            }), function () {
                controller.abort();
            });
            const ids = registerMarkers(arId, prefixes);
            if (ids.length < prefixes.length) {
                throw loadError(-1, 'The native core registered ' + ids.length +
                    ' of ' + prefixes.length + ' markers: a dataset may be ' +
                    'unreadable. The core\'s log says which.');
            }
            ok = true;
            return ids;
        } finally {
            // All or nothing: a failed call leaves no file behind. Safe here
            // because settleAll waited for every download (D11).
            if (!ok) unlinkAll(written);
        }
    }

    /**
        Registers the prefixes in one native call and reads back the ids. `vec` and
        `ret` are Embind objects, deleted here: the old loader leaked both.
    */
    function registerMarkers(arId, prefixes) {
        const vec = new Module.StringList();
        let ret;
        try {
            for (let i = 0; i < prefixes.length; i++) {
                vec.push_back(prefixes[i]);
            }
            try {
                ret = Module._addNFTMarkers(arId, vec);
            } catch (cause) {
                // D16: a throw from the native side (an abort, an Emscripten
                // ExitStatus) is a refusal like any other.
                throw loadError(-1, 'The native core threw while registering the markers', cause);
            }
            const ids = [];
            for (let i = 0; i < ret.size(); i++) {
                ids.push(ret.get(i));
            }
            return ids;
        } finally {
            vec.delete();
            if (ret && ret.delete) ret.delete();
        }
    }

    /**
        Loads one marker into the FS and returns its prefix. It knows nothing of
        the other markers of the call and aborts none of them.
    */
    async function loadMarkerSource(url, signal, written) {
        // Taken before any request, so prefixes stay unique across concurrent
        // calls and are never reused.
        const prefix = '/markerNFT_' + marker_count++;

        if (extensionOf(url) === 'zft') {
            const bytes = await fetchBinary(url, signal);
            storeZFT(bytes, prefix, url, written);
            return prefix;
        }

        const zftUrl = url + '.zft';
        let res;
        try {
            res = await fetch(zftUrl, { signal: signal });
        } catch (cause) {
            if (signal.aborted) throw cause;
            throw loadError(-1, 'Network error fetching ' + zftUrl, cause);
        }
        if (res.ok) {
            // The probe's own bytes are used: one request, not a probe and then a
            // second download of the same archive.
            const bytes = await readBody(res, zftUrl, signal);
            storeZFT(bytes, prefix, zftUrl, written);
            return prefix;
        }
        // D6: any HTTP error status means "no .zft" and falls back to the three
        // files, not only 404. S3 and GCS answer 403 for a missing object when
        // listing is not allowed, and those markers load through this fallback.
        if (res.body) res.body.cancel().catch(function () { });

        await loadFiles(['fset', 'iset', 'fset3'].map(function (ext) {
            return { url: url + '.' + ext, path: prefix + '.' + ext };
        }), signal, written);
        return prefix;
    }

    /**
        Downloads files concurrently and stores each at its path. On the first
        failure the others are aborted, and it still waits for all of them (D11).
    */
    async function loadFiles(files, signal, written) {
        const controller = new AbortController();
        const onAbort = function () {
            controller.abort();
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort);
        try {
            await settleAll(files.map(async function (file) {
                const bytes = await fetchBinary(file.url, controller.signal);
                storeFile(bytes, file.path, written);
            }), onAbort);
        } finally {
            signal.removeEventListener('abort', onAbort);
        }
    }

    /**
        Decompresses a `.zft` archive and writes the marker's `.fset`, `.iset` and
        `.fset3` under `prefix`. Any failure throws, so nothing is registered: the
        old loader reported a failed decompression and then registered anyway.
    */
    function storeZFT(bytes, prefix, url, written) {
        const archive = prefix + '.zft';
        const temp = '/tempMarkerNFT_' + prefix.substring('/markerNFT_'.length);
        const extensions = ['fset', 'iset', 'fset3'];
        storeFile(bytes, archive, written);
        // Recorded before decompressing: a failed decompression may leave some of
        // them behind, and the batch's cleanup removes them.
        for (let i = 0; i < extensions.length; i++) {
            written.push(temp + '.' + extensions[i]);
        }

        let result;
        try {
            // The core takes the archive's path without ".zft" and appends it.
            result = Module._decompressZFT(prefix, temp);
        } catch (cause) {
            throw loadError(-1, 'Could not decompress ' + url, cause);
        } finally {
            // The archive is no longer needed once decompressed: free it from MEMFS.
            unlinkAll([archive]);
        }
        if (result !== 1) {
            throw loadError(-1, 'Could not decompress ' + url);
        }

        try {
            for (let i = 0; i < extensions.length; i++) {
                const hex = FS.readFile(temp + '.' + extensions[i]);
                unlinkAll([temp + '.' + extensions[i]]);
                storeFile(hexToBytes(hex), prefix + '.' + extensions[i], written);
            }
        } catch (cause) {
            throw loadError(-1, 'Could not decode ' + url, cause);
        }
    }

    /** Writes one file to the FS, recording its path first for the cleanup. */
    function storeFile(bytes, path, written) {
        written.push(path);
        FS.writeFile(path, bytes, { encoding: 'binary' });
    }

    /** Unlinks FS files, ignoring the ones that are already gone. */
    function unlinkAll(paths) {
        for (let i = 0; i < paths.length; i++) {
            try {
                FS.unlink(paths[i]);
            } catch (e) { }
        }
    }

    /**
        An Error carrying the code `onerror` receives: the HTTP status, or -1.
        The legacy API has no NFTLoadError class; the code is all it reports.
    */
    function loadError(code, message, cause) {
        const error = new Error(message);
        error.code = code;
        if (cause !== undefined) error.cause = cause;
        return error;
    }

    /** The code for `onerror`: the HTTP status of a failed download, or -1. */
    function errorCode(e) {
        return e && typeof e.code === 'number' ? e.code : -1;
    }

    /**
        Fetches a file as bytes. A non-OK response throws with the HTTP status as
        its code; a rejected fetch throws -1, except an abort, which propagates
        unchanged.
    */
    async function fetchBinary(url, signal) {
        let response;
        try {
            response = await fetch(url, { signal: signal });
        } catch (cause) {
            if (signal && signal.aborted) throw cause;
            throw loadError(-1, 'Network error fetching ' + url, cause);
        }
        if (!response.ok) {
            throw loadError(response.status, 'HTTP ' + response.status + ' fetching ' + url);
        }
        return readBody(response, url, signal);
    }

    /**
        Reads a response body as bytes. The connection can still fail after the
        headers arrived; that is a network failure too (-1).
    */
    async function readBody(response, url, signal) {
        try {
            return new Uint8Array(await response.arrayBuffer());
        } catch (cause) {
            if (signal && signal.aborted) throw cause;
            throw loadError(-1, 'Network error reading ' + url, cause);
        }
    }

    /**
        Decodes ASCII hex (two digits per byte, either case) straight to bytes.
        Replaces Uint8ArrayToStr + match(/.{1,2}/g) + parseInt, which built two
        intermediate strings and an array of pair strings per descriptor file.
    */
    function hexToBytes(hex) {
        if (hex.length % 2 !== 0) {
            throw new RangeError('hexToBytes: odd number of hex digits');
        }
        const nibble = function (c) {
            if (c >= 48 && c <= 57) return c - 48; // 0-9
            if (c >= 97 && c <= 102) return c - 87; // a-f
            if (c >= 65 && c <= 70) return c - 55; // A-F
            throw new RangeError('hexToBytes: invalid hex digit (byte ' + c + ')');
        };
        const out = new Uint8Array(hex.length / 2);
        for (let i = 0; i < out.length; i++) {
            out[i] = (nibble(hex[2 * i]) << 4) | nibble(hex[2 * i + 1]);
        }
        return out;
    }

    /**
        The extension of a URL's path, without the dot: a query or a hash is not
        part of it (`/x/pinball.zft?v=2` gives `zft`).
    */
    function extensionOf(url) {
        let path;
        try {
            path = new URL(url, typeof location !== 'undefined' ? location.href : undefined).pathname;
        } catch (cause) {
            throw loadError(-1, 'Invalid marker URL: ' + url, cause);
        }
        const name = path.substring(path.lastIndexOf('/') + 1);
        const dot = name.lastIndexOf('.');
        return dot < 0 ? '' : name.substring(dot + 1);
    }

    /**
        Settles every task, calling `onFirstFailure` as soon as one fails, and then
        resolves to all the values or rejects with the first failure.

        D11: it waits for every task, aborted or not, before deciding. Rejecting on
        the first failure, as Promise.all does, would let a download that finishes
        late write its file after the caller has cleaned up.
    */
    async function settleAll(tasks, onFirstFailure) {
        let failed = false;
        let failure;
        const results = await Promise.allSettled(tasks.map(function (task) {
            return task.catch(function (e) {
                if (!failed) {
                    failed = true;
                    failure = e;
                    onFirstFailure();
                }
                throw e;
            });
        }));
        if (failed) throw failure;
        return results.map(function (r) {
            return r.value;
        });
    }

    function bytesToString(array) {
        return String.fromCharCode.apply(String, array);
    }

    let camera_count = 0;

    function loadCamera(url, callback, errorCallback) {
        const filename = '/camera_param_' + camera_count++;
        const writeCallback = function (errorCode) {
            const id = Module._loadCamera(filename);
            if (!Module._loadCamera) {
                if (callback) callback(id); setTimeout(writeCallback, 10);
            } else {
                if (callback) callback(id);
            }
        };
        if (typeof url === 'object') { // Maybe it's a byte array
            writeByteArrayToFS(filename, url, writeCallback);
        } else if (url.indexOf("\n") > -1) { // Or a string with the camera param
            writeStringToFS(filename, url, writeCallback);
        } else {
            // fetch replaces the XHR `ajax`, which handled only onload: a
            // network failure never called back. errorCallback keeps its
            // numeric payload (D16): the HTTP status, or -1 for a network
            // failure.
            fetchBinary(url).then(function (bytes) {
                writeByteArrayToFS(filename, bytes, writeCallback);
            }, function (e) {
                if (errorCallback) errorCallback(errorCode(e));
                else console.error(e);
            });
        }
    }

    // transfer image

    function writeStringToFS(target, string, callback) {
        const byteArray = new Uint8Array(string.length);
        for (let i = 0; i < byteArray.length; i++) {
            byteArray[i] = string.charCodeAt(i) & 0xff;
        }
        writeByteArrayToFS(target, byteArray, callback);
    }

    function writeByteArrayToFS(target, byteArray, callback, prefix) {
        FS.writeFile(target, byteArray, { encoding: 'binary' });
        // console.log('FS written', target);

        callback(byteArray, prefix);
    }

    /* Exports */
    scope.artoolkitNFT = artoolkitNFT;
    scope.ARControllerNFT = ARControllerNFT;
    scope.ARCameraParamNFT = ARCameraParamNFT;

    if (scope.Module) {
        scope.Module.onRuntimeInitialized = function () {
            runWhenLoaded();
            const event = new Event('artoolkitNFT-loaded');
            scope.dispatchEvent(event);
        };
    } else {
        scope.Module = {
            onRuntimeInitialized: function () {
                runWhenLoaded();
            }
        };
    }

})();
