const Module = require('../../build/artoolkitNFT_node_wasm.js');

console.log('This is a test importing artoolkitNFT_node_wasm with Nodejs')

var scope;
if (typeof global !== 'undefined') {
    scope = global;
} else {
    scope = self;
}

// ARToolKitNFT exported JS API
//
var artoolkitNFT = {

    UNKNOWN_MARKER: -1,
    NFT_MARKER: 0, // 0,

};

var FUNCTIONS = [
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
];

function runWhenLoaded() {
    FUNCTIONS.forEach(function (n) {
        artoolkitNFT[n] = Module[n];
    });

    for (var m in Module) {
        if (m.match(/^AR/))
            artoolkitNFT[m] = Module[m];
    }
}

/* Exports */
scope.artoolkitNFT = artoolkitNFT;

Module.onRuntimeInitialized = async function () {
    runWhenLoaded();

    console.log(artoolkitNFT);

    artoolkitNFT.setup(640, 480, 0);
}