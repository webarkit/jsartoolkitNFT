// renaming the file to exclude it by compilation
import ARToolkitNFT from './ARToolkitNFT'

interface Options {
  canvas: null,
  orientation: string,
}

interface ImageObj {
  videoWidth: null,
  width: null,
  videoHeight: null,
  height: null,
  data: null,
}

interface delegateMethods {
    setup: {
        (width: number, height: number, cameraId: number): number
    }
    setupAR2: {
      (id: number): void
    }
    frameMalloc: {
       framepointer: number;
       framesize: number;
       videoLumaPointer: number;
       camera: number;
       transform: number
    }
    instance: {
      HEAPU8: {
        buffer: Uint8Array
      };
    }
    setProjectionNearPlane: {
      (id: number, value: number): void;
    }
    getProjectionNearPlane: (id: number) => number;
    setProjectionFarPlane: (id: number, value: number) => void;
    getProjectionFarPlane: (id: number) => number;
    addNFTMarker: (arId: number, url: string) => Promise<{id: number}>;
}

export default class ARControllerNFT {
  // private declarations
  private options = {} as Options;
  private id: number;
  private width: number;
  private height: number;
  private image: any;
  private orientation: string;
  private cameraParam: string;
  private cameraId: number;
  private cameraLoaded: boolean;
  private artoolkitNFT: delegateMethods;
  private listeners: object;
  private nftMarkers: object;
  private transform_mat: object;
  private marker_transform_mat: object;
  private transformGL_RH: object;
  private videoWidth: number;
  private videoHeight: number;
  private videoSize: number;
  private framepointer: number;
  private framesize: number;
  private dataHeap: Uint8Array;
  private videoLuma: Uint8Array;
  private camera_mat: object;
  private videoLumaPointer: number;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private nftMarkerFound: boolean;// = false
  private nftMarkerFoundTime: boolean;// = false
  private nftMarkerCount: number;// = 0

  private _bwpointer: boolean = false;
  constructor (width: number, height: number, cameraParam: string, options: object) {
    // read settings
    this.options = {...{
        canvas: null,
        orientation: 'landscape'
      },...options};

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
    this.marker_transform_mat = null

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

  static async initWithDimensions (width: number, height: number, cameraParam: string, options: object) {
    // directly init with given width / height
    const arControllerNFT = new ARControllerNFT(width, height, cameraParam, options)
    return await arControllerNFT._initialize()
  }

  static async initNFTWithImage (image: ImageObj, cameraParam: string, options: object) {
    const width = image.videoWidth || image.width
    const height = image.videoHeight || image.height
    const arControllerNFT = new ARControllerNFT(width, height, cameraParam, options)
    arControllerNFT.image = image
    return await arControllerNFT._initialize()
  }

  getCameraMatrix () {
    return this.camera_mat
  };

  /**
   * Sets the value of the near plane of the camera.
   * @param {number} value the value of the near plane
   * @return {number} 0 (void)
   */
  setProjectionNearPlane (value: number) {
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
  setProjectionFarPlane (value: number) {
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
  addEventListener(name: string, callback: object) {
    //@ts-ignore
    if(!this.listeners[name]) {
      //@ts-ignore
      this.listeners[name] = [];
    }
    //@ts-ignore
    this.listeners[name].push(callback);
  };

  /**
   * Dispatches the given event to all registered listeners on event.name.
   * @param {Object} event Event to dispatch.
   */
  dispatchEvent(event: { name: string; target: any }) {
    //@ts-ignore
    let listeners = this.listeners[event.name];
    if(listeners) {
      for(let i = 0; i < listeners.length; i++) {
        listeners[i].call(this, event);
      }
    }
  };

  /**
   * Loads an NFT marker from the given URL or data string
   * @param {string} urlOrData - The URL prefix or data of the NFT markers to load.
  */
  async loadNFTMarker (urlOrData: any) {
    let nft = await this.artoolkitNFT.addNFTMarker(this.id, urlOrData)
    this.nftMarkerCount = nft.id + 1
    return nft
  };

  async _initialize () {
    // initialize the toolkit
    this.artoolkitNFT = await new ARToolkitNFT().init()
    console.log(this.artoolkitNFT)
    console.log('[ARControllerNFT]', 'ARToolkitNFT initialized')
    // setup
    this.id = this.artoolkitNFT.setup(this.width, this.height, this.cameraId)
    console.log('[ARControllerNFT]', 'Got ID from setup', this.id)

    this._initNFT()

    let params = this.artoolkitNFT.frameMalloc
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
}