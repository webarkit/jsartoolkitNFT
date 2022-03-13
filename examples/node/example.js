const ARToolKitNFT = require('../../node-src/ARToolkitNFT.js')

async function init(){
    let ar = await new ARToolKitNFT().init();
    console.log(ar);
    ar.artoolkitNFT.setup(640, 480, 1)
}

init()