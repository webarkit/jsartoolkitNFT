import ModuleLoader from './ModuleLoader'
import Utils from './Utils'

const UNKNOWN_MARKER = -1
const NFT_MARKER = 0

export default class ARToolkitNFT {
  static get UNKNOWN_MARKER () { return UNKNOWN_MARKER }
  static get NFT_MARKER () { return NFT_MARKER }

  // construction
  constructor () {
    // reference to WASM module
    this.instance
    this.markerNFTCount = 0
    this.cameraCount = 0
    this.version = '0.8.1'
    console.info('ARToolkitNFT ', this.version)
  }

  // ---------------------------------------------------------------------------

  // initialization
  async init () {
    const runtime = await ModuleLoader.init()
    this.instance = runtime.instance
    this._decorate()

    // we're committing a cardinal sin here by exporting the instance into
    // the global namespace. all blame goes to the person who created that CPP
    // wrapper ARToolKitJS.cpp and introduced a global "artoolkitNFT" variable.
    const scope = (typeof window !== 'undefined') ? window : global
    scope.artoolkitNFT = this

    return this
  }

  _decorate () {
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
    ].forEach(method => {
      this[method] = this.instance[method]
    })

    // expose constants
    for (const co in this.instance) {
      if (co.match(/^AR/)) {
        this[co] = this.instance[co]
      }
    }
  }

  // ----------------------------------------------------------------------------

  // public accessors
  async loadCamera (urlOrData) {
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

  async addNFTMarker (arId, url) {
    // url doesn't need to be a valid url. Extensions to make it valid will be added here
    const targetPrefix = '/markerNFT_' + this.markerNFTCount++
    const extensions = ['fset', 'iset', 'fset3']

    const storeMarker = async function (ext) {
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

  _storeDataFile (data, target) {
    // FS is provided by emscripten
    // Note: valid data must be in binary format encoded as Uint8Array
    this.instance.FS.writeFile(target, data, {
      encoding: 'binary'
    })
  }
}
