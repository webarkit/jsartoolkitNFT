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

        this.version = '1.7.4';
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
            onSuccess(ids);
        }, onError);
    };

    ARControllerNFT.prototype.loadNFTMarker = function (markerURL, onSuccess, onError) {
        if (markerURL) {
            this.loadNFTMarkers([markerURL], function (ids) {
                onSuccess(ids[0]);
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
        Sets the logging level to use by ARToolKit.

        @param {number} mode type for the log level.
    */
    ARControllerNFT.prototype.setLogLevel = function (mode) {
        return artoolkitNFT.setLogLevel(mode);
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

    // private methods

    /**
      This function init the ARControllerNFT with the necessary parmeters and variables.
      Don't call directly this but instead instantiate a new ARControllerNFT.
      @return {number} 0 (void)
    */
    ARControllerNFT.prototype._initialize = function () {
        this.id = artoolkitNFT.setup(this.width, this.height, this.cameraParam.id);

        this._initNFT();

        this.framesize = this.width * this.height;

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
        }

        if (this.videoLuma) {
            artoolkitNFT.passVideoData(this.id, data, this.videoLuma, this.videoLumaInternal);
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
        Destroys the camera parameter and frees associated Emscripten resources.

    */
    ARCameraParamNFT.prototype.dispose = function () {
        if (this.id !== -1) {
            artoolkitNFT.deleteCamera(this.id);
        }
        this.id = -1;
        this._src = '';
        this.complete = false;
    };



    // ARToolKit exported JS API
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

    function addNFTMarker(arId, url, callback, onError) {
        const mId = marker_count++;
        const prefix = '/markerNFT_' + mId;
        const filename1 = prefix + '.fset';
        const filename2 = prefix + '.iset';
        const filename3 = prefix + '.fset3';
        ajax(url + '.fset', filename1, function () {
            ajax(url + '.iset', filename2, function () {
                ajax(url + '.fset3', filename3, function () {
                    var nftMarker = Module._addNFTMarker(arId, prefix);
                    if (callback) callback(nftMarker);
                }, function (errorNumber) { if (onError) onError(errorNumber); });
            }, function (errorNumber) { if (onError) onError(errorNumber); });
        }, function (errorNumber) { if (onError) onError(errorNumber); });
    }

    function addNFTMarkers(arId, urls, callback, onerror) {
        const prefixes = [];
        let pending = urls.length * 3;
        const onSuccess = (filename) => {
            pending -= 1;
            if (pending === 0) {
                const vec = new Module.StringList();
                const markerIds = [];
                for (let i = 0; i < prefixes.length; i++) {
                    vec.push_back(prefixes[i]);
                }
                const ret = Module._addNFTMarkers(arId, vec);
                for (let i = 0; i < ret.size(); i++) {
                    markerIds.push(ret.get(i));
                }

                console.log("add nft marker ids: ", markerIds);
                if (callback) callback(markerIds);
            }
        }
        const onError = (filename, errorNumber) => {
            console.log("failed to load: ", filename);
            onerror(errorNumber);
        }

        const loadZFT = (prefix) => {
            const marker_num = prefix.substring(11);
            const prefixTemp = '/tempMarkerNFT_' + marker_num;

            const response = Module._decompressZFT(prefix, prefixTemp);

            let contentIsetUint8 = FS.readFile(prefixTemp + '.iset');
            let contentFsetUint8 = FS.readFile(prefixTemp + '.fset');
            let contentFset3Uint8 = FS.readFile(prefixTemp + '.fset3');

            FS.unlink(prefixTemp + '.iset');
            FS.unlink(prefixTemp + '.fset');
            FS.unlink(prefixTemp + '.fset3');

            let hexStrIset = Uint8ArrayToStr(contentIsetUint8);
            let hexStrFset = Uint8ArrayToStr(contentFsetUint8);
            let hexStrFset3 = Uint8ArrayToStr(contentFset3Uint8);

            let contentIset = new Uint8Array(hexStrIset.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            let contentFset = new Uint8Array(hexStrFset.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            let contentFset3 = new Uint8Array(hexStrFset3.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

            writeByteArrayToFS(prefix + '.fset', contentFset, function(){});
            writeByteArrayToFS(prefix + '.iset', contentIset, function(){});
            writeByteArrayToFS(prefix + '.fset3', contentFset3, function(){});

        }

        const onSuccessZFT = function(){
            loadZFT(arguments[1]);
            onSuccess();
        }

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const prefix = '/markerNFT_' + marker_count;
            prefixes.push(prefix);
            const filename1 = prefix + '.fset';
            const filename2 = prefix + '.iset';
            const filename3 = prefix + '.fset3';
            const filename4 = prefix + '.zft';

            let type = checkZFT(url + '.zft');
            if(type){
                pending -= 2;
                ajax(url + '.zft', filename4, onSuccessZFT, onError.bind(filename4), prefix);
            }else {
                ajax(url + '.fset', filename1, onSuccess.bind(filename1), onError.bind(filename1), prefix);
                ajax(url + '.iset', filename2, onSuccess.bind(filename2), onError.bind(filename2), prefix);
                ajax(url + '.fset3', filename3, onSuccess.bind(filename3), onError.bind(filename3), prefix);
            }
            marker_count += 1;
        }
    }

    function checkZFT(url){
        let isZFT = null;

        let request = new XMLHttpRequest();
        request.open('GET', url, false);  // `false` makes the request synchronous
        request.send(null);

        if (request.status === 200) {
            isZFT = true;
        }else if(request.status === 404){
            isZFT = false;
        }

        return isZFT;
    }

    function Uint8ArrayToStr(array) {
        let out, i, len, c;
        let char2, char3;

        out = "";
        len = array.length;
        i = 0;
        while(i < len) {
            c = array[i++];
            switch(c >> 4)
            {
                case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
                // 0xxxxxxx
                out += String.fromCharCode(c);
                break;
                case 12: case 13:
                // 110x xxxx   10xx xxxx
                char2 = array[i++];
                out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
                break;
                case 14:
                    // 1110 xxxx  10xx xxxx  10xx xxxx
                    char2 = array[i++];
                    char3 = array[i++];
                    out += String.fromCharCode(((c & 0x0F) << 12) |
                        ((char2 & 0x3F) << 6) |
                        ((char3 & 0x3F) << 0));
                    break;
            }
        }

        return out;
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
            ajax(url, filename, writeCallback, errorCallback);
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

    // Eg.
    //	ajax('../bin/Data2/markers.dat', '/Data2/markers.dat', callback);
    //	ajax('../bin/Data/patt.hiro', '/patt.hiro', callback);

    function ajax(url, target, callback, errorCallback, prefix) {
        const oReq = new XMLHttpRequest();
        oReq.open('GET', url, true);
        oReq.responseType = 'arraybuffer'; // blob arraybuffer

        oReq.onload = function () {
            if (this.status == 200) {
                // console.log('ajax done for ', url);
                const arrayBuffer = oReq.response;
                const byteArray = new Uint8Array(arrayBuffer);
                writeByteArrayToFS(target, byteArray, callback, prefix);
            }
            else {
                errorCallback(this.status);
            }
        };

        oReq.send();
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
