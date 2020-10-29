import ARToolkitNFT from './ARToolkitNFT'
import { createCanvas } from 'canvas'

export default class ARControllerNFT {
  constructor (width, height, cameraParam, options) {
    // read settings
    this.options = {
      ...{
        canvas: null,
        orientation: 'landscape'
      },
      ...options
    }

    // no point in initializing a member as "undefined"
    // replaced it with -1
    this.id = -1

    this.width = width
    this.height = height

    // holds an image in case the instance was initialized with an image
    this.image

    // default camera orientation
    this.orientation = this.options.orientation

    // this is a replacement for ARCameraParam
    this.cameraParam = cameraParam
    this.cameraId = -1
    this.cameraLoaded = false

    // toolkit instance
    this.artoolkitNFT

    // to register observers as event listeners
    this.listeners = {}

    this.nftMarkers = {}

    this.transform_mat = new Float32Array(16)
    this.transformGL_RH = new Float64Array(16)

    this.videoWidth = width
    this.videoHeight = height
    this.videoSize = this.videoWidth * this.videoHeight

    this.framepointer = null
    this.framesize = null
    this.dataHeap = null
    this.videoLuma = null
    this.camera_mat = null
    this.videoLumaPointer = null

    if (this.options.canvas) {
      // in case you use Node.js, create a canvas with node-canvas
      this.canvas = this.options.canvas
    } else if (this.options.canvas == null) {
      this.canvas = createCanvas(this.videoWidth, this.videoHeight)
      console.debug('canvas created with node-canvas');
    } else if (typeof document !== 'undefined') {
      // try creating a canvas from document
      this.canvas = document.createElement('canvas')
    }
    if (this.canvas) {
      this.canvas.width = width
      this.canvas.height = height
      this.ctx = this.canvas.getContext('2d')
    } else {
      console.warn('No canvas available')
    }

    // this is to workaround the introduction of "self" variable
    this.nftMarkerFound = false
    this.nftMarkerFoundTime = false
    this.nftMarkerCount = 0

    this._bwpointer = false
  }

  static async initWithDimensions (width, height, cameraParam, options) {
    // directly init with given width / height
    const arControllerNFT = new ARControllerNFT(width, height, cameraParam, options)
    return await arControllerNFT._initialize()
  }

  static async initNFTWithImage (image, cameraParam, options) {
    const width = image.videoWidth || image.width
    const height = image.Height || image.height
    const arControllerNFT = new ARControllerNFT(width, height, cameraParam, options)
    arControllerNFT.image = image
    return await arControllerNFT._initialize()
  }

  process (image) {
    const result = this.detectMarker(image)
    if (result != 0) {
      console.error('[ARControllerNFT]', 'detectMarker error:', result)
    }

    let k, o

    // get NFT markers
    for (k in this.nftMarkers) {
      o = this.nftMarkers[k]
      o.inPrevious = o.inCurrent
      o.inCurrent = false
    }

    // detect NFT markers
    const nftMarkerCount = this.nftMarkerCount
    this.detectNFTMarker()

    // in ms
    const MARKER_LOST_TIME = 200

    for (let i = 0; i < nftMarkerCount; i++) {
      const nftMarkerInfo = this.getNFTMarker(i)
      const markerType = ARToolkitNFT.NFT_MARKER

      if (nftMarkerInfo.found) {
        this.nftMarkerFound = i
        this.nftMarkerFoundTime = Date.now()

        const visible = this.trackNFTMarkerId(i)
        visible.matrix.set(nftMarkerInfo.pose)
        visible.inCurrent = true
        this.transMatToGLMat(visible.matrix, this.transform_mat)
        this.transformGL_RH = this.arglCameraViewRHf(this.transform_mat)
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
        })
      } else if (self.nftMarkerFound === i) {
        // for now this marker found/lost events handling is for one marker at a time
        if ((Date.now() - this.nftMarkerFoundTime) > MARKER_LOST_TIME) {
          this.nftMarkerFound = false
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
          })
        };
      }
    }

    if (this._bwpointer) {
      this.debugDraw()
    }
  }

  /**
   * Detects the NFT markers in the process() function,
   * with the given tracked id.
   */
  detectNFTMarker () {
    this.artoolkitNFT.detectNFTMarker(this.id)
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
  trackNFTMarkerId (id, markerWidth) {
    let obj = this.nftMarkers[id]
    if (!obj) {
      this.nftMarkers[id] = obj = {
        inPrevious: false,
        inCurrent: false,
        matrix: new Float64Array(12),
        matrixGL_RH: new Float64Array(12),
        markerWidth: markerWidth || this.defaultMarkerWidth
      }
    }
    if (markerWidth) {
      obj.markerWidth = markerWidth
    }
    return obj
  };

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
   * @param {image} Image to be processed to detect markers.
   * @return {number} 0 if the function proceeded without error, or a value less than 0 in case of error.
   * A result of 0 does not however, imply any markers were detected.
   */
  detectMarker (image) {
    if (this._copyImageToHeap(image)) {
      return this.artoolkitNFT.detectMarker(this.id)
    }
    return -99
  };

  /**
   * Get the NFT marker info struct for the given NFT marker index in detected markers.
   * The returned object is the global artoolkitNFT.NFTMarkerInfo object and will be overwritten
   * by subsequent calls.
   * Returns undefined if no marker was found.
   * A markerIndex of -1 is used to access the global custom marker.
   * @param {number} markerIndex The index of the NFT marker to query.
   * @returns {Object} The NFTmarkerInfo struct.
   */
  getNFTMarker (markerIndex) {
    if (this.artoolkitNFT.getNFTMarker(this.id, markerIndex) === 0) {
      return this.artoolkitNFT.NFTMarkerInfo
    }
  };

  // event handling
  //----------------------------------------------------------------------------

  /**
   * Add an event listener on this ARControllerNFTNFT for the named event, calling the callback function
   * whenever that event is dispatched.
   * Possible events are:
   * - getMarker - dispatched whenever process() finds a square marker
   * - getMultiMarker - dispatched whenever process() finds a visible registered multimarker
   * - getMultiMarkerSub - dispatched by process() for each marker in a visible multimarker
   * - load - dispatched when the ARControllerNFT is ready to use (useful if passing in a camera URL in the constructor)
   * @param {string} name Name of the event to listen to.
   * @param {function} callback Callback function to call when an event with the given name is dispatched.
   */
  addEventListener(name, callback) {
    if(!this.listeners[name]) {
      this.listeners[name] = [];
    }
    this.listeners[name].push(callback);
  };

  /**
   * Remove an event listener from the named event.
   * @param {string} name Name of the event to stop listening to.
   * @param {function} callback Callback function to remove from the listeners of the named event.
   */
  removeEventListener(name, callback) {
    if(this.listeners[name]) {
      let index = this.listeners[name].indexOf(callback);
      if(index > -1) {
        this.listeners[name].splice(index, 1);
      }
    }
  };

  /**
   * Dispatches the given event to all registered listeners on event.name.
   * @param {Object} event Event to dispatch.
   */
  dispatchEvent(event) {
//console.log('Dispatched event');
//console.log(event);
    let listeners = this.listeners[event.name];
    if(listeners) {
      for(let i = 0; i < listeners.length; i++) {
        listeners[i].call(this, event);
      }
    }
  };


  /**
   * Converts the given 3x4 marker transformation matrix in the 12-element transMat array
   * into a 4x4 WebGL matrix and writes the result into the 16-element glMat array.
   * If scale parameter is given, scales the transform of the glMat by the scale parameter.
   * m {Float64Array} transMat The 3x4 marker transformation matrix.
   * @param {Float64Array} glMat The 4x4 GL transformation matrix.
   * @param {number} scale The scale for the transform.
   */
  transMatToGLMat (transMat, glMat, scale) {
    if (glMat == undefined) {
      glMat = new Float64Array(16)
    }

    glMat[0 + 0 * 4] = transMat[0] // R1C1
    glMat[0 + 1 * 4] = transMat[1] // R1C2
    glMat[0 + 2 * 4] = transMat[2]
    glMat[0 + 3 * 4] = transMat[3]
    glMat[1 + 0 * 4] = transMat[4] // R2
    glMat[1 + 1 * 4] = transMat[5]
    glMat[1 + 2 * 4] = transMat[6]
    glMat[1 + 3 * 4] = transMat[7]
    glMat[2 + 0 * 4] = transMat[8] // R3
    glMat[2 + 1 * 4] = transMat[9]
    glMat[2 + 2 * 4] = transMat[10]
    glMat[2 + 3 * 4] = transMat[11]
    glMat[3 + 0 * 4] = 0.0
    glMat[3 + 1 * 4] = 0.0
    glMat[3 + 2 * 4] = 0.0
    glMat[3 + 3 * 4] = 1.0

    if (scale != undefined && scale !== 0.0) {
      glMat[12] *= scale
      glMat[13] *= scale
      glMat[14] *= scale
    }
    return glMat
  };

  /**
   * Converts the given 4x4 openGL matrix in the 16-element transMat array
   * into a 4x4 OpenGL Right-Hand-View matrix and writes the result into the 16-element glMat array.
   * If scale parameter is given, scales the transform of the glMat by the scale parameter.
   * @param {Float64Array} glMatrix The 4x4 marker transformation matrix.
   * @param {Float64Array} [glRhMatrix] The 4x4 GL right hand transformation matrix.
   * @param {number} [scale] The scale for the transform.
   */
  arglCameraViewRHf (glMatrix, glRhMatrix, scale) {
    let m_modelview
    if (glRhMatrix == undefined) { m_modelview = new Float64Array(16) } else { m_modelview = glRhMatrix }

    // x
    m_modelview[0] = glMatrix[0]
    m_modelview[4] = glMatrix[4]
    m_modelview[8] = glMatrix[8]
    m_modelview[12] = glMatrix[12]
    // y
    m_modelview[1] = -glMatrix[1]
    m_modelview[5] = -glMatrix[5]
    m_modelview[9] = -glMatrix[9]
    m_modelview[13] = -glMatrix[13]
    // z
    m_modelview[2] = -glMatrix[2]
    m_modelview[6] = -glMatrix[6]
    m_modelview[10] = -glMatrix[10]
    m_modelview[14] = -glMatrix[14]

    // 0 0 0 1
    m_modelview[3] = 0
    m_modelview[7] = 0
    m_modelview[11] = 0
    m_modelview[15] = 1

    if (scale != undefined && scale !== 0.0) {
      m_modelview[12] *= scale
      m_modelview[13] *= scale
      m_modelview[14] *= scale
    }

    glRhMatrix = m_modelview

    return glRhMatrix
  }

  /**
   * Returns the 16-element WebGL transformation matrix used by ARControllerNFT.process to
   * pass marker WebGL matrices to event listeners.
   * Unique to each ARControllerNFT.
   * @return {Float64Array} The 16-element WebGL transformation matrix used by the ARControllerNFT.
   */
  getTransformationMatrix () {
    return this.transform_mat
  };

  /**
   * Returns the projection matrix computed from camera parameters for the ARControllerNFT.
   * @return {Float64Array} The 16-element WebGL camera matrix for the ARControllerNFT camera parameters.
   */
  getCameraMatrix () {
    return this.camera_mat
  };

  /**
   * Returns the Emscripten HEAP offset to the debug processing image used by ARToolKit.
   * @return {number} HEAP offset to the debug processing image.
   */
  getProcessingImage () {
    return this.artoolkitNFT.getProcessingImage(this.id)
  };

  /**
   * Sets the value of the near plane of the camera.
   * @param {number} value the value of the near plane
   * @return {number} 0 (void)
   */
  setProjectionNearPlane (value) {
    return this.artoolkitNFT.setProjectionNearPlane(this.id, value)
  };

  /**
   * Gets the value of the near plane of the camera with the give id.
   * @return {number} the value of the near plane.
   */
  getProjectionNearPlane () {
    return this.artoolkitNFT.getProjectionNearPlane(this.id)
  };

  /**
   * Sets the value of the far plane of the camera.
   * @param {number} value the value of the far plane
   * @return {number} 0 (void)
   */
  setProjectionFarPlane (value) {
    return this.artoolkitNFT.setProjectionFarPlane(this.id, value)
  };

  /**
   * Gets the value of the far plane of the camera with the give id.
   * @return {number} the value of the far plane.
   */
  getProjectionFarPlane () {
    return this.artoolkitNFT.getProjectionFarPlane(this.id)
  };

  /**
   * Loads an NFT marker from the given URL or data string
   * @param {string} urlOrData - The URL prefix or data of the NFT markers to load.
  */
  async loadNFTMarker (urlOrData) {
    const markerId = await this.artoolkitNFT.addNFTMarker(this.id, urlOrData)
    this.nftMarkerCount = markerId + 1
    return markerId
  };

  // private accessors
  // ----------------------------------------------------------------------------

  /**
   * This function init the ARControllerNFT with the necessary parmeters and variables.
   * Don't call directly this but instead instantiate a new ARControllerNFT.
   * @return {ARControllerNFT} The initialized ARControllerNFT instance
   */
  async _initialize () {
    // initialize the toolkit
    this.artoolkitNFT = await new ARToolkitNFT().init()
    console.log('[ARControllerNFT]', 'ARToolkitNFT initialized')

    // load the camera
    this.cameraId = await this.artoolkitNFT.loadCamera(this.cameraParam)
    console.log('[ARControllerNFT]', 'Camera params loaded with ID', this.cameraId)

    // setup
    this.id = this.artoolkitNFT.setup(this.width, this.height, this.cameraId)
    console.log('[ARControllerNFT]', 'Got ID from setup', this.id)

    this._initNFT()

    const params = artoolkitNFT.frameMalloc
    this.framepointer = params.framepointer
    this.framesize = params.framesize
    this.videoLumaPointer = params.videoLumaPointer

    this.dataHeap = new Uint8Array(this.artoolkitNFT.instance.HEAPU8.buffer, this.framepointer, this.framesize)
    this.videoLuma = new Uint8Array(this.artoolkitNFT.instance.HEAPU8.buffer, this.videoLumaPointer, this.framesize / 4)

    this.camera_mat = new Float64Array(this.artoolkitNFT.instance.HEAPU8.buffer, params.camera, 16)
    this.marker_transform_mat = new Float64Array(this.artoolkitNFT.instance.HEAPU8.buffer, params.transform, 12)

    this.setProjectionNearPlane(0.1)
    this.setProjectionFarPlane(1000)

    setTimeout(() => {
      this.dispatchEvent({
        name: 'load',
        target: this
      })
    }, 1)

    return this
  }

  /**
   * Init the necessary kpm handle for NFT and the settings for the CPU.
   * @return {number} 0 (void)
   */
  _initNFT () {
    this.artoolkitNFT.setupAR2(this.id)
  };

  /**
   * Copy the Image data to the HEAP for the debugSetup function.
   * @return {number} 0 (void)
   */
  _copyImageToHeap (sourceImage) {
    if (!sourceImage) {
    // default to preloaded image
      sourceImage = this.image
    }

    // this is of type Uint8ClampedArray:
    // The Uint8ClampedArray typed array represents an array of 8-bit unsigned
    // integers clamped to 0-255
    // @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8ClampedArray
    let data

    if (sourceImage.data) {
      // directly use source image
      data = sourceImage.data
    } else {
      this.ctx.save()

      if (this.orientation === 'portrait') {
        this.ctx.translate(this.canvas.width, 0)
        this.ctx.rotate(Math.PI / 2)
        this.ctx.drawImage(sourceImage, 0, 0, this.canvas.height, this.canvas.width) // draw video
      } else {
        this.ctx.drawImage(sourceImage, 0, 0, this.canvas.width, this.canvas.height) // draw video
      }

      this.ctx.restore()

      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
      data = imageData.data
    }

    // Here we have access to the unmodified video image. We now need to add the videoLuma chanel to be able to serve the underlying ARTK API
    if (this.videoLuma) {
      let q = 0

      // Create luma from video data assuming Pixelformat AR_PIXEL_FORMAT_RGBA
      // see (ARToolKitJS.cpp L: 43)
      for (let p = 0; p < this.videoSize; p++) {
        const r = data[q + 0]; const g = data[q + 1]; const b = data[q + 2]
        // @see https://stackoverflow.com/a/596241/5843642
        this.videoLuma[p] = (r + r + r + b + g + g + g + g) >> 3
        q += 4
      }
    }

    if (this.dataHeap) {
      this.dataHeap.set(data)
      return true
    }

    return false
  };
}
