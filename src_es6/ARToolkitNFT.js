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
  }

  // ---------------------------------------------------------------------------

  // initialization
  async init () {
    const runtime = await ModuleLoader.init()
    this.instance = runtime.instance
    this._decorate()

    // we're committing a cardinal sin here by exporting the instance into
    // the global namespace. all blame goes to the person who created that CPP
    // wrapper ARToolKitJS.cpp and introduced a global "artoolkit" variable.
    const scope = (typeof window !== 'undefined') ? window : global
    scope.artoolkitNFT = this;

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

  async addNFTMarker_new (arId, urlOrData) {
    const target = '/markerNFT_' + this.markerNFTCount++

    let data
    let filename1 = urlOrData + '.fset'
    let filename2 = urlOrData + '.iset'
    let filename3 = urlOrData + '.fset3'

    if (urlOrData.indexOf('\n') !== -1) {
      // assume text from a .patt file
      console.log('inside first');
      data = Promise.all([
        Utils.string2Uint8Data(filename1), //Utils.fetchRemoteData(filename1),
        Utils.string2Uint8Data(filename2), //Utils.fetchRemoteData(filename2),
        Utils.string2Uint8Data(filename3)  //Utils.fetchRemoteData(filename3)
      ])
    } else {
      // fetch data via HTTP
      try {
        //data = await Utils.fetchRemoteData(urlOrData)
        console.log('inside try');
        data = await Utils.fetchRemoteNFTData(urlOrData)

      } catch (error) { throw error }
    }

    this._storeDataFile(data, target)

    // return the internal marker ID
    return this.instance._addNFTMarker(arId, target)
  }

  async addNFTMarker_old1 (arId, urlOrData) {
    const target = '/markerNFT_' + this.markerNFTCount++

    let data
    let filename1 = urlOrData + '.fset'
    let filename2 = urlOrData + '.iset'
    let filename3 = urlOrData + '.fset3'

    if (urlOrData.indexOf('\n') !== -1) {
      // assume text from a .patt file
      console.log('inside first');
      data = Promise.all([
        Utils.string2Uint8Data(filename1), //Utils.fetchRemoteData(filename1),
        Utils.string2Uint8Data(filename2), //Utils.fetchRemoteData(filename2),
        Utils.string2Uint8Data(filename3)  //Utils.fetchRemoteData(filename3)
      ])
    } else {
      // fetch data via HTTP
      try {
        //data = await Utils.fetchRemoteData(urlOrData)
        console.log('inside try');
        data = await Utils.fetchRemoteNFTData(urlOrData)

      } catch (error) { throw error }
    }

    this._storeDataFile(data, target)

    // return the internal marker ID
    return this.instance._addNFTMarker(arId, target)
  }

  async addNFTMarker(arId, url, callback, onError) {
      var mId = this.markerNFTCount++;
      var prefix = '/markerNFT_' + mId;
      var filename1 = prefix + '.fset';
      var filename2 = prefix + '.iset';
      var filename3 = prefix + '.fset3';
      console.log(this);
      this.ajax(url + '.fset', filename1, function () {
          this.ajax(url + '.iset', filename2, function () {
              this.ajax(url + '.fset3', filename3, function () {
                  var id = this.instance._addNFTMarker(arId, prefix);
                  if (callback) callback(id);
              }, function (errorNumber) { if (onError) onError(errorNumber) });
          }, function (errorNumber) { if (onError) onError(errorNumber) });
      }, function (errorNumber) { if (onError) onError(errorNumber) });
  }

  ajax(url, target, callback, errorCallback) {
  }

  ajax(url, target, callback, errorCallback) {
    let oReq = new XMLHttpRequest();
    oReq.open('GET', url, true);
    oReq.responseType = 'arraybuffer'; // blob arraybuffer
    // let _this = this;
    let data;

    oReq.onload = function () {
      if (this.status == 200) {
        // console.log('ajax done for ', url);
        var arrayBuffer = oReq.response
        var byteArray = new Uint8Array(arrayBuffer);
        //ARToolkitNFT._writeByteArrayToFS(target, byteArray, callback);
        data = byteArray
        console.log(byteArray);
      }
      else {
        errorCallback(this.status)
      }
      //return data = byteArray
    }
    console.log(data);
    this._writeByteArrayToFS(target, data, callback);
    oReq.send()
  }

  static writeStringToFS(target, string, callback) {
      let byteArray = new Uint8Array(string.length);
      for (let i = 0; i < byteArray.length; i++) {
          byteArray[i] = string.charCodeAt(i) & 0xff;
      }
      this._writeByteArrayToFS(target, byteArray, callback);
  }

   _writeByteArrayToFS(target, byteArray, callback) {
     //console.log(ARToolkitNFT);
     console.log(this);
      this.instance.FS.writeFile(target, byteArray, { encoding: 'binary' });
      // console.log('FS written', target);

      callback(byteArray);
  }

  // ---------------------------------------------------------------------------

  // implementation

  _storeDataFile (data, target) {
    // FS is provided by emscripten
    // Note: valid data must be in binary format encoded as Uint8Array
    //console.log(this);
    this.instance.FS.writeFile(target, data, {
      encoding: 'binary'
    })
  }
}
