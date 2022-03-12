; (function () {
    'use strict'

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

    /* Exports */
    scope.artoolkitNFT = artoolkitNFT;

})();
