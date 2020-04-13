import ARToolkitNFT from '../build/artoolkitNFT_ES6_wasm.js'

'use strict'

/** Definitions of private FUNCTIONS

    */
const _prepareImage = Symbol('_prepareImage')
const _teardownVideo = Symbol('_tearDownVideo')

const ORIENTATION = {
  0: 'portrait',
  180: 'portrait',
  90: 'landscape'
}

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
    this.artoolkit

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
    } else {
      // try creating a canvas from document
      if (typeof document === 'undefined') {
        throw 'No canvas available'
      }
      this.canvas = document.createElement('canvas')
    }

    this.canvas.width = width
    this.canvas.height = height
    this.ctx = this.canvas.getContext('2d')

    // this is to workaround the introduction of "self" variable
    this.nftMarkerFound = false
    this.nftMarkerFoundTime = false
    this.nftMarkerCount = 0

    this._bwpointer = false
  }
}
