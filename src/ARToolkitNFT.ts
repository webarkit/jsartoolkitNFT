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

interface baseARTNFT {
  setup: {
    (width: number, height: number, cameraId: number): number
}
}

export default class ARToolkitNFT implements baseARTNFT {
  static get UNKNOWN_MARKER () { return UNKNOWN_MARKER }
  static get NFT_MARKER () { return NFT_MARKER }

  private instance: any;
  private markerNFTCount: number;
  private cameraCount: number;
  private version: string;
  public setup: (width: number, height: number, cameraId: number) => number;

  // construction
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
  public async init () {
     const runtime: runtimeInstanced = await ModuleLoader.init.catch((err: string) => {
      console.log(err);
      return Promise.reject(err)
    }).then((resolve: any) => {
      return resolve;
    })

    this.instance = runtime.instance;
    console.log(runtime);
    console.log(this.instance);

    this._decorate()

    let scope = (typeof window !== 'undefined') ? window : global
    scope.artoolkitNFT = this

    return this
  }

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
    ].forEach((method, id) => {
      this.setup = this.instance['setup']
    
      // @ts-ignore
      this[method] = this.instance[method]
      //this.setup = this.instance.setup
    })

    // expose constants
    for (const co in this.instance) {
      if (co.match(/^AR/)) {
        // @ts-ignore
        this[co] = this.instance[co]
      }
    }
  }

  // ----------------------------------------------------------------------------

  // public accessors
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

  public async addNFTMarker (arId: number, url: string) {
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

  private _storeDataFile (data: Uint8Array, target: string) {
    // FS is provided by emscripten
    // Note: valid data must be in binary format encoded as Uint8Array
    this.instance.FS.writeFile(target, data, {
      encoding: 'binary'
    })
  }
}
