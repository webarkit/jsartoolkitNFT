const Module = require("../build/artoolkitNFT_node_wasm.js");
const Utils = require("./Utils");
const fs = require("fs");

class ARToolKitNFT {
  constructor() {
    this.instance;
    this.markerNFTCount = 0;
    this.cameraCount = 0;
    this.version = "1.1.0";
    console.info("ARToolkitNFT ", this.version);
  }
  // private method
  _initialize() {
    var artoolkitNFT = {
      UNKNOWN_MARKER: -1,
      NFT_MARKER: 0, // 0,
    };

    var FUNCTIONS = [
      "setup",
      "teardown",

      "setupAR2",

      "setLogLevel",
      "getLogLevel",

      "setDebugMode",
      "getDebugMode",

      "getProcessingImage",

      "detectMarker",
      "detectNFTMarker",
      "getNFTMarker",
      "getNFTData",

      "setProjectionNearPlane",
      "getProjectionNearPlane",

      "setProjectionFarPlane",
      "getProjectionFarPlane",

      "setThresholdMode",
      "getThresholdMode",

      "setThreshold",
      "getThreshold",

      "setImageProcMode",
      "getImageProcMode",
    ];

    function runWhenLoaded() {
      FUNCTIONS.forEach(function (n) {
        artoolkitNFT[n] = Module[n];
      });

      for (var m in Module) {
        if (m.match(/^AR/)) artoolkitNFT[m] = Module[m];
      }
    }

    return new Promise((resolve) => {
      Module.onRuntimeInitialized = async function () {
        runWhenLoaded();
        // need to wrap this in an object
        // otherwise it will cause Chrome to crash
        resolve(this);
      };
    });
  }
  async init() {
    this.artoolkitNFT = await this._initialize();
    let scope = typeof global !== "undefined" ? global : self;
    scope.artoolkitNFT = this;
    return this;
  }

  async loadCamera(urlOrData) {
    const target = "/camera_param_" + this.cameraCount++;
    let data;

    if (urlOrData instanceof Uint8Array) {
      // assume preloaded camera params
      data = urlOrData;
    } else {
      // fetch data via HTTP
      try {
        data = await Utils.fetchRemoteData(urlOrData);
      } catch (error) {
        throw error;
      }
    }

    this._storeDataFile(data, target);

    // return the internal marker ID
    return this.artoolkitNFT._loadCamera(target);
  }
  _storeDataFile(data, target) {
    // FS is provided by NodeJS
    // Note: valid data must be in binary format encoded as Uint8Array
    fs.writeFile(
      target,
      data,
      {
        encoding: "binary",
      },
      function (error) {
        console.log(error);
      }
    );
  }
}
module.exports = ARToolKitNFT;
