import ModuleLoader from './ModuleLoader'
import Utils from './Utils'

const UNKNOWN_MARKER = -1
const NFT_MARKER = 0

declare global {
  namespace NodeJS {
    interface Global {
       artoolkitNFT: any;
    }
  }
  interface Window {
    artoolkitNFT: any;
  }
}

interface runtimeInstanced {
  instance: any;
}

export default class ARToolkitNFT {
  static get UNKNOWN_MARKER () { return UNKNOWN_MARKER }
  static get NFT_MARKER () { return NFT_MARKER }

  public instance: any;
  private markerNFTCount: number;
  private cameraCount: number;
  private version: string;
  public setup: (width: number, height: number, cameraId: number) => number;
  public teardown: () => void;
  public setupAR2: (id: number) => void;
  public setDebugMode: (id: number, mode: boolean) => number;
  public getDebugMode: (id: number) => boolean;
  public getProcessingImage: (id: number) => number;
  public detectMarker: (id: number) => number;
  public detectNFTMarker: (id: number) => number;
  public getNFTMarker: (id: number, markerIndex: number) => number;
  public setLogLevel: (mode: boolean) => number;
  public getLogLevel: () => number;
  public frameMalloc: {
    framepointer: number;
    framesize: number;
    videoLumaPointer: number;
    camera: number;
    transform: number
  }
  public  NFTMarkerInfo: {
    error: number;
    found: number;
    id: number,
    pose: Float64Array;
  };
  public setProjectionNearPlane: (id: number, value: number) => void;
  public getProjectionNearPlane: (id: number) => number;
  public setProjectionFarPlane: (id: number, value: number) => void;
  public getProjectionFarPlane: (id: number) => number;
  public setThresholdMode: (id: number, mode: number) => number;
  public getThresholdMode: (id: number) => number;
  public setThreshold: (id: number, threshold: number) => number;
  public getThreshold: (id: number) => number;
  public setImageProcMode: (id: number, mode: number) => number;
  public getImageProcMode: (id: number) => number;


  // construction
  /**
   * The ARToolkitNFT constructor. It has no arguments.
   * These properties are initialized:
   * - instance
   * - markerNFTCount
   * - cameraCount
   * - version
   * A message is displayed in the browser console during the intitialization, for example:
   * "ARToolkitNFT 0.8.3"
   */
  constructor () {
    // reference to WASM module
    this.instance
    this.markerNFTCount = 0
    this.cameraCount = 0
    this.version = '0.8.2'
    console.info('ARToolkitNFT ', this.version)
  }

  // ---------------------------------------------------------------------------

  // initialization
  /**
   * Init the class injecting the Wasm Module, link the instanced methods and
   * create a global artoolkitNFT variable.
   * @return {object} the this object
   */
  public async init () {
     const runtime: runtimeInstanced = await ModuleLoader.init.catch((err: string) => {
      console.log(err);
      return Promise.reject(err)
    }).then((resolve: any) => {
      return resolve;
    })

    this.instance = runtime.instance;

    this._decorate()

    let scope = (typeof window !== 'undefined') ? window : global
    scope.artoolkitNFT = this

    return this
  }

  // private methods
  /**
   * Used internally to link the instance in the ModuleLoader to the
   * ARToolkitNFT internal methods.
   * @return {void}
   */
  private _decorate () {
    // add delegate methods
    [
      'setup',
      'teardown',

      'setupAR2',

      'setLogLevel',
      'getLogLevel',

      'setDebugMode',
      'getDebugMode',

      'getProcessingImage',

      'detectMarker',
      'detectNFTMarker',
      'getNFTMarker',

      'frameMalloc',
      'NFTMarkerInfo',

      'setProjectionNearPlane',
      'getProjectionNearPlane',

      'setProjectionFarPlane',
      'getProjectionFarPlane',

      'setThresholdMode',
      'getThresholdMode',

      'setThreshold',
      'getThreshold',

      'setImageProcMode',
      'getImageProcMode'
    ].forEach(method => {
      this.converter()[method] = this.instance[method]
    })

    // expose constants
    for (const co in this.instance) {
      if (co.match(/^AR/)) {
        this.converter()[co] = this.instance[co]
      }
    }
  }

  /**
   * Used internally to convert and inject code.
   * @return {this} the this object
   */
  private converter(): any {
    return this
  }

  // ---------------------------------------------------------------------------
  // public accessors
  //----------------------------------------------------------------------------
  /**
   * Load the camera, this is an important and required step, Internally fill
   * the ARParam struct.
   * @param {string} urlOrData: the camera parameter, usually a path to a .dat file
   * @return {number} a number, the internal id.
   */
  public async loadCamera (urlOrData: any): Promise<number> {
    const target = '/camera_param_' + this.cameraCount++

    let data

    if (urlOrData instanceof Uint8Array) {
      // assume preloaded camera params
      data = urlOrData
    } else {
      // fetch data via HTTP
      try { data = await Utils.fetchRemoteData(urlOrData) } catch (error) { throw error }
    }

    this._storeDataFile(data, target)

    // return the internal marker ID
    return this.instance._loadCamera(target)
  }

  /**
   * Load the NFT Marker (.fset, .iset and .fset3) in the code, Must be provided
   * the url of the file without the extension. If fails to load it raise an error.
   * @param {number} arId internal id
   * @param {string} url url of the descriptors files without ext
   */
  public async addNFTMarker (arId: number, url: string): Promise<{id: number}> {
    // url doesn't need to be a valid url. Extensions to make it valid will be added here
    const targetPrefix = '/markerNFT_' + this.markerNFTCount++
    const extensions = ['fset', 'iset', 'fset3']

    const storeMarker = async (ext: string) => {
      const fullUrl = url + '.' + ext
      const target = targetPrefix + '.' + ext
      const data = await Utils.fetchRemoteData(fullUrl)
      this._storeDataFile(data, target)
    }

    const promises = extensions.map(storeMarker, this)
    await Promise.all(promises)

    // return the internal marker ID
    return this.instance._addNFTMarker(arId, targetPrefix)
  }

  // ---------------------------------------------------------------------------

  // implementation
  /**
   * Used internally by LoadCamera and addNFTMarker methods
   * @return {void}
   */
  private _storeDataFile (data: Uint8Array, target: string) {
    // FS is provided by emscripten
    // Note: valid data must be in binary format encoded as Uint8Array
    this.instance.FS.writeFile(target, data, {
      encoding: 'binary'
    })
  }
}
