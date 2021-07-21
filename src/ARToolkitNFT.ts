/*
 *  ARToolkitNFT.ts
 *  JSARToolKitNFT
 *
 *  This file is part of JSARToolKitNFT - WebARKit.
 *
 *  JSARToolKitNFT is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  JSARToolKitNFT is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with JSARToolKitNFT.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  As a special exception, the copyright holders of this library give you
 *  permission to link this library with independent modules to produce an
 *  executable, regardless of the license terms of these independent modules, and to
 *  copy and distribute the resulting executable under terms of your choice,
 *  provided that you also meet, for each linked independent module, the terms and
 *  conditions of the license of that module. An independent module is a module
 *  which is neither derived from nor based on this library. If you modify this
 *  library, you may extend this exception to your version of the library, but you
 *  are not obligated to do so. If you do not wish to do so, delete this exception
 *  statement from your version.
 *
 *  Copyright 2020 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *
 */
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
  public getNFTData: (id: number) => number;
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
   * "ARToolkitNFT 0.9.1"
   */
  constructor () {
    // reference to WASM module
    this.instance
    this.markerNFTCount = 0
    this.cameraCount = 0
    this.version = '0.9.1'
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
      'getNFTData',

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
      'getImageProcMode',

      'StringList'
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
   * Load the NFT Markers (.fset, .iset and .fset3) in the code, Must be provided
   * the url of the file without the extension. If fails to load it raise an error.
   * @param {number} arId internal id
   * @param {Array<string>} urls  array of urls of the descriptors files without ext
   */

  public async addNFTMarkers(arId: number, urls: Array<string>): Promise<[{id: number}]> {
    // url doesn't need to be a valid url. Extensions to make it valid will be added here
    console.log(this.markerNFTCount);
    
    //const targetPrefix = '/markerNFT_' + this.markerNFTCount
    const extensions = ['fset', 'iset', 'fset3']
    let out;
    let prefixes: any = [];
    let vec;
    const markerIds: any = [];
    //prefixes.push(targetPrefix);
    for (var i = 0; i < urls.length; i++) {
      //this.markerNFTCount = i;
      const targetPrefix = '/markerNFT_' + this.markerNFTCount
      console.log(this.markerNFTCount);
      prefixes.push(targetPrefix);
        const url = urls[i];
        const storeMarker = async (ext: string) => {
          //prefixes.push(targetPrefix);
          const fullUrl = url + '.' + ext
          const target = targetPrefix + '.' + ext
          const data = await Utils.fetchRemoteData(fullUrl)
          this._storeDataFile(data, target)
          vec = new this.instance.StringList();
          const markerIds = [];
          for (let v = 0; v < prefixes.length; v++) {
            vec.push_back(prefixes[v]);    
          }
        }

        const promises = extensions.map(storeMarker, this)
        ++this.markerNFTCount;
    
        await Promise.all(promises)

        out = this.instance._addNFTMarkers(arId, vec)
        for (let i = 0; i < out.size(); i++) {
          markerIds.push(out.get(i));
        }
        //++this.markerNFTCount;
        console.log(this.markerNFTCount);

    }

    // return the internal marker ID
    return markerIds
  }

  public async addNFTMarkers2(arId: number, urls: Array<string>): Promise<[{id: number}]> {
    // url doesn't need to be a valid url. Extensions to make it valid will be added here
    let markerIds: any;
    const promises = urls.map(url =>{
      console.log(url); 
      this._storeNFTMarkers(arId, url)})
    console.log(promises);
    

    await Promise.all(promises).then((id)=> {markerIds = id})
    console.log( markerIds)

    // return the internal marker ID
    return markerIds
  }

  public addNFTMarkersnew(arId: number, urls: Array<string>, callback: (filename: any) => void, onError2: ( errorNumber: any) => void): [{id: number}] {
    var prefixes: any = [];
    var pending = urls.length * 3;
    var onSuccess = (filename: any) => {
        pending -= 1;
        if (pending === 0) {
            const vec = new this.instance.StringList();
            const markerIds = [];
            for (let i = 0; i < prefixes.length; i++) {
                vec.push_back(prefixes[i]);
            }
            var ret = this.instance._addNFTMarkers(arId, vec);
            for (let i = 0; i < ret.size(); i++) {
                markerIds.push(ret.get(i));
            }

            console.log("add nft marker ids: ", markerIds);
            if (callback) callback(markerIds);
        }
    }
    var onError = ( filename: any, errorNumber?: any) => {
        console.log("failed to load: ", filename);
        onError2(errorNumber);
    }

    for (var i = 0; i < urls.length; i++) {
        var url = urls[i];
        var prefix = '/markerNFT_' + this.markerNFTCount;
        prefixes.push(prefix);
        var filename1 = prefix + '.fset';
        var filename2 = prefix + '.iset';
        var filename3 = prefix + '.fset3';

        this.ajax(url + '.fset', filename1, onSuccess.bind(filename1), onError.bind(filename1));
        this.ajax(url + '.iset', filename2, onSuccess.bind(filename2), onError.bind(filename2));
        this.ajax(url + '.fset3', filename3, onSuccess.bind(filename3), onError.bind(filename3));
        this.markerNFTCount += 1;
    }
    let Ids: any = [];

    for (var i = 0; i < urls.length; ++i) {
      Ids.push(i)
    }
    console.log(Ids);

    return Ids
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

  /*private async storeMarker (url: string, targetPrefix: string, prefixes: any, ext: string): Promise<{id: number}> {
   return new Promise((resolve, reject) => {
    const fullUrl = url + '.' + ext
    const target = targetPrefix + '.' + ext
    const data = await Utils.fetchRemoteData(fullUrl)
    this._storeDataFile(data, target)
    const vec = new this.instance.StringList();
    for (let v = 0; v < prefixes.length; v++) {
      vec.push_back(prefixes[v]);    
      }
   })
  }*/

  private stM (url:string, ext: string): Promise<string> {
    const extensions = ['fset', 'iset', 'fset3']
    //let out;
    let prefixes: any = [];
    let vec;
    const markerIds: any = [];
    var oReq = new XMLHttpRequest();
    const targetPrefix = '/markerNFT_' + this.markerNFTCount++
    console.log(this.markerNFTCount);
    prefixes.push(targetPrefix);
    return new Promise(async(resolve, reject) => {  
      const fullUrl = url + '.' + ext
      const target = targetPrefix + '.' + ext
      const data = await Utils.fetchRemoteData(fullUrl)
      this._storeDataFile(data, target)
      vec = new this.instance.StringList();
      for (let v = 0; v < prefixes.length; v++) {
        vec.push_back(prefixes[v]);    
        } 
    })
  }

  private ajax(url: string, target: string, callback: (byteArray: Uint8Array) => void, errorCallback: (message: any) => void) {
    var oReq = new XMLHttpRequest();
        oReq.open('GET', url, true);
        oReq.responseType = 'arraybuffer'; // blob arraybuffer
        const writeByteArrayToFS = (target: string, byteArray: Uint8Array, callback: (byteArray: Uint8Array) => void) => {
          this.instance.FS.writeFile(target, byteArray, { encoding: 'binary' });
          // console.log('FS written', target);
  
          callback(byteArray);
        }

        oReq.onload = function () {
            if (this.status == 200) {
                // console.log('ajax done for ', url);
                var arrayBuffer = oReq.response;
                var byteArray = new Uint8Array(arrayBuffer);
                writeByteArrayToFS(target, byteArray, callback);
            }
            else {
                errorCallback(this.status);
            }
        };

        oReq.send();
  }



  private async _storeNFTMarkers (arId: number, url: string): Promise<{id: number}> {
    const extensions = ['fset', 'iset', 'fset3']
    let out;
    let prefixes: any = [];
    let vec;
    const markerIds: any = [];
    const targetPrefix = '/markerNFT_' + this.markerNFTCount++
    console.log(this.markerNFTCount);
    prefixes.push(targetPrefix);
    const storeMarker = async (ext: string) => {
      const fullUrl = url + '.' + ext
      const target = targetPrefix + '.' + ext
      const data = await Utils.fetchRemoteData(fullUrl)
      this._storeDataFile(data, target)
      vec = new this.instance.StringList();
      for (let v = 0; v < prefixes.length; v++) {
        vec.push_back(prefixes[v]);    
        }
    }

    const promises = extensions.map(storeMarker, this)
    
      await Promise.all(promises)

    out = this.instance._addNFTMarkers(arId, vec)
    //
    for (let i = 0; i < out.size(); i++) {
      markerIds.push(out.get(i));
    }
    console.log(markerIds);
    
    return {id: markerIds}
    //return this.instance._addNFTMarkers(arId, vec)
  }
}
