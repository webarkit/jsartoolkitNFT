const ARToolkitNFT = require('./ARToolkitNFT.js')

class ARControllerNFT {
    constructor(width, height, cameraParam) {
        this.id = -1;

        this.width = width;
        this.height = height;

        // this is a replacement for ARCameraParam
        this.cameraParam = cameraParam;
        this.cameraId = -1;
        this.cameraLoaded = false;
        this.artoolkitNFT = global.artoolkitNFT;

        // to register observers as event listeners
        this.listeners = {};

        this.nftMarkerCount = 0;

        this.nftMarkers = {};

        this.markerFound = false;
        this.markerFoundTime = 0;

        this.transform_mat = new Float64Array(16);
        this.transformGL_RH = new Float64Array(16);
        this.marker_transform_mat = null;

        this.videoWidth = width;
        this.videoHeight = height;
        this.videoSize = this.videoWidth * this.videoHeight;

        this.framepointer = null;
        this.framesize = null;
        this.dataHeap = null;
        this.videoLuma = null;
        this.camera_mat = null;
        this.videoLumaPointer = null;
    }

    process(image) {
        var result = this.detectMarker(image);
        if (result != 0) {
            console.error("detectMarker error: " + result);
        }

        // get NFT markers
        var k, o;
        for (k in this.nftMarkers) {
            o = this.nftMarkers[k];
            o.inPrevious = o.inCurrent;
            o.inCurrent = false;
        }

        // detect NFT markers
        var nftMarkerCount = this.nftMarkerCount;
        this.detectNFTMarker();

        // in ms
        var MARKER_LOST_TIME = 200;

        for (var i = 0; i < nftMarkerCount; i++) {
            var nftMarkerInfo = this.getNFTMarker(i);
            var markerType = this.artoolkitNFT.NFT_MARKER;

            if (nftMarkerInfo.found) {
                this.markerFound = i;
                this.markerFoundTime = Date.now();

                var visible = this.trackNFTMarkerId(i);
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
            } else if (this.markerFound === i) {
                // for now this marker found/lost events handling is for one marker at a time
                if ((Date.now() - this.markerFoundTime) <= MARKER_LOST_TIME) {
                    // not handling marker lost for less than specified time
                    return;
                }

                delete this.markerFound;

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

    trackNFTMarkerId(id, markerWidth) {
        var obj = this.nftMarkers[id];
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

    detectMarker(image) {
        if (this._copyImageToHeap(image)) {
            return this.artoolkitNFT.artoolkitNFT.detectMarker(this.id);
        }
        return -99;
    };

    getNFTMarker(markerIndex) {
        if (0 === this.artoolkitNFT.artoolkitNFT.getNFTMarker(this.id, markerIndex)) {
            return this.artoolkitNFT.NFTMarkerInfo;
        }
    }

    detectNFTMarker() {
        this.artoolkitNFT.artoolkitNFT.detectNFTMarker(this.id);
    };

    transMatToGLMat(transMat, glMat, scale) {
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

    arglCameraViewRHf(glMatrix, glRhMatrix, scale) {
        var m_modelview;
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

    addEventListener(name, callback) {
        if (!this.listeners[name]) {
            this.listeners[name] = [];
        }
        this.listeners[name].push(callback);
    };

    removeEventListener(name, callback) {
        if (this.listeners[name]) {
            var index = this.listeners[name].indexOf(callback);
            if (index > -1) {
                this.listeners[name].splice(index, 1);
            }
        }
    };

    dispatchEvent(event) {
        var listeners = this.listeners[event.name];
        if (listeners) {
            for (var i = 0; i < listeners.length; i++) {
                listeners[i].call(this, event);
            }
        }
    };

   loadNFTMarkers(markerURLs, onSuccess, onError) {
        var self = this;
        this.addNFTMarkers(this.id, markerURLs, function(ids) {
            self.nftMarkerCount += ids.length;
            onSuccess(ids);
        }, onError);
    };

    loadNFTMarker(markerURL, onSuccess, onError) {
        if (markerURL) {
            this.loadNFTMarkers([markerURL], function(ids) {
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
    
    addNFTMarker(arId, url, callback, onError) {
        var mId = this.nftMarkerCount++;
        var prefix = '/markerNFT_' + mId;
        var filename1 = prefix + '.fset';
        var filename2 = prefix + '.iset';
        var filename3 = prefix + '.fset3';
        this.ajax(url + '.fset', filename1, function () {
            this.ajax(url + '.iset', filename2, function () {
                this.ajax(url + '.fset3', filename3, function () {
                    var nftMarker = this.artoolkitNFT.artoolkitNFT._addNFTMarker(arId, prefix);
                    if (callback) callback(nftMarker);
                }, function (errorNumber) { if (onError) onError(errorNumber); });
            }, function (errorNumber) { if (onError) onError(errorNumber); });
        }, function (errorNumber) { if (onError) onError(errorNumber); });
    }

    addNFTMarkers(arId, urls, callback, onError) {
        var prefixes = [];
        var pending = urls.length * 3;
        var onSuccess = (filename) => {
            pending -= 1;
            if (pending === 0) {
                const vec = new this.artoolkitNFT.artoolkitNFT.StringList();
                const markerIds = [];
                for (let i = 0; i < prefixes.length; i++) {
                    vec.push_back(prefixes[i]);
                }
                var ret = this.artoolkitNFT.artoolkitNFT._addNFTMarkers(arId, vec);
                for (let i = 0; i < ret.size(); i++) {
                    markerIds.push(ret.get(i));
                }

                console.log("add nft marker ids: ", markerIds);
                if (callback) callback(markerIds);
            }
        }
        var onError = (filename, errorNumber) => {
            console.log("failed to load: ", filename);
            onError(errorNumber);
        }

        for (var i = 0; i < urls.length; i++) {
            var url = urls[i];

            var prefix = '/temp/' + url;
            prefixes.push(prefix);

            var filename1 = url + '.fset';
            var filename2 = url + '.iset';
            var filename3 = url + '.fset3';

            this.ajax(url + '.fset', filename1, onSuccess.bind(filename1), onError.bind(filename1));
            this.ajax(url + '.iset', filename2, onSuccess.bind(filename2), onError.bind(filename2));
            this.ajax(url + '.fset3', filename3, onSuccess.bind(filename3), onError.bind(filename3));
            this.nftMarkerCount += 1;
        }
    }

    ajax(url, target, callback, errorCallback) {
        callback("/temp/" + target);
    }


    setProjectionNearPlane(value) {
        return this.artoolkitNFT.artoolkitNFT.setProjectionNearPlane(this.id, value);
    };

    getProjectionNearPlane() {
        return this.artoolkitNFT.artoolkitNFT.getProjectionNearPlane(this.id);
    };

    setProjectionFarPlane(value) {
        return this.artoolkitNFT.artoolkitNFT.setProjectionFarPlane(this.id, value);
    };

    getProjectionFarPlane() {
        return this.artoolkitNFT.artoolkitNFT.getProjectionFarPlane(this.id);
    };

    async _initialize() {
        this.artoolkitNFT = await new ARToolkitNFT().init();
        console.log("[ARControllerNFT]", "ARToolkitNFT initialized");

        // load the camera
        this.cameraId = await this.artoolkitNFT.loadCamera(this.cameraParam);
        console.log("[ARControllerNFT]", "Camera params loaded with ID", this.cameraId);

        // setup
        this.id = this.artoolkitNFT.artoolkitNFT.setup(this.width, this.height, this.cameraId);
        console.log("[ARControllerNFT]", "Got ID from setup", this.id);

        this._initNFT();

        const params = this.artoolkitNFT.frameMalloc

        this.framepointer = params.framepointer;
        this.framesize = params.framesize;
        this.videoLumaPointer = params.videoLumaPointer;

        this.dataHeap = new Uint8Array(
            this.artoolkitNFT.artoolkitNFT.HEAPU8.buffer,
            this.framepointer,
            this.framesize
        );
        this.videoLuma = new Uint8Array(
            this.artoolkitNFT.artoolkitNFT.HEAPU8.buffer,
            this.videoLumaPointer,
            this.framesize / 4
        );

        this.camera_mat = new Float64Array(
            this.artoolkitNFT.artoolkitNFT.HEAPU8.buffer,
            params.camera,
            16
        );
        this.marker_transform_mat = new Float64Array(
            this.artoolkitNFT.artoolkitNFT.HEAPU8.buffer,
            params.transform,
            12
        );

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

    _initNFT() {
        this.artoolkitNFT.artoolkitNFT.setupAR2(this.id);
    }

    _copyImageToHeap(image) {
        if (!image) {
            console.error("Error: no provided imageData to ARControllerNFT");
            return;
        }
        if (image.data) {

            var imageData = image;

        }
        //var data = imageData.data;  // this is of type Uint8ClampedArray: The Uint8ClampedArray typed array represents an array of 8-bit unsigned integers clamped to 0-255 (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8ClampedArray)
        var data = image
        //Here we have access to the unmodified video image. We now need to add the videoLuma chanel to be able to serve the underlying ARTK API
        if (this.videoLuma) {
            var q = 0;
            //Create luma from video data assuming Pixelformat AR_PIXEL_FORMAT_RGBA (ARToolKitJS.cpp L: 43)

            for (var p = 0; p < this.videoSize; p++) {
                var r = data[q + 0], g = data[q + 1], b = data[q + 2];
                // videoLuma[p] = (r+r+b+g+g+g)/6;         // https://stackoverflow.com/a/596241/5843642
                this.videoLuma[p] = (r + r + r + b + g + g + g + g) >> 3;
                q += 4;
            }
        }

        if (this.dataHeap) {
            this.dataHeap.set(data);
            return true;
        }
        return false;
    };

}
module.exports = ARControllerNFT